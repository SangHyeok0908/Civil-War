import { pathToFileURL } from "node:url";

import { formatAlert, readWebhookUrl, sendAlert } from "./alerts.mjs";
import { createDockerOps, run } from "./commands.mjs";
import { recover, runCycle } from "./replace.mjs";
import { DEFAULT_STATE, loadState, saveState } from "./state.mjs";

const COMPOSE_FILE = "/deploy/compose.yml";
const PROJECT_DIR = "/deploy";
const BACKUP_DIR = "/backups";
const CURRENT_REF = "civil-war-server:current";
const PREVIOUS_REF = "civil-war-server:previous";

function positiveInteger(name, value, fallback) {
  if (value === undefined || value === "") return fallback;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name}은(는) 1 이상의 정수여야 합니다.`);
  }
  return Number(value);
}

export function readConfig(env) {
  if (!env.SOURCE_IMAGE) throw new Error("SOURCE_IMAGE가 필요합니다.");
  const pull = env.UPDATER_PULL || "always";
  if (pull !== "always" && pull !== "never") {
    throw new Error("UPDATER_PULL은 always 또는 never여야 합니다.");
  }
  return {
    sourceRef: env.SOURCE_IMAGE,
    projectName: env.COMPOSE_PROJECT_NAME || "cw-collector-acceptance",
    intervalSeconds: positiveInteger(
      "CHECK_INTERVAL_SECONDS",
      env.CHECK_INTERVAL_SECONDS,
      120,
    ),
    keepBackups: positiveInteger("BACKUP_KEEP", env.BACKUP_KEEP, 10),
    waitTimeoutSeconds: positiveInteger(
      "WAIT_TIMEOUT_SECONDS",
      env.WAIT_TIMEOUT_SECONDS,
      300,
    ),
    statePath: env.STATE_FILE || "/backups/updater-state.json",
    webhookFile: env.WEBHOOK_FILE || "/run/secrets/discord_webhook",
    pull,
  };
}

// 멈춤 해제. 교체가 진행 중이던 상태는 복원이 필요하므로 거부한다. 종료 코드를 돌려준다.
export async function resetState(statePath, log) {
  let state;
  try {
    state = await loadState(statePath);
  } catch (error) {
    if (error?.message !== "STATE_UNREADABLE") throw error;
    log("상태 파일을 읽을 수 없어 기본값으로 덮어씁니다.");
    await saveState(statePath, { ...DEFAULT_STATE });
    return 0;
  }
  if (state.phase === "backing-up" || state.phase === "starting-new") {
    log(`교체가 진행 중인 상태(${state.phase})라 초기화를 거부합니다.`);
    return 1;
  }
  if (state.phase !== "halted" && state.failedImageId === null) {
    log("초기화할 내용이 없습니다.");
    return 0;
  }
  await saveState(statePath, {
    ...state,
    phase: "idle",
    failedImageId: null,
  });
  log("멈춤 상태를 풀었습니다.");
  return 0;
}

function makeOps(config, webhookUrl) {
  return createDockerOps({
    projectName: config.projectName,
    composeFile: COMPOSE_FILE,
    projectDir: PROJECT_DIR,
    backupDir: BACKUP_DIR,
    sourceRef: config.sourceRef,
    waitTimeoutSeconds: config.waitTimeoutSeconds,
    webhookUrl,
    statePath: config.statePath,
    pull: config.pull,
    run,
  });
}

function createStopper() {
  let stopping = false;
  let wake = () => {};
  const onSignal = () => {
    stopping = true;
    wake();
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
  return {
    get stopping() {
      return stopping;
    },
    // 다음 주기까지 기다린다. 종료 신호가 오면 즉시 깨어난다.
    sleep(ms) {
      return new Promise((resolve) => {
        if (stopping) return resolve();
        const timer = setTimeout(() => {
          wake = () => {};
          resolve();
        }, ms);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    },
  };
}

async function main(argv, env) {
  const config = readConfig(env);
  const log = (message) =>
    console.log(`${new Date().toISOString()} ${message}`);

  if (argv.includes("--reset")) return resetState(config.statePath, log);

  const webhookUrl = await readWebhookUrl(config.webhookFile);
  const ops = makeOps(config, webhookUrl);

  if (argv.includes("--test-alert")) {
    const ok = await sendAlert(
      webhookUrl,
      formatAlert("test", { revision: null, at: new Date(), step: null }),
    );
    log(ok ? "alert sent: test" : "alert failed: test");
    return ok ? 0 : 1;
  }

  const stopper = createStopper();
  let state;
  try {
    state = await loadState(config.statePath);
  } catch (error) {
    if (error?.message !== "STATE_UNREADABLE") throw error;
    log(
      "상태 파일을 읽을 수 없어 교체를 멈춥니다. 수동 확인 후 --reset이 필요합니다.",
    );
    await ops.alert("rollback-failed", {
      revision: null,
      at: ops.now(),
      step: "state-file",
    });
    // 종료하면 Compose가 계속 재시작하므로 살아서 아무것도 하지 않는다.
    while (!stopper.stopping) await stopper.sleep(3600 * 1000);
    return 0;
  }

  const cycleConfig = {
    sourceRef: config.sourceRef,
    currentRef: CURRENT_REF,
    previousRef: PREVIOUS_REF,
    keepBackups: config.keepBackups,
  };
  // runCycle과 recover는 돌려주는 상태를 스스로 저장한다.
  state = await recover(state, ops, cycleConfig);
  while (!stopper.stopping) {
    try {
      state = await runCycle(state, ops, cycleConfig);
    } catch (error) {
      ops.log(`주기 실행 중 오류: ${error?.message ?? error}`);
    }
    await stopper.sleep(config.intervalSeconds * 1000);
  }
  ops.log("종료 신호를 받아 마칩니다.");
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2), process.env).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`시작 실패: ${error?.message ?? error}`);
      process.exit(1);
    },
  );
}
