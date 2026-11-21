import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const DEFAULT_STATE = Object.freeze({
  phase: "idle",
  previousId: null,
  candidateId: null,
  candidateRevision: null,
  backupFile: null,
  failedImageId: null,
  pullFailingSince: null,
  lastRegistryAlertAt: null,
});

export async function loadState(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { ...DEFAULT_STATE };
    throw error;
  }
  try {
    const parsed = JSON.parse(text);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error("not an object");
    }
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    throw new Error("STATE_UNREADABLE");
  }
}

export async function saveState(path, state) {
  const tmp = join(dirname(path), `.${randomUUID()}.tmp`);
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`);
  await rename(tmp, path);
}
