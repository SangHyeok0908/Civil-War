import { contextBridge, ipcRenderer } from "electron";
import type { CollectorApi, QueryProgress } from "./collector-api";
const invoke = async (command: string, payload: unknown = {}) => {
  const result = await ipcRenderer.invoke(
    "collector:command",
    command,
    payload,
  );
  if (!result.ok) throw new Error(result.code);
  return result.value;
};
const api: CollectorApi = {
  getAccount: () => invoke("account"),
  snapshot: () => invoke("snapshot"),
  enroll: (code) => invoke("enroll", { code }),
  queryPastMatches: () => invoke("query"),
  onQueryProgress: (listener) => {
    const handler = (_event: unknown, progress: QueryProgress) =>
      listener(progress);
    ipcRenderer.on("collector:query-progress", handler);
    return () => {
      ipcRenderer.removeListener("collector:query-progress", handler);
    };
  },
  loadPendingMatches: () => invoke("pending"),
  saveDraft: (matchKey, rolesByPuuid) =>
    invoke("draft", { matchKey, rolesByPuuid }),
  confirmRegistration: (matchKey, rolesByPuuid, inhouse) =>
    invoke("confirm", { matchKey, rolesByPuuid, inhouse }),
};
contextBridge.exposeInMainWorld("collector", Object.freeze(api));
