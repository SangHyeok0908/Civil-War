import { randomUUID } from "node:crypto";
import {
  ClientError,
  object,
  text,
  ROLES,
  validateRoles,
  type Credential,
  type EvaluationProgress,
  type TransferProgress,
  type CollectorMatch,
  type Member,
  type Role,
} from "../../../../packages/contracts/src/index";
import { normalizeMatch } from "../../../../packages/lcu/src/normalize-match";
import type { LcuClient, Account } from "./lcu-client";
import type { HttpServerApi } from "./server-api";
import { Outbox } from "./outbox";
import { Uploader } from "./uploader";
import {
  DISPLAY_STATES,
  type MatchCategory,
  type Snapshot,
  type SafeAccount,
  type HistorySyncResult,
  type MatchView,
  type QueryProgress,
} from "../preload/collector-api";
export class CollectorService {
  private credential: Credential | null = null;
  private account: Account | null = null;
  private knownPuuid: string | null = null;
  private accountError: string | null = null;
  private credentialError: string | null = null;
  private serverError: string | null = null;
  private querying = false;
  private progressPoll: Promise<void> | null = null;
  private nextProgressAt = 0;
  private nextResumeAt = 0;
  private resuming: Promise<void> | null = null;
  private ticking: Promise<void> | null = null;
  readonly uploader: Uploader;
  // 화면에 조회 진행 상황을 알린다. 완료 시각은 추측하지 않고 현재 작업만 전한다.
  onQueryProgress: (progress: QueryProgress) => void = () => {};
  constructor(
    private lcu: Pick<
      LcuClient,
      "getAccount" | "listPastMatches" | "getMatch" | "getIdentity"
    >,
    private api: Pick<
      HttpServerApi,
      | "enroll"
      | "members"
      | "pending"
      | "get"
      | "ingest"
      | "confirm"
      | "observations"
      | "progress"
    >,
    private store: {
      load(): Promise<Credential | null>;
      save(c: Credential): Promise<void>;
    },
    readonly box: Outbox,
  ) {
    this.uploader = new Uploader(
      box,
      api,
      async () =>
        this.credential &&
        (!this.knownPuuid || this.knownPuuid === this.credential.puuid) &&
        !["AUTH_REVOKED", "COLLECTOR_UPDATE_REQUIRED"].includes(
          this.credentialError ?? "",
        )
          ? this.credential
          : null,
      Date.now,
      Math.random,
      (failedActor) => {
        if (this.credential?.credentialId === failedActor.credentialId)
          this.credentialError = "AUTH_REVOKED";
      },
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
    const actor = this.credential;
    if (actor) {
      try {
        await this.refreshMembers();
        await this.loadPendingMatches();
      } catch (e) {
        if (this.credential === actor) {
          this.serverError = code(e);
          if (
            e instanceof ClientError &&
            ["AUTH_REVOKED", "COLLECTOR_UPDATE_REQUIRED"].includes(e.code)
          )
            this.credentialError = e.code;
        }
      }
      await this.resumeAutomatically();
      await this.uploader.drainOutbox();
      await this.refreshProgress(true);
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
      expectedDisplayName: this.credential
        ? (this.box
            .cached<Member[]>("members:" + this.credential.memberId)
            ?.find((m) => m.id === this.credential!.memberId)?.riotId ?? null)
        : null,
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
      if (this.credential === actor) this.serverError = null;
      return members;
    } catch (e) {
      if (this.credential === actor) {
        this.serverError = code(e);
        if (
          e instanceof ClientError &&
          ["AUTH_REVOKED", "COLLECTOR_UPDATE_REQUIRED"].includes(e.code)
        )
          this.credentialError = e.code;
      }
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
    if (!account.identity) throw new ClientError("ACCOUNT_EVIDENCE_REQUIRED");
    const c = await this.api.enroll(codeValue, account.identity);
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
    await this.resumeAutomatically(true);
    await this.uploader.drainOutbox();
    return this.snapshot();
  }
  private async resumeAutomatically(force = false): Promise<void> {
    if (this.resuming) return this.resuming;
    if (
      !this.credential ||
      !this.account ||
      this.account.puuid !== this.credential.puuid ||
      ["AUTH_REVOKED", "COLLECTOR_UPDATE_REQUIRED"].includes(
        this.credentialError ?? "",
      )
    )
      return;
    const actor = this.credential;
    const recoverable = [
      "AUTH_REVOKED",
      "ACCOUNT_MISMATCH",
      "CREDENTIAL_CHANGED",
    ];
    const paused = this.box
      .listOutbox()
      .some(
        (item) =>
          item.memberId === actor.memberId &&
          item.puuid === actor.puuid &&
          item.state !== "succeeded" &&
          (item.credentialId !== actor.credentialId ||
            recoverable.includes(item.error ?? "")),
      );
    if (!paused || (!force && Date.now() < this.nextResumeAt)) return;
    this.nextResumeAt = Date.now() + 15000;
    this.resuming = (async () => {
      try {
        const members = await this.api.members(actor);
        if (
          !members.some(
            (m) => m.id === actor.memberId && m.puuid === actor.puuid,
          )
        )
          throw new ClientError("ACCOUNT_MISMATCH");
        // Recheck after the remote await: an account/code change must not release another owner's jobs.
        if (
          this.credential !== actor ||
          !this.account ||
          this.account.puuid !== actor.puuid
        )
          return;
        this.box.cache("members:" + actor.memberId, members);
        this.box.resumeVerified(actor);
        this.serverError = null;
        if (this.credentialError === "ACCOUNT_MISMATCH")
          this.credentialError = null;
        this.nextResumeAt = 0;
      } catch (e) {
        if (this.credential !== actor) return;
        const failure = code(e);
        this.serverError = failure;
        if (
          [
            "AUTH_REVOKED",
            "COLLECTOR_UPDATE_REQUIRED",
            "ACCOUNT_MISMATCH",
          ].includes(failure)
        )
          this.credentialError = failure;
      }
    })().finally(() => {
      this.resuming = null;
    });
    return this.resuming;
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
      if (this.credential === actor) this.serverError = null;
    } catch (e) {
      if (this.credential === actor) {
        this.serverError = code(e);
        if (
          e instanceof ClientError &&
          ["AUTH_REVOKED", "COLLECTOR_UPDATE_REQUIRED"].includes(e.code)
        )
          this.credentialError = e.code;
      }
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
      let members =
        this.box.cached<Member[]>("members:" + actor.memberId) ??
        (await this.refreshMembers());
      void this.refreshMembers().catch(() => {});
      this.onQueryProgress({ phase: "listing" });
      const listing = await this.lcu.listPastMatches(actor.puuid);
      const results: HistorySyncResult["results"] = [];
      for (const id of listing.ids) {
        this.onQueryProgress({
          phase: "matches",
          current: results.length + 1,
          total: listing.ids.length,
        });
        let matchKey: string | null = null;
        try {
          const capture = await this.lcu.getMatch(id);
          const match = normalizeMatch(capture.rawMatch);
          matchKey = match.platformId + ":" + match.gameId;
          if (match.gameId !== id) throw new ClientError("INVALID_MATCH");
          if (!match.participants.some((p) => p.puuid === actor.puuid))
            throw new ClientError("ACCOUNT_MISMATCH");
          const cachedEligible =
            new Set(
              match.participants
                .filter((p) => members.some((m) => m.puuid === p.puuid))
                .map((p) => p.puuid),
            ).size >= 6;
          const stage = () => {
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
          };
          if (cachedEligible) {
            const current = await this.currentActor();
            if (
              current.memberId !== actor.memberId ||
              current.puuid !== actor.puuid
            ) {
              throw new ClientError("ACCOUNT_MISMATCH");
            }
            stage();
          }
          const identities = [];
          for (const p of match.participants) {
            try {
              identities.push(await this.lcu.getIdentity(p.puuid));
            } catch {}
          }
          if (identities.length) {
            await this.api.observations(capture.rawMatch, identities, actor);
            members = await this.refreshMembers();
          }
          if (
            new Set(
              match.participants
                .filter((p) => members.some((m) => m.puuid === p.puuid))
                .map((p) => p.puuid),
            ).size < 6
          )
            throw new ClientError("INSUFFICIENT_REGISTERED_PARTICIPANTS");
          const current = await this.currentActor();
          if (
            current.memberId !== actor.memberId ||
            current.puuid !== actor.puuid
          )
            throw new ClientError("ACCOUNT_MISMATCH");
          if (!cachedEligible) stage();
          results.push({ matchKey, code: null });
        } catch (e) {
          results.push({ matchKey, code: code(e) });
        }
      }
      this.onQueryProgress({ phase: "sending" });
      await this.uploader.drainOutbox();
      await this.loadPendingMatches();
      return {
        results,
        warningCode: listing.warningCode,
        snapshot: await this.snapshot(),
      };
    } finally {
      this.querying = false;
    }
  }
  async saveDraft(key: string, roles: Record<string, Role | null>) {
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
          (role !== null && !ROLES.includes(role)),
      )
    )
      throw new ClientError("INVALID_ROLES");
    const draftKey = "draft:" + actor.memberId + ":" + key;
    this.box.cache(draftKey, {
      ...this.box.cached<Record<string, Role | null>>(draftKey),
      ...values,
    });
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
    await this.refreshProgress(true);
    return this.snapshot();
  }
  async tick(): Promise<void> {
    if (this.ticking) return this.ticking;
    this.ticking = (async () => {
      await this.getAccount();
      if (
        this.credential &&
        this.knownPuuid &&
        this.credential.puuid !== this.knownPuuid
      )
        return;
      await this.resumeAutomatically();
      await this.uploader.drainOutbox();
      await this.refreshProgress();
    })().finally(() => {
      this.ticking = null;
    });
    return this.ticking;
  }
  async refreshProgress(force = false): Promise<void> {
    if (this.progressPoll) return this.progressPoll;
    if (
      !this.credential ||
      this.credentialError === "AUTH_REVOKED" ||
      (!force && Date.now() < this.nextProgressAt)
    )
      return;
    const actor = this.credential,
      records = this.box.matches(actor).filter((m) => m.state === "registered");
    this.nextProgressAt = Date.now() + 5000;
    this.progressPoll = (async () => {
      try {
        for (let start = 0; start < records.length; start += 100) {
          const results = await this.api.progress(
            records.slice(start, start + 100).map((m) => m.matchKey),
            actor,
          );
          for (const p of results) {
            const local = this.box
              .matches(actor)
              .find((m) => m.matchKey === p.matchKey);
            if (local && p.registrationState === "canceled") {
              this.box.saveMatch(actor, { ...local, state: "canceled" });
            }
            this.box.cache(
              "progress:" + actor.memberId + ":" + p.matchKey,
              p.evaluation,
            );
          }
        }
      } catch (e) {
        if (this.credential !== actor) return;
        this.nextProgressAt = Date.now() + 15000;
        for (const record of records) {
          const key = "progress:" + actor.memberId + ":" + record.matchKey;
          const old = this.box.cached<EvaluationProgress>(key);
          if (old)
            this.box.cache(key, {
              ...old,
              lastKnownStatus:
                old.status === "unknown" ? old.lastKnownStatus : old.status,
              status: "unknown",
              unavailable: true,
            });
        }
        if (e instanceof ClientError && e.code === "AUTH_REVOKED")
          this.credentialError = e.code;
      }
    })().finally(() => {
      this.progressPoll = null;
    });
    return this.progressPoll;
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
      const category: MatchCategory =
        record.state === "registered"
          ? "registered"
          : record.state === "canceled"
            ? "canceled"
            : failed
              ? "action_required"
              : confirmation && confirmation.state !== "succeeded"
                ? "registering"
                : ingest && ingest.state !== "succeeded"
                  ? "upload_pending"
                  : "review_pending";
      const status = DISPLAY_STATES[category];
      const manualRoles =
        this.box.cached<Record<string, Role | null>>(
          "draft:" + actor.memberId + ":" + record.matchKey,
        ) ?? {};
      const suggested = Object.fromEntries(
        (record.roleSuggestions ?? [])
          .filter((s) => s.role !== null)
          .map((s) => [s.puuid, s.role as Role]),
      );
      for (const [id, role] of Object.entries(manualRoles)) {
        if (role === null) delete suggested[id];
        else suggested[id] = role;
      }
      const roles: Record<string, Role> =
        record.state === "registered"
          ? (record.confirmedRoles ?? {})
          : (confirmation?.payload.rolesByPuuid ?? suggested);
      const job =
        confirmation && confirmation.state !== "succeeded"
          ? confirmation
          : ingest;
      const transfer: TransferProgress | undefined = job
        ? {
            phase:
              job.state === "succeeded"
                ? "done"
                : job.state === "needs_attention"
                  ? "action_required"
                  : job.state === "sending"
                    ? job.phase === "checking"
                      ? "checking"
                      : "sending"
                    : job.nextAt > Date.now()
                      ? "retry_wait"
                      : "queued",
            attempt: job.attempts,
            lastAttemptAt: job.lastAttemptAt,
            nextRetryAt: job.nextAt || undefined,
            errorCode: job.error ?? undefined,
          }
        : undefined;
      const observed = this.box.cached<EvaluationProgress>(
        "progress:" + actor.memberId + ":" + record.matchKey,
      );
      const evaluation =
        record.state === "registered"
          ? observed
            ? Date.now() - Date.parse(observed.observedAt) > 15000
              ? { ...observed, status: "unknown" as const, unavailable: true }
              : observed
            : {
                status: "unknown" as const,
                targetRevision: 0,
                scoringVersion: null,
                observedAt: "",
                unavailable: true,
              }
          : undefined;
      return {
        matchKey: record.matchKey,
        state: record.state,
        status,
        category,
        match: record.match,
        roles,
        transfer,
        evaluation,
        manualRoles,
        roleSuggestions: record.roleSuggestions ?? [],
        names: Object.fromEntries(
          record.match.participants.map((p) => [
            p.puuid,
            members.find((m) => m.puuid === p.puuid)?.displayName ?? "게스트",
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
