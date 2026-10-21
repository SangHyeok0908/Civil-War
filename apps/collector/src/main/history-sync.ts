import { randomUUID } from "node:crypto";
import {
  ClientError,
  object,
  text,
  ROLES,
  validateRoles,
  type Credential,
  type CollectorMatch,
  type Member,
  type Role,
} from "../../../../packages/contracts/src/index";
import { normalizeMatch } from "../../../../packages/lcu/src/normalize-match";
import type { LcuClient, Account } from "./lcu-client";
import type { HttpServerApi } from "./server-api";
import { Outbox } from "./outbox";
import { Uploader } from "./uploader";
import type {
  Snapshot,
  SafeAccount,
  HistorySyncResult,
  MatchView,
} from "../preload/collector-api";
export class CollectorService {
  private credential: Credential | null = null;
  private account: Account | null = null;
  private knownPuuid: string | null = null;
  private accountError: string | null = null;
  private credentialError: string | null = null;
  private serverError: string | null = null;
  private querying = false;
  readonly uploader: Uploader;
  constructor(
    private lcu: Pick<LcuClient, "getAccount" | "listPastMatches" | "getMatch">,
    private api: Pick<
      HttpServerApi,
      "enroll" | "members" | "pending" | "get" | "ingest" | "confirm"
    >,
    private store: {
      load(): Promise<Credential | null>;
      save(c: Credential): Promise<void>;
    },
    readonly box: Outbox,
  ) {
    this.uploader = new Uploader(box, api, async () =>
      this.credential &&
      (!this.knownPuuid || this.knownPuuid === this.credential.puuid)
        ? this.credential
        : null,
    );
  }
  async initialize() {
    await this.initializeLocal();
    await this.refreshRemote();
    return this.snapshot();
  }
  async initializeLocal() {
    try {
      this.credential = await this.store.load();
    } catch (e) {
      this.credentialError = code(e);
    }
    await this.getAccount();
    return this.snapshot();
  }
  async refreshRemote() {
    if (this.credential) {
      try {
        await this.refreshMembers();
        await this.loadPendingMatches();
      } catch (e) {
        this.serverError = code(e);
      }
      await this.uploader.drainOutbox();
    }
    return this.snapshot();
  }
  async getAccount(): Promise<SafeAccount> {
    try {
      this.account = await this.lcu.getAccount();
      this.knownPuuid = this.account.puuid;
      if (
        this.accountError !== "REENROLL_REQUIRED" &&
        this.accountError !== "PROTECTION_UNAVAILABLE"
      )
        this.accountError = null;
    } catch (e) {
      this.account = null;
      this.accountError = code(e);
    }
    return this.safeAccount();
  }
  private safeAccount(): SafeAccount {
    return {
      connected: !!this.account,
      displayName: this.account?.displayName ?? null,
      enrolled: !!this.credential,
      code:
        this.credential &&
        this.knownPuuid &&
        this.credential.puuid !== this.knownPuuid
          ? "ACCOUNT_MISMATCH"
          : (this.credentialError ?? this.accountError),
    };
  }
  private actor() {
    if (!this.credential) throw new ClientError("ENROLL_REQUIRED");
    if (this.knownPuuid && this.knownPuuid !== this.credential.puuid)
      throw new ClientError("ACCOUNT_MISMATCH");
    return this.credential;
  }
  private async currentActor() {
    await this.getAccount();
    const actor = this.actor();
    if (!this.account)
      throw new ClientError(this.accountError ?? "CLIENT_NOT_RUNNING");
    return actor;
  }
  private async refreshMembers() {
    const actor = this.actor();
    try {
      const members = await this.api.members(actor);
      if (!Array.isArray(members))
        throw new ClientError("INVALID_SERVER_RESPONSE");
      this.box.cache("members:" + actor.memberId, members);
      this.serverError = null;
      return members;
    } catch (e) {
      this.serverError = code(e);
      if (
        e instanceof ClientError &&
        e.status > 0 &&
        e.status < 500 &&
        e.status !== 429
      )
        throw e;
      const cached = this.box.cached<Member[]>("members:" + actor.memberId);
      if (!cached) throw new ClientError("ROSTER_UNAVAILABLE");
      return cached;
    }
  }
  async enroll(codeValue: string) {
    text(codeValue, 100);
    await this.getAccount();
    if (!this.account)
      throw new ClientError(this.accountError ?? "CLIENT_NOT_RUNNING");
    const account = this.account;
    if (
      this.box
        .listOutbox()
        .some((i) => i.state !== "succeeded" && i.puuid !== account.puuid)
    )
      throw new ClientError("PENDING_OWNER_MISMATCH");
    const c = await this.api.enroll(codeValue, account.puuid);
    for (const key of ["token", "memberId", "credentialId", "puuid"] as const)
      text(c[key]);
    if (c.puuid !== account.puuid) throw new ClientError("ACCOUNT_MISMATCH");
    if (
      this.box
        .listOutbox()
        .some(
          (i) =>
            i.state !== "succeeded" &&
            (i.memberId !== c.memberId || i.puuid !== c.puuid),
        )
    )
      throw new ClientError("PENDING_OWNER_MISMATCH");
    await this.store.save(c);
    this.credential = c;
    this.credentialError = null;
    this.accountError = null;
    await this.refreshMembers();
    await this.loadPendingMatches();
    return this.snapshot();
  }
  async resumeOwnRequests() {
    await this.getAccount();
    const actor = this.actor();
    const members = await this.api.members(actor);
    if (
      !members.some((m) => m.id === actor.memberId && m.puuid === actor.puuid)
    )
      throw new ClientError("ACCOUNT_MISMATCH");
    this.box.resumeVerified(actor);
    await this.uploader.drainOutbox();
    return this.snapshot();
  }
  async loadPendingMatches(): Promise<Snapshot> {
    const actor = this.actor();
    try {
      const records = await this.api.pending(actor);
      for (const record of records) {
        if (!record.match.participants.some((p) => p.puuid === actor.puuid))
          throw new ClientError("INVALID_SERVER_RESPONSE");
        this.box.saveMatch(actor, record);
      }
      for (const local of this.box.matches(actor)) {
        if (records.some((r) => r.matchKey === local.matchKey)) continue;
        try {
          const current = await this.api.get(local.matchKey, actor);
          if (!current.match.participants.some((p) => p.puuid === actor.puuid))
            throw new ClientError("INVALID_SERVER_RESPONSE");
          this.box.saveMatch(actor, current);
        } catch (e) {
          if (!(e instanceof ClientError && e.status === 404)) throw e;
        }
      }
      this.serverError = null;
    } catch (e) {
      this.serverError = code(e);
      if (
        e instanceof ClientError &&
        e.status > 0 &&
        e.status < 500 &&
        e.status !== 429
      )
        throw e;
    }
    return this.snapshot();
  }
  async queryPastMatches(): Promise<HistorySyncResult> {
    if (this.querying) throw new ClientError("QUERY_BUSY");
    this.querying = true;
    try {
      const actor = await this.currentActor();
      // A healthy cached roster makes collection independent of remote latency.
      const members =
        this.box.cached<Member[]>("members:" + actor.memberId) ??
        (await this.refreshMembers());
      void this.refreshMembers().catch(() => {});
      const ids = await this.lcu.listPastMatches(actor.puuid);
      const results: HistorySyncResult["results"] = [];
      for (const id of ids) {
        let matchKey: string | null = null;
        try {
          const capture = await this.lcu.getMatch(id);
          const match = normalizeMatch(capture.rawMatch);
          matchKey = match.platformId + ":" + match.gameId;
          if (match.gameId !== id) throw new ClientError("INVALID_MATCH");
          if (!match.participants.some((p) => p.puuid === actor.puuid))
            throw new ClientError("ACCOUNT_MISMATCH");
          if (
            match.participants.some(
              (p) => !members.some((m) => m.puuid === p.puuid),
            )
          )
            throw new ClientError("UNREGISTERED_PARTICIPANT");
          const current = await this.currentActor();
          if (
            current.memberId !== actor.memberId ||
            current.puuid !== actor.puuid
          )
            throw new ClientError("ACCOUNT_MISMATCH");
          try {
            this.box.enqueueCollected(
              {
                schemaVersion: 1,
                ...capture,
                clientSubmissionId: randomUUID(),
              },
              actor,
              match,
            );
          } catch {
            throw new ClientError("LOCAL_SAVE_FAILED");
          }
          results.push({ matchKey, code: null });
        } catch (e) {
          results.push({ matchKey, code: code(e) });
        }
      }
      await this.uploader.drainOutbox();
      await this.loadPendingMatches();
      return { results, snapshot: await this.snapshot() };
    } finally {
      this.querying = false;
    }
  }
  async saveDraft(key: string, roles: Record<string, Role>) {
    const actor = this.actor();
    const record = this.box.matches(actor).find((m) => m.matchKey === key);
    if (!record || record.state !== "pending")
      throw new ClientError("INVALID_STATE");
    const values = object(roles);
    if (
      Object.keys(values).length > 10 ||
      Object.entries(values).some(
        ([puuid, role]) =>
          !record.match.participants.some((p) => p.puuid === puuid) ||
          !ROLES.includes(role),
      )
    )
      throw new ClientError("INVALID_ROLES");
    this.box.cache("draft:" + actor.memberId + ":" + key, values);
    return this.snapshot();
  }
  async confirmRegistration(
    key: string,
    roles: Record<string, Role> | Record<string, string>,
    inhouse: boolean,
  ) {
    await this.getAccount();
    const actor = this.actor();
    if (inhouse !== true) throw new ClientError("INHOUSE_REQUIRED");
    const record = this.box.matches(actor).find((m) => m.matchKey === key);
    if (!record) throw new ClientError("NOT_FOUND");
    validateRoles(record.match, roles);
    try {
      this.box.enqueueConfirmation(
        key,
        { rolesByPuuid: roles, clientSubmissionId: randomUUID() },
        actor,
      );
    } catch (e) {
      if (e instanceof ClientError) throw e;
      throw new ClientError("LOCAL_SAVE_FAILED");
    }
    await this.uploader.drainOutbox();
    return this.snapshot();
  }
  async tick() {
    await this.getAccount();
    await this.uploader.drainOutbox();
  }
  async snapshot(): Promise<Snapshot> {
    const actor = this.credential;
    if (!actor)
      return {
        account: this.safeAccount(),
        matches: [],
        serverError: this.serverError,
      };
    const members =
      this.box.cached<Member[]>("members:" + actor.memberId) ?? [];
    const jobs = this.box
      .listOutbox()
      .filter((i) => i.memberId === actor.memberId && i.puuid === actor.puuid);
    const matches = this.box.matches(actor).map((record) => {
      const relevant = jobs.filter((j) => j.matchKey === record.matchKey);
      const failed = relevant.find((j) => j.state === "needs_attention");
      const confirmation = relevant.find((j) => j.kind === "confirm");
      const ingest = relevant.find((j) => j.kind === "ingest");
      let status: MatchView["status"] =
        record.state === "registered"
          ? "등록 완료"
          : record.state === "canceled"
            ? "등록 취소"
            : failed
              ? "확인 필요"
              : confirmation && confirmation.state !== "succeeded"
                ? "등록 대기"
                : ingest && ingest.state !== "succeeded"
                  ? "전송 대기"
                  : "확인 대기";
      const roles =
        record.state === "registered"
          ? (record.confirmedRoles ?? {})
          : (confirmation?.payload.rolesByPuuid ??
            this.box.cached<Record<string, Role>>(
              "draft:" + actor.memberId + ":" + record.matchKey,
            ) ??
            {});
      return {
        matchKey: record.matchKey,
        state: record.state,
        status,
        match: record.match,
        roles,
        names: Object.fromEntries(
          record.match.participants.map((p) => [
            p.puuid,
            members.find((m) => m.puuid === p.puuid)?.displayName ??
              "회원 정보 없음",
          ]),
        ),
        error: failed?.error ?? null,
      };
    });
    return {
      account: this.safeAccount(),
      matches,
      serverError: this.serverError,
    };
  }
}
function code(e: unknown) {
  return e instanceof ClientError ? e.code : "LOCAL_ERROR";
}
