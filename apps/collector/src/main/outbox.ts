import { DatabaseSync } from "node:sqlite";
import { migration } from "./outbox-migrations";
import {
  ClientError,
  validateRoles,
  type CollectorPrincipal,
  type CollectorMatch,
  type IngestMatchInput,
  type ConfirmationInput,
  type NormalizedMatch,
} from "../../../../packages/contracts/src/index";
export interface OutboxItem extends CollectorPrincipal {
  id: number;
  matchKey: string;
  kind: "ingest" | "confirm";
  state: "pending" | "sending" | "succeeded" | "needs_attention";
  payload: any;
  dependency: number | null;
  attempts: number;
  nextAt: number;
  error: string | null;
}
export class Outbox {
  readonly db: DatabaseSync;
  private closed = false;
  constructor(readonly path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    const version = (this.db.prepare("PRAGMA user_version").get() as any)
      .user_version;
    if (version > 1) throw new ClientError("DATABASE_VERSION");
    this.db.exec(migration);
    this.db.exec("UPDATE outbox SET state='pending' WHERE state='sending'");
  }
  close() {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  cache(key: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO metadata VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
  cached<T>(key: string): T | null {
    const row = this.db
      .prepare("SELECT value FROM metadata WHERE key=?")
      .get(key) as any;
    return row ? JSON.parse(row.value) : null;
  }
  listOutbox(): OutboxItem[] {
    return (
      this.db.prepare("SELECT * FROM outbox ORDER BY id").all() as any[]
    ).map((r) => ({
      id: r.id,
      memberId: r.member_id,
      credentialId: r.credential_id,
      puuid: r.puuid,
      matchKey: r.match_key,
      kind: r.kind,
      state: r.state,
      payload: JSON.parse(r.payload),
      dependency: r.dependency,
      attempts: r.attempts,
      nextAt: r.next_at,
      error: r.error,
    }));
  }
  matches(actor: CollectorPrincipal): CollectorMatch[] {
    return (
      this.db
        .prepare(
          "SELECT record FROM matches WHERE member_id=? AND puuid=? ORDER BY updated_at DESC",
        )
        .all(actor.memberId, actor.puuid) as any[]
    ).map((r) => JSON.parse(r.record));
  }
  saveMatch(actor: CollectorPrincipal, record: CollectorMatch) {
    // Late server responses must not undo registration or cancellation.
    this.db
      .prepare(
        `INSERT INTO matches VALUES (?,?,?,?,?)
         ON CONFLICT(member_id,match_key) DO UPDATE
         SET record=excluded.record,updated_at=excluded.updated_at
         WHERE CASE json_extract(excluded.record,'$.state')
           WHEN 'pending' THEN 0 WHEN 'registered' THEN 1 WHEN 'canceled' THEN 2 END
         >= CASE json_extract(matches.record,'$.state')
           WHEN 'pending' THEN 0 WHEN 'registered' THEN 1 WHEN 'canceled' THEN 2 END`,
      )
      .run(
        actor.memberId,
        actor.puuid,
        record.matchKey,
        JSON.stringify(record),
        Date.now(),
      );
  }
  enqueueCollected(
    input: IngestMatchInput,
    actor: CollectorPrincipal,
    match: NormalizedMatch,
  ): OutboxItem {
    return this.transaction(() => {
      const key = match.platformId + ":" + match.gameId;
      const existing = this.listOutbox().find(
        (x) =>
          x.memberId === actor.memberId &&
          x.matchKey === key &&
          x.kind === "ingest",
      );
      if (existing) return existing;
      const known = this.matches(actor).find(
        (record) => record.matchKey === key,
      );
      if (!known)
        this.saveMatch(actor, {
          matchKey: key,
          state: "pending",
          match,
          confirmedRoles: null,
        });
      return this.enqueue("ingest", key, input, actor, null);
    });
  }
  enqueueConfirmation(
    key: string,
    input: ConfirmationInput,
    actor: CollectorPrincipal,
  ): OutboxItem {
    return this.transaction(() => {
      const record = this.matches(actor).find((x) => x.matchKey === key);
      if (!record || record.state !== "pending")
        throw new ClientError("INVALID_STATE");
      validateRoles(record.match, input.rolesByPuuid);
      if (!record.match.participants.some((p) => p.puuid === actor.puuid))
        throw new ClientError("ACCOUNT_MISMATCH");
      const existing = this.listOutbox().find(
        (x) =>
          x.memberId === actor.memberId &&
          x.matchKey === key &&
          x.kind === "confirm",
      );
      if (existing) return existing;
      const ingest = this.listOutbox().find(
        (x) =>
          x.memberId === actor.memberId &&
          x.matchKey === key &&
          x.kind === "ingest",
      );
      return this.enqueue("confirm", key, input, actor, ingest?.id ?? null);
    });
  }
  private enqueue(
    kind: "ingest" | "confirm",
    key: string,
    payload: unknown,
    actor: CollectorPrincipal,
    dependency: number | null,
  ): OutboxItem {
    const result = this.db
      .prepare(
        "INSERT INTO outbox(member_id,credential_id,puuid,match_key,kind,state,payload,dependency,created_at) VALUES (?,?,?,?,?,'pending',?,?,?)",
      )
      .run(
        actor.memberId,
        actor.credentialId,
        actor.puuid,
        key,
        kind,
        JSON.stringify(payload),
        dependency,
        Date.now(),
      );
    return this.listOutbox().find(
      (x) => x.id === Number(result.lastInsertRowid),
    )!;
  }
  mark(
    id: number,
    state: OutboxItem["state"],
    error: string | null = null,
    nextAt = 0,
  ) {
    this.db
      .prepare(
        "UPDATE outbox SET state=?,error=?,next_at=?,attempts=attempts+CASE WHEN ?='sending' THEN 1 ELSE 0 END,finished_at=CASE WHEN ?='succeeded' THEN ? ELSE finished_at END WHERE id=?",
      )
      .run(state, error, nextAt, state, state, Date.now(), id);
  }
  allowed(item: OutboxItem, actor: CollectorPrincipal) {
    return (
      item.memberId === actor.memberId &&
      item.puuid === actor.puuid &&
      (item.credentialId === actor.credentialId ||
        !!this.db
          .prepare(
            "SELECT 1 FROM rotations WHERE member_id=? AND puuid=? AND old_credential=? AND new_credential=?",
          )
          .get(
            actor.memberId,
            actor.puuid,
            item.credentialId,
            actor.credentialId,
          ))
    );
  }
  resumeVerified(actor: CollectorPrincipal) {
    this.transaction(() => {
      for (const item of this.listOutbox()) {
        if (
          item.memberId !== actor.memberId ||
          item.puuid !== actor.puuid ||
          item.state === "succeeded"
        )
          continue;
        this.db
          .prepare("INSERT OR IGNORE INTO rotations VALUES (?,?,?,?)")
          .run(
            actor.memberId,
            actor.puuid,
            item.credentialId,
            actor.credentialId,
          );
        if (
          ["AUTH_REVOKED", "ACCOUNT_MISMATCH", "CREDENTIAL_CHANGED"].includes(
            item.error ?? "",
          )
        )
          this.mark(item.id, "pending");
      }
    });
  }
  cleanup(now = Date.now()) {
    this.db
      .prepare(
        "UPDATE outbox SET payload='{}' WHERE kind='ingest' AND state='succeeded' AND finished_at<? AND EXISTS(SELECT 1 FROM matches m WHERE m.member_id=outbox.member_id AND m.match_key=outbox.match_key AND json_extract(m.record,'$.state')='registered')",
      )
      .run(now - 30 * 86400000);
  }
}
