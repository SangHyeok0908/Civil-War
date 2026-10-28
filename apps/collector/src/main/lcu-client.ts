import {
  readConnection,
  lcuGet,
  parseJson,
} from "../../../../tools/lcu-probe/client.mjs";
import {
  ClientError,
  object,
  text,
} from "../../../../packages/contracts/src/index";
export interface Account {
  puuid: string;
  displayName: string;
}
export interface HistoryListing {
  ids: string[];
  warningCode: string | null;
}
type Connection = { port: number; password: string; protocol: string };
export class LcuClient {
  constructor(
    private connection: () => Promise<Connection>,
    private transport: (
      c: Connection,
      p: string,
    ) => Promise<{ status?: number; body: string }> = lcuGet,
  ) {}
  static fromLockfile(path: string) {
    return new LcuClient(() => readConnection(path));
  }
  private async get(path: string) {
    let c: Connection;
    try {
      c = await this.connection();
    } catch {
      throw new ClientError("CLIENT_NOT_RUNNING");
    }
    try {
      const response = await this.transport(c, path);
      if (response.status !== 200)
        throw new ClientError(
          response.status === 404 ? "LCU_NOT_LOGGED_IN" : "LCU_UNAVAILABLE",
        );
      return response.body;
    } catch (error) {
      if (error instanceof ClientError) throw error;
      throw new ClientError("LCU_UNAVAILABLE");
    }
  }
  async getAccount(): Promise<Account> {
    const value = object(
      parseJson(await this.get("/lol-summoner/v1/current-summoner")),
    );
    return {
      puuid: text(value.puuid, 128),
      displayName:
        typeof value.gameName === "string"
          ? value.gameName +
            (typeof value.tagLine === "string" ? "#" + value.tagLine : "")
          : text(value.displayName ?? value.internalName),
    };
  }
  async listPastMatches(puuid: string): Promise<HistoryListing> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(puuid))
      throw new ClientError("INVALID_ACCOUNT");
    const found = new Set<string>();
    for (let start = 0; start < 100000; start += 20) {
      const value = object(
        parseJson(
          await this.get(
            `/lol-match-history/v1/products/lol/${puuid}/matches?begIndex=${start}&endIndex=${start + 19}`,
          ),
        ),
      );
      const rows = value.games?.games;
      if (!Array.isArray(rows)) throw new ClientError("INVALID_HISTORY");
      let added = 0;
      for (const r of rows) {
        const id = text(r.gameId, 30);
        if (!/^\d{1,30}$/.test(id)) throw new ClientError("INVALID_HISTORY");
        if (!found.has(id)) added++;
        found.add(id);
      }
      if (rows.length < 20) return { ids: [...found], warningCode: null };
      if (start > 0 && added === 0) {
        // Some clients return an earlier full page even for a later range.
        // Preserve readable matches without claiming the history is complete.
        return { ids: [...found], warningCode: "HISTORY_PAGINATION_STALLED" };
      }
    }
    throw new ClientError("HISTORY_LIMIT");
  }
  async getMatch(gameId: string) {
    if (!/^\d{1,30}$/.test(gameId)) throw new ClientError("INVALID_MATCH");
    const rawJson = await this.get("/lol-match-history/v1/games/" + gameId);
    const rawMatch = JSON.parse(rawJson, ((
      key: string,
      value: unknown,
      context: { source?: string },
    ) => {
      if (
        typeof value === "number" &&
        (key === "gameId" ||
          !Number.isSafeInteger(value) ||
          !/^[-]?\d+$/.test(context.source ?? ""))
      )
        return context.source;
      return value;
    }) as any);
    return { rawMatch, rawJson };
  }
}
