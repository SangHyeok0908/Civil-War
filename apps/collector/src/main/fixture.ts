import {
  ClientError,
  ROLES,
  type Credential,
} from "../../../../packages/contracts/src/index";
import { normalizeMatch } from "../../../../packages/lcu/src/normalize-match";
import raw from "../../../../fixtures/lcu/candidates/h2-20261021/G1.json";
import { CollectorService } from "./history-sync";
import type { Outbox } from "./outbox";
// Development-only fixture wiring; never talks to LCU, Riot, or a live server.
export function fixtureService(box: Outbox, mode: string) {
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
    offline: mode === "offline" || mode === "history-stalled",
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
  box.cache("members:m0", members);
  const record = () => ({
    matchKey: key,
    state: control.state as "pending" | "registered" | "canceled",
    match,
    confirmedRoles: control.state === "registered" ? roles : null,
  });
  const online = () => {
    if (control.offline) throw new ClientError("NETWORK_ERROR");
  };
  const lcu = {
    getAccount: async () => {
      if (mode === "stopped") throw new ClientError("CLIENT_NOT_RUNNING");
      return {
        puuid: mode === "mismatch" ? "other" : actor.puuid,
        displayName: "테스트 수집자#KR1",
      };
    },
    listPastMatches: async () => {
      control.historyCalls++;
      if (mode === "failure") throw new ClientError("LCU_UNAVAILABLE");
      return {
        ids: mode === "pending" ? [] : [match.gameId],
        warningCode:
          mode === "history-stalled" ? "HISTORY_PAGINATION_STALLED" : null,
      };
    },
    getMatch: async () => ({ rawMatch: raw, rawJson: JSON.stringify(raw) }),
  };
  const api = {
    enroll: async () => actor,
    members: async () => {
      online();
      return mode === "unregistered" ? [] : members;
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
      load: async () => actor,
      save: async (c) => {
        actor = c;
      },
    },
    box,
  );
}
