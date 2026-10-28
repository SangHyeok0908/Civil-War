import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  dialog,
  session,
} from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
import { ClientError } from "../../../../packages/contracts/src/index";
import { LcuClient } from "./lcu-client";
import { CredentialStore } from "./credential-store";
import { HttpServerApi } from "./server-api";
import { Outbox } from "./outbox";
import { CollectorService } from "./history-sync";
import { validSender, validateCommand, CHANNEL } from "./ipc";
import { exportMemberReferences } from "./reference-export";
declare const __CW_COLLECTOR_RELEASE__: boolean;
let box: Outbox | undefined;
let timer: NodeJS.Timeout | undefined;
const fixture =
  !__CW_COLLECTOR_RELEASE__ &&
  !app.isPackaged &&
  process.env.CW_COLLECTOR_FIXTURE === "1";
app.setName("Civil War Collector");
app.setPath(
  "userData",
  fixture && process.env.CW_FIXTURE_DATA
    ? process.env.CW_FIXTURE_DATA
    : join(app.getPath("appData"), "Civil War Collector"),
);
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const w = BrowserWindow.getAllWindows()[0];
    w?.show();
    w?.focus();
  });
  app
    .whenReady()
    .then(async () => {
      if (process.platform !== "win32" && !fixture) {
        await dialog.showMessageBox({
          type: "info",
          message: "이 수집기는 Windows에서만 지원합니다.",
          detail: "macOS 개발 검증은 고정 fixture 테스트로 실행합니다.",
        });
        app.quit();
        return;
      }
      const data = fixture
        ? process.env.CW_FIXTURE_DATA!
        : app.getPath("userData");
      await mkdir(data, { recursive: true });
      box = new Outbox(join(data, "collector.sqlite"));
      const service =
        !__CW_COLLECTOR_RELEASE__ && fixture
          ? (await import("./fixture")).fixtureService(
              box,
              process.env.CW_FIXTURE_MODE ?? "normal",
            )
          : new CollectorService(
              LcuClient.fromLockfile(
                process.env.CW_LCU_LOCKFILE ??
                  "C:\\Riot Games\\League of Legends\\lockfile",
              ),
              new HttpServerApi(
                process.env.CW_SERVER_ORIGIN ?? "http://127.0.0.1:8080",
              ),
              new CredentialStore(join(data, "credential.bin"), safeStorage),
              box,
            );
      await service.initializeLocal();
      const entry = pathToFileURL(join(__dirname, "renderer/index.html")).href;
      const window = new BrowserWindow({
        width: 1240,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        show: false,
        webPreferences: {
          preload: join(__dirname, "preload.cjs"),
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          webSecurity: true,
        },
      });
      session.defaultSession.setPermissionRequestHandler(
        (_webContents, _permission, callback) => callback(false),
      );
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event, url) => {
        if (url !== entry) event.preventDefault();
      });
      window.webContents.on("will-attach-webview", (event) =>
        event.preventDefault(),
      );
      ipcMain.handle(CHANNEL, async (event, command, input) => {
        try {
          if (
            !validSender(
              {
                senderId: event.sender.id,
                frameUrl: event.senderFrame?.url ?? "",
                isMainFrame: event.senderFrame === window.webContents.mainFrame,
              },
              window.webContents.id,
              entry,
            )
          )
            throw new ClientError("INVALID_SENDER");
          const { command: c, payload: p } = validateCommand(command, input);
          const value = await (c === "account"
            ? service.getAccount()
            : c === "snapshot"
              ? service.snapshot()
              : c === "enroll"
                ? service.enroll(p.code)
                : c === "query"
                  ? service.queryPastMatches()
                  : c === "pending"
                    ? service.loadPendingMatches()
                    : c === "confirm"
                      ? service.confirmRegistration(
                          p.matchKey,
                          p.rolesByPuuid,
                          p.inhouse,
                        )
                      : c === "draft"
                        ? service.saveDraft(p.matchKey, p.rolesByPuuid)
                        : c === "resume"
                          ? service.resumeOwnRequests()
                          : exportMemberReferences(p.selection));
          return { ok: true, value };
        } catch (e) {
          return {
            ok: false,
            code: e instanceof ClientError ? e.code : "LOCAL_ERROR",
          };
        }
      });
      await window.loadURL(entry);
      window.show();
      void service.refreshRemote().catch(() => {});
      timer = setInterval(() => {
        void service.tick().catch(() => {});
      }, 5000);
    })
    .catch(async () => {
      await dialog.showMessageBox({
        type: "error",
        message:
          "수집기를 시작하지 못했습니다. 저장 경로와 서버 설정을 확인하세요.",
      });
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    if (timer) clearInterval(timer);
    box?.close();
  });
}
