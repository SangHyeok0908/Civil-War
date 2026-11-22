import { hostname } from "node:os";
import { pathToFileURL } from "node:url";

import { formatAlert, readWebhookUrl, sendAlert } from "./alerts.mjs";
import { isBackupName } from "./backups.mjs";
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

async function loadOrDefault(statePath, log) {
  try {
    return await loadState(statePath);
  } catch (error) {
    if (error?.message !== "STATE_UNREADABLE") throw error;
    log("상태 파일을 읽을 수 없어 기본값으로 덮어씁니다.");
    await saveState(statePath, { ...DEFAULT_STATE });
    return null;
  }
}

function inProgress(state) {
  return state.phase === "backing-up" || state.phase === "starting-new";
}

// 멈춤 해제. 수동 조치 뒤에 쓴다. 실패한 이미지는 계속 막아 두므로 같은 이미지를 다시 시도하지 않는다.
// 교체가 진행 중이던 상태는 복원이 필요하므로 거부한다. 종료 코드를 돌려준다.
export async function resetState(statePath, log) {
  const state = await loadOrDefault(statePath, log);
  if (state === null) return 0;
  if (inProgress(state)) {
    log(`교체가 진행 중인 상태(${state.phase})라 초기화를 거부합니다.`);
    return 1;
  }
  if (state.phase !== "halted") {
    log("초기화할 내용이 없습니다.");
    return 0;
  }
  await saveState(statePath, { ...state, phase: "idle" });
  log("멈춤 상태를 풀었습니다. 실패한 이미지는 계속 막혀 있습니다.");
  return 0;
}

// 실패한 이미지의 재시도 허용. 멈춤 상태도 함께 풀므로 서버가 정상인 것을 확인한 뒤에 쓴다.
export async function retryState(statePath, log) {
  const state = await loadOrDefault(statePath, log);
  if (state === null) return 0;
  if (inProgress(state)) {
    log(`교체가 진행 중인 상태(${state.phase})라 재시도 허용을 거부합니다.`);
    return 1;
  }
  if (state.phase !== "halted" && state.failedImageId === null) {
    log("재시도를 허용할 실패 이미지가 없습니다.");
    return 0;
  }
  await saveState(statePath, { ...state, phase: "idle", failedImageId: null });
  log("실패한 이미지의 재시도를 허용했습니다.");
  return 0;
}

// 멈춤 상태에서만 지정한 백업으로 DB를 복원한다. 운영 DB를 덮어쓰므로 사람이 명시적으로 실행한다.
export async function restoreBackup(statePath, fileName, ops, log) {
  if (!isBackupName(fileName)) {
    log(
      "백업 파일 이름 형식이 아닙니다. backups 폴더의 .dump 파일 이름만 쓸 수 있습니다.",
    );
    return 1;
  }
  let state;
  try {
    state = await loadState(statePath);
  } catch (error) {
    log(`상태 파일 읽기 오류: ${error?.message ?? error}`);
    return 1;
  }
  if (state.phase !== "halted") {
    log(
      `멈춤(halted) 상태에서만 복원할 수 있습니다. 현재 상태: ${state.phase}`,
    );
    return 1;
  }
  try {
    await ops.restore(fileName);
  } catch (error) {
    log(`복원 실패: ${error?.message ?? error}`);
    return 1;
  }
  log(`복원 완료: ${fileName}`);
  return 0;
}

const USAGE =
  "사용법: main.mjs [--reset | --retry | --test-alert | --restore <백업파일>] (인자 없이 실행하면 교체 반복을 시작합니다)";

export function parseArgs(argv) {
  if (argv.length === 0) return { mode: "loop" };
  const [flag, ...rest] = argv;
  if (flag === "--restore" && rest.length === 1 && !rest[0].startsWith("-")) {
    return { mode: "restore", file: rest[0] };
  }
  if (rest.length === 0) {
    if (flag === "--reset") return { mode: "reset" };
    if (flag === "--retry") return { mode: "retry" };
    if (flag === "--test-alert") return { mode: "test-alert" };
  }
  return { mode: "invalid" };
}

const ONEOFF_FORMAT = '{{ index .Config.Labels "com.docker.compose.oneoff" }}';

// Compose 일회성 실행(docker compose run) 컨테이너인지 본다. 확인 자체가 실패하면 null이다.
export async function isOneOffContainer(exec, hostname) {
  try {
    const result = await exec("docker", [
      "inspect",
      "--format",
      ONEOFF_FORMAT,
      hostname,
    ]);
    if (result.code !== 0) return null;
    return result.stdout.trim() === "True";
  } catch {
    return null;
  }
}

// 반복을 시작해도 되면 null, 아니면 종료 코드를 돌려준다.
export async function guardLoopStart({ exec, hostname, log }) {
  const oneOff = await isOneOffContainer(exec, hostname);
  if (oneOff === true) {
    log("일회성 실행에서는 교체 반복을 시작하지 않습니다.");
    return 2;
  }
  if (oneOff === null) {
    log("일회성 실행 여부를 확인하지 못했습니다. 반복을 계속 시작합니다.");
  }
  return null;
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

// 주기마다 상태 파일을 다시 읽는다. 다른 컨테이너의 --reset이나 복구된 파일이 바로 반영된다.
// runCycle과 recover는 돌려주는 상태를 스스로 저장하므로 여기서 다시 저장하지 않는다.
export function createLoop({ ops, cycleConfig, statePath, load = loadState }) {
  let alerted = false;
  return {
    async tick() {
      let state;
      try {
        state = await load(statePath);
      } catch (error) {
        if (error?.message !== "STATE_UNREADABLE") {
          ops.log(`상태 파일 읽기 오류: ${error?.message ?? error}`);
          return;
        }
        if (!alerted) {
          alerted = true;
          ops.log(
            "상태 파일을 읽을 수 없어 교체를 멈춥니다. 수동 확인 후 --reset이 필요합니다.",
          );
          await ops.alert("rollback-failed", {
            revision: null,
            at: ops.now(),
            step: "state-file",
          });
        }
        return;
      }
      alerted = false;
      try {
        if (state.phase === "backing-up" || state.phase === "starting-new") {
          await recover(state, ops, cycleConfig);
        } else {
          await runCycle(state, ops, cycleConfig);
        }
      } catch (error) {
        ops.log(`주기 실행 중 오류: ${error?.message ?? error}`);
      }
    },
  };
}

async function main(argv, env) {
  const parsed = parseArgs(argv);
  if (parsed.mode === "invalid") {
    console.error(USAGE);
    return 2;
  }
  const config = readConfig(env);
  const log = (message) =>
    console.log(`${new Date().toISOString()} ${message}`);

  if (parsed.mode === "reset") return resetState(config.statePath, log);
  if (parsed.mode === "retry") return retryState(config.statePath, log);
  if (parsed.mode === "restore") {
    return restoreBackup(
      config.statePath,
      parsed.file,
      makeOps(config, null),
      log,
    );
  }

  const webhookUrl = await readWebhookUrl(config.webhookFile);
  const ops = makeOps(config, webhookUrl);

  if (parsed.mode === "test-alert") {
    const ok = await sendAlert(
      webhookUrl,
      formatAlert("test", { revision: null, at: new Date(), step: null }),
    );
    log(ok ? "alert sent: test" : "alert failed: test");
    return ok ? 0 : 1;
  }

  const guarded = await guardLoopStart({
    exec: run,
    hostname: hostname(),
    log,
  });
  if (guarded !== null) return guarded;

  const stopper = createStopper();
  const cycleConfig = {
    sourceRef: config.sourceRef,
    currentRef: CURRENT_REF,
    previousRef: PREVIOUS_REF,
    keepBackups: config.keepBackups,
  };
  const loop = createLoop({ ops, cycleConfig, statePath: config.statePath });
  while (!stopper.stopping) {
    await loop.tick();
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
