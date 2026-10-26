import {
  ClientError,
  object,
  text,
  type Credential,
  type CollectorMatch,
  type IngestMatchInput,
  type ConfirmationInput,
  type Member,
} from "../../../../packages/contracts/src/index";
import type { ServerApi } from "./uploader";
import {
  decodeCollectorMatch,
  decodeMembers,
} from "../../../../packages/contracts/src/decode";
export class HttpServerApi implements ServerApi {
  constructor(
    private origin: string,
    private transport: typeof fetch = fetch,
  ) {
    const u = new URL(origin);
    if (
      u.origin !== origin ||
      u.username ||
      u.password ||
      (u.protocol !== "https:" &&
        !(
          u.protocol === "http:" &&
          ["127.0.0.1", "localhost"].includes(u.hostname)
        ))
    )
      throw new ClientError("INVALID_SERVER_ORIGIN");
  }
  private async request(
    path: string,
    c?: Credential,
    body?: string,
  ): Promise<any> {
    let response: Response;
    try {
      response = await this.transport(this.origin + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(c ? { Authorization: "Bearer " + c.token } : {}),
        },
        body,
        signal: AbortSignal.timeout(15000),
        redirect: "error",
        cache: "no-store",
      });
    } catch {
      throw new ClientError("NETWORK_ERROR");
    }
    if (!response.ok) {
      let code = "SERVER_ERROR";
      try {
        const value = await response.json();
        if (typeof value.code === "string" && /^[A-Z_]+$/.test(value.code))
          code = value.code;
      } catch {}
      const retry = response.headers.get("Retry-After");
      const delay =
        retry && /^\d+$/.test(retry)
          ? Number(retry) * 1000
          : retry
            ? Math.max(0, Date.parse(retry) - Date.now())
            : 15000;
      throw new ClientError(
        code,
        response.status,
        Number.isFinite(delay) ? delay : 15000,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new ClientError("INVALID_SERVER_RESPONSE", 502);
    }
  }
  async enroll(code: string, currentPuuid: string): Promise<Credential> {
    const r = object(
      await this.request(
        "/api/collector/enroll",
        undefined,
        JSON.stringify({ code, currentPuuid }),
      ),
    );
    return {
      token: text(r.token),
      memberId: text(r.memberId),
      credentialId: text(r.credentialId),
      puuid: text(r.puuid),
    };
  }
  async members(c: Credential): Promise<Member[]> {
    return decodeMembers(await this.request("/api/collector/members", c));
  }
  async pending(c: Credential): Promise<CollectorMatch[]> {
    const values = await this.request(
      "/api/collector/matches?state=pending",
      c,
    );
    if (!Array.isArray(values))
      throw new ClientError("INVALID_SERVER_RESPONSE", 502);
    return values.map(decodeCollectorMatch);
  }
  async get(key: string, c: Credential): Promise<CollectorMatch> {
    const result = decodeCollectorMatch(
      await this.request(
        "/api/collector/matches/" + encodeURIComponent(key),
        c,
      ),
    );
    if (result.matchKey !== key)
      throw new ClientError("INVALID_SERVER_RESPONSE", 502);
    return result;
  }
  async ingest(input: IngestMatchInput, c: Credential) {
    const raw = input.rawJson ?? JSON.stringify(input.rawMatch);
    const result = await this.request(
      "/api/collector/matches/ingest",
      c,
      '{"schemaVersion":1,"clientSubmissionId":' +
        JSON.stringify(input.clientSubmissionId) +
        ',"rawMatch":' +
        raw +
        "}",
    );
    if (
      !["pending", "registered", "canceled"].includes(result?.state) ||
      ![
        "created_pending",
        "already_pending",
        "already_registered",
        "already_canceled",
      ].includes(result?.disposition) ||
      typeof result?.matchKey !== "string"
    )
      throw new ClientError("INVALID_SERVER_RESPONSE", 502);
    return {
      matchKey: result.matchKey,
      state: result.state,
      disposition: result.disposition,
    };
  }
  confirm(key: string, input: ConfirmationInput, c: Credential) {
    return this.request(
      "/api/collector/matches/" + encodeURIComponent(key) + "/confirm",
      c,
      JSON.stringify(input),
    );
  }
}
