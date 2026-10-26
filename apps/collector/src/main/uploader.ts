import {
  ClientError,
  type Credential,
  type CollectorMatch,
  type IngestMatchInput,
  type ConfirmationInput,
  type Member,
} from "../../../../packages/contracts/src/index";
import { Outbox } from "./outbox";
export interface ServerApi {
  get(key: string, c: Credential): Promise<CollectorMatch>;
  ingest(
    input: IngestMatchInput,
    c: Credential,
  ): Promise<{ matchKey: string; state: string; disposition: string }>;
  confirm(
    key: string,
    input: ConfirmationInput,
    c: Credential,
  ): Promise<unknown>;
  members(c: Credential): Promise<Member[]>;
}
export class Uploader {
  private running: Promise<void> | null = null;
  constructor(
    private box: Outbox,
    private api: ServerApi,
    private credential: () => Promise<Credential | null>,
    private now = Date.now,
    private random = Math.random,
  ) {}
  drainOutbox(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }
  private async run() {
    for (const item of this.box.listOutbox()) {
      if (item.state !== "pending") continue;
      if (item.nextAt > this.now()) break;
      const actor = await this.credential();
      if (!actor || !this.box.allowed(item, actor)) {
        this.box.mark(item.id, "needs_attention", "CREDENTIAL_CHANGED");
        continue;
      }
      if (item.dependency) {
        const dep = this.box.listOutbox().find((x) => x.id === item.dependency);
        if (dep?.state === "needs_attention") {
          this.box.mark(item.id, "needs_attention", dep.error);
          continue;
        }
        if (dep?.state !== "succeeded") continue;
      }
      this.box.mark(item.id, "sending");
      try {
        if (item.kind === "ingest") {
          const result = await this.api.ingest(item.payload, actor);
          if (result.state === "canceled")
            throw new ClientError("MATCH_CANCELED", 409);
          const record = await this.api.get(item.matchKey, actor);
          this.box.saveMatch(actor, record);
          if (record.state === "canceled")
            throw new ClientError("MATCH_CANCELED", 409);
        } else {
          const record = await this.api.get(item.matchKey, actor);
          this.box.saveMatch(actor, record);
          if (record.state === "canceled")
            throw new ClientError("MATCH_CANCELED", 409);
          if (record.state === "pending") {
            await this.api.confirm(item.matchKey, item.payload, actor);
            const confirmed = await this.api.get(item.matchKey, actor);
            this.box.saveMatch(actor, confirmed);
            if (confirmed.state === "canceled")
              throw new ClientError("MATCH_CANCELED", 409);
            if (confirmed.state !== "registered")
              throw new ClientError("INVALID_SERVER_RESPONSE", 502);
          }
        }
        this.box.mark(item.id, "succeeded");
      } catch (error) {
        const e =
          error instanceof ClientError
            ? error
            : new ClientError("NETWORK_ERROR");
        if (e.code === "MATCH_CANCELED") {
          const record = this.box
            .matches(actor)
            .find((x) => x.matchKey === item.matchKey);
          if (record)
            this.box.saveMatch(actor, { ...record, state: "canceled" });
        }
        const retry =
          e.status === 429 || e.status >= 500 || e.code === "NETWORK_ERROR";
        if (retry) {
          const delay =
            e.status === 429
              ? Math.max(1000, e.retryAfter)
              : Math.min(
                  900000,
                  [5000, 15000, 60000, 300000, 900000][
                    Math.min(item.attempts, 4)
                  ] *
                    (1 + this.random() * 0.2),
                );
          this.box.mark(
            item.id,
            "pending",
            e.code,
            this.now() + Math.round(delay),
          );
          break;
        } else this.box.mark(item.id, "needs_attention", e.code);
      }
    }
    this.box.cleanup();
  }
}
