import { readFile, writeFile, rename } from "node:fs/promises";
import {
  ClientError,
  object,
  text,
  type Credential,
} from "../../../../packages/contracts/src/index";
export interface Protector {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}
export class CredentialStore {
  constructor(
    private path: string,
    private protector: Protector,
    private platform = process.platform,
  ) {}
  private available() {
    if (this.platform !== "win32" || !this.protector.isEncryptionAvailable())
      throw new ClientError("PROTECTION_UNAVAILABLE");
  }
  async load(): Promise<Credential | null> {
    let encrypted: Buffer;
    try {
      encrypted = await readFile(this.path);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new ClientError("REENROLL_REQUIRED");
    }
    this.available();
    try {
      const c = object(JSON.parse(this.protector.decryptString(encrypted)));
      return {
        token: text(c.token),
        memberId: text(c.memberId),
        credentialId: text(c.credentialId),
        puuid: text(c.puuid),
      };
    } catch {
      throw new ClientError("REENROLL_REQUIRED");
    }
  }
  async save(c: Credential) {
    this.available();
    const data = this.protector.encryptString(JSON.stringify(c));
    await writeFile(this.path + ".tmp", data, { mode: 0o600 });
    await rename(this.path + ".tmp", this.path);
  }
}
