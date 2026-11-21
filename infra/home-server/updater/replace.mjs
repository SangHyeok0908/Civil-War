import { backupFileName } from "./backups.mjs";

const HOUR_MS = 60 * 60 * 1000;
const CLEARED = {
  previousId: null,
  candidateId: null,
  candidateRevision: null,
  backupFile: null,
};

class RollbackStepError extends Error {
  constructor(step, cause) {
    super(`rollback step failed: ${step}`, { cause });
    this.step = step;
  }
}

function rev7(state) {
  return state.candidateRevision?.slice(0, 7) ?? "unknown";
}

async function safeAlert(ops, kind, state, step) {
  try {
    await ops.alert(kind, {
      revision: state.candidateRevision,
      at: ops.now(),
      step,
    });
  } catch (error) {
    ops.log(`알림 전송 중 오류(무시): ${error?.message ?? error}`);
  }
}

async function bringBackPrevious(ops) {
  await ops.recreateServer();
  await ops.start(["cloudflared"]);
}

// 교체 전 서버를 다시 살린다. 실패하면 사람이 확인하도록 멈춤 상태로 둔다.
async function abortBeforeSwitch(state, ops, kind, step) {
  const failedImageId = kind === "backup-failed" ? state.candidateId : null;
  try {
    await bringBackPrevious(ops);
  } catch {
    const halted = { ...state, phase: "halted" };
    await safeAlert(ops, "rollback-failed", state, "start-previous");
    await ops.saveState(halted);
    return halted;
  }
  const next = {
    ...state,
    ...CLEARED,
    phase: "idle",
    failedImageId: failedImageId ?? state.failedImageId,
  };
  // idle 결과는 알림보다 먼저 저장한다. 알림 도중 재시작돼도 복원을 다시 하지 않도록.
  await ops.saveState(next);
  if (kind) await safeAlert(ops, kind, state, step);
  return next;
}

async function rollBackSteps(state, ops, config) {
  const steps = [
    ["stop", () => ops.stop(["server"])],
    ["tag", () => ops.tag(state.previousId, config.currentRef)],
    ["restore", () => ops.restore(state.backupFile)],
    ["start-previous", () => bringBackPrevious(ops)],
  ];
  for (const [step, run] of steps) {
    try {
      await run();
    } catch (error) {
      throw new RollbackStepError(step, error);
    }
  }
}

// runCycle과 recover가 함께 쓰는 유일한 되돌림 절차.
async function rollBack(state, ops, config, step) {
  const failedImageId = state.candidateId;
  try {
    await rollBackSteps(state, ops, config);
  } catch (error) {
    const halted = { ...state, phase: "halted", failedImageId };
    await safeAlert(
      ops,
      "rollback-failed",
      state,
      error instanceof RollbackStepError ? error.step : "unknown",
    );
    await ops.saveState(halted);
    return halted;
  }
  const next = { ...state, ...CLEARED, phase: "idle", failedImageId };
  await ops.saveState(next);
  ops.log(`되돌림 완료: ${rev7(state)}`);
  await safeAlert(ops, "rolled-back", state, step);
  return next;
}

async function checkRegistry(state, ops) {
  const now = ops.now();
  try {
    await ops.pullSource();
  } catch (error) {
    ops.log(`이미지 저장소 확인 실패: ${error?.message ?? error}`);
    const since = state.pullFailingSince ?? now.toISOString();
    let lastAlert = state.lastRegistryAlertAt;
    const failingFor = now - new Date(since);
    const sinceLast = lastAlert === null ? Infinity : now - new Date(lastAlert);
    if (failingFor >= HOUR_MS && sinceLast >= HOUR_MS) {
      await safeAlert(ops, "registry-unreachable", state, null);
      lastAlert = now.toISOString();
    }
    const next = {
      ...state,
      pullFailingSince: since,
      lastRegistryAlertAt: lastAlert,
    };
    return { ok: false, state: next };
  }
  return {
    ok: true,
    state: { ...state, pullFailingSince: null, lastRegistryAlertAt: null },
  };
}

function changed(a, b) {
  return (
    a.pullFailingSince !== b.pullFailingSince ||
    a.lastRegistryAlertAt !== b.lastRegistryAlertAt
  );
}

export async function runCycle(state, ops, config) {
  if (state.phase !== "idle") return state;

  const checked = await checkRegistry(state, ops);
  let current = checked.state;
  if (changed(state, current)) await ops.saveState(current);
  if (!checked.ok) return current;

  const candidateId = await ops.imageId(config.sourceRef);
  const previousId = await ops.imageId(config.currentRef);
  if (previousId === null) {
    ops.log("current 이름표가 없어 교체하지 않습니다.");
    return current;
  }
  if (candidateId === null || candidateId === previousId) return current;
  if (candidateId === current.failedImageId) {
    ops.log("이전에 되돌린 이미지라 다시 시도하지 않습니다.");
    return current;
  }

  const candidateRevision = await ops.imageRevision(candidateId);
  current = {
    ...current,
    phase: "backing-up",
    previousId,
    candidateId,
    candidateRevision,
  };
  await ops.saveState(current);
  ops.log(`교체 시작: ${rev7(current)}`);

  const backupFile = backupFileName(ops.now(), candidateRevision);
  try {
    await ops.stop(["cloudflared", "server"]);
  } catch (error) {
    ops.log(`서버 정지 실패: ${error?.message ?? error}`);
    return abortBeforeSwitch(current, ops, "backup-failed", "stop");
  }
  try {
    await ops.backup(backupFile);
  } catch (error) {
    ops.log(`백업 실패: ${error?.message ?? error}`);
    return abortBeforeSwitch(current, ops, "backup-failed", "backup");
  }

  current = { ...current, phase: "starting-new", backupFile };
  await ops.saveState(current);

  try {
    await ops.tag(previousId, config.previousRef);
    await ops.tag(candidateId, config.currentRef);
    await ops.recreateServer();
    await ops.start(["cloudflared"]);
  } catch (error) {
    ops.log(`새 버전 시작 실패: ${error?.message ?? error}`);
    return rollBack(current, ops, config, "health");
  }

  // 정상 확인 직후 idle을 먼저 저장한다. 이후 재시작돼도 정상 서버 위에 백업을 복원하지 않는다.
  const done = { ...current, ...CLEARED, phase: "idle" };
  await ops.saveState(done);
  ops.log(`교체 완료: ${rev7(current)}`);
  try {
    await ops.pruneBackups(config.keepBackups);
  } catch (error) {
    ops.log(`오래된 백업 정리 실패(무시): ${error?.message ?? error}`);
  }
  return done;
}

export async function recover(state, ops, config) {
  if (state.phase === "backing-up" || state.phase === "starting-new") {
    ops.log(`재시작 복구: ${state.phase}`);
  }
  if (state.phase === "backing-up") {
    return abortBeforeSwitch(state, ops, null, null);
  }
  if (state.phase === "starting-new") {
    return rollBack(state, ops, config, "restart");
  }
  return state;
}
