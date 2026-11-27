import {
  ClientError,
  ROLES,
  type Credential,
} from "../../../../packages/contracts/src/index";
import { rawRoleSuggestions } from "../../../../packages/lcu/src/role-hints";
import { normalizeMatch } from "../../../../packages/lcu/src/normalize-match";
import fixtureRaw from "../../../../fixtures/lcu/candidates/h2-20261021/G1.json";
import { CollectorService } from "./history-sync";
import type { Outbox } from "./outbox";
// Development-only fixture wiring; never talks to LCU, Riot, or a live server.
export function fixtureService(box: Outbox, mode: string) {
  const raw: any = structuredClone(fixtureRaw);
  if (mode === "hints-guests") {
    raw.participants[0].timeline = { lane: "TOP", role: "SOLO" };
    raw.participants[3].timeline = { lane: "BOTTOM", role: "DUO" };
  }
  if (mode === "champion") raw.participants[0].championId = 67;
  const match = normalizeMatch(raw);
  const key = "KR:" + match.gameId;
  let actor: Credential = {
    memberId: "m0",
    credentialId: "c0",
    puuid: match.participants[0].puuid,
    token: "fixture-main-only",
  };
  const roles = Object.fromEntries(
    match.participants.map((p, i) => [p.puuid, ROLES[i % 5]]),
  );
  const control = {
    offline:
      mode === "offline" || mode === "history-stalled" || mode === "filters",
    revoked: mode === "revoked",
    lastCode: "",
    historyCalls: 0,
    confirmCalls: 0,
    sent: [] as string[],
    state: mode === "canceled" ? "canceled" : "pending",
  };
  (globalThis as any).__collectorFixture = control;
  const members = match.participants.map((p, i) => ({
    id: "m" + i,
    puuid: p.puuid,
    displayName: "회원 " + (i + 1),
    riotId: "회원" + i + "#KR1",
    active: true,
  }));
  box.cache(
    "members:m0",
    mode === "hints-guests" ? members.slice(0, 6) : members,
  );
  if (mode === "filters" && box.matches(actor).length === 0) {
    for (let i = 0; i < 6; i++) {
      const m = {
        ...match,
        gameId: String(810 + i),
        startedAtUtc: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      };
      const key = "KR:" + m.gameId;
      box.saveMatch(actor, {
        matchKey: key,
        state: i === 3 ? "registered" : i === 4 ? "canceled" : "pending",
        match: m,
        confirmedRoles: i === 3 ? roles : null,
      });
      if (i === 0 || i === 5) {
        const job = box.enqueueCollected(
          {
            schemaVersion: 1,
            rawMatch: raw,
            clientSubmissionId: "fixture-" + i,
          },
          actor,
          m,
        );
        if (i === 5) box.mark(job.id, "needs_attention", "ACCOUNT_MISMATCH");
      }
      if (i === 2)
        box.enqueueConfirmation(
          key,
          { rolesByPuuid: roles, clientSubmissionId: "fixture-confirm" },
          actor,
        );
    }
  }
  const record = () => ({
    matchKey: key,
    state: control.state as "pending" | "registered" | "canceled",
    match,
    confirmedRoles: control.state === "registered" ? roles : null,
    roleSuggestions: rawRoleSuggestions(raw),
  });
  const online = () => {
    if (control.offline) throw new ClientError("NETWORK_ERROR");
    if (control.revoked) throw new ClientError("AUTH_REVOKED", 401);
  };
  const lcu = {
    getAccount: async () => {
      if (mode === "stopped") throw new ClientError("CLIENT_NOT_RUNNING");
      return {
        puuid: mode === "mismatch" ? "other" : actor.puuid,
        displayName: "테스트 수집자#KR1",
        identity: {
          puuid: actor.puuid,
          riotId: "테스트 수집자#KR1",
          source: "current_summoner" as const,
          observedAt: new Date().toISOString(),
        },
      };
    },
    getIdentity: async () => {
      throw new ClientError("LCU_UNAVAILABLE");
    },
    listPastMatches: async () => {
      control.historyCalls++;
      if (mode === "failure") throw new ClientError("LCU_UNAVAILABLE");
      return {
        ids:
          mode === "pending"
            ? []
            : mode === "mixed"
              ? [match.gameId, "901", "902", "903"]
              : [match.gameId],
        warningCode:
          mode === "history-stalled" ? "HISTORY_PAGINATION_STALLED" : null,
      };
    },
    getMatch: async (id: string) => {
      if (mode !== "mixed" || id === match.gameId)
        return { rawMatch: raw, rawJson: JSON.stringify(raw) };
      // 진행 안내를 화면에서 관찰할 수 있도록 실제 조회처럼 잠시 기다린다.
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (id === "903") throw new ClientError("LCU_UNAVAILABLE");
      const other = { ...raw, gameId: Number(id), queueId: 420 };
      return { rawMatch: other, rawJson: JSON.stringify(other) };
    },
  };
  const api = {
    progress: async (keys: string[]) =>
      keys.map((matchKey) => ({
        matchKey,
        registrationState: control.state as
          "pending" | "registered" | "canceled",
        registeredRevision: 1,
        evaluation: {
          status:
            control.state === "canceled"
              ? ("ready" as const)
              : ("queued" as const),
          targetRevision: 1,
          scoringVersion: null,
          observedAt: new Date().toISOString(),
        },
      })),
    observations: async () => {},
    enroll: async (code: string) => {
      if (control.offline) throw new ClientError("NETWORK_ERROR");
      control.lastCode = code;
      control.revoked = false;
      actor = { ...actor, credentialId: "reconnected" };
      return actor;
    },
    members: async () => {
      online();
      return mode === "unregistered"
        ? []
        : mode === "hints-guests"
          ? members.slice(0, 6)
          : members;
    },
    pending: async () => {
      online();
      return mode === "pending" ? [record()] : [];
    },
    get: async () => {
      online();
      return record();
    },
    ingest: async () => {
      online();
      control.sent.push("ingest");
      return {
        matchKey: key,
        state: control.state,
        disposition: "created_pending",
      };
    },
    confirm: async () => {
      online();
      control.sent.push("confirm");
      control.confirmCalls++;
      control.state = "registered";
      return { disposition: "created" };
    },
  };
  // A restart represents connectivity restoration; pending jobs are due immediately.
  if (mode === "normal") box.db.exec("UPDATE outbox SET next_at=0");
  return new CollectorService(
    lcu,
    api,
    {
      load: async () => (mode === "connection" ? null : actor),
      save: async (c) => {
        actor = c;
      },
    },
    box,
  );
}
