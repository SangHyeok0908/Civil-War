import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_STATE } from "./state.mjs";
import { recover, runCycle } from "./replace.mjs";

const CONFIG = {
  sourceRef: "ghcr.io/example/civil-war-server:latest",
  currentRef: "civil-war-server:current",
  previousRef: "civil-war-server:previous",
  keepBackups: 10,
};
const T0 = new Date("2026-11-21T03:00:00Z");
const MUTATING = new Set([
  "pullSource",
  "saveState",
  "stop",
  "start",
  "backup",
  "restore",
  "tag",
  "recreateServer",
  "pruneBackups",
  "alert",
]);

function makeOps(options = {}) {
  const {
    images = {},
    failOn = {},
    alertThrows = false,
    clock = () => T0,
    revision = "abcdef1234567890",
  } = options;
  const calls = [];
  const counts = {};
  const ops = {
    calls,
    async pullSource() {
      calls.push(["pullSource"]);
      if (failOn.pullSource) throw new Error("pull failed");
    },
    async imageId(ref) {
      calls.push(["imageId", ref]);
      return images[ref] ?? null;
    },
    async imageRevision(id) {
      calls.push(["imageRevision", id]);
      return revision;
    },
    now() {
      return clock();
    },
    log(message) {
      calls.push(["log", message]);
    },
  };
  for (const name of [
    "tag",
    "stop",
    "start",
    "recreateServer",
    "backup",
    "restore",
    "pruneBackups",
  ]) {
    ops[name] = async (...args) => {
      calls.push([name, ...args]);
      counts[name] = (counts[name] ?? 0) + 1;
      const rule = failOn[name];
      if (typeof rule === "function" ? rule(counts[name], args) : rule) {
        throw new Error(`${name} failed`);
      }
    };
  }
  ops.alert = async (...args) => {
    calls.push(["alert", ...args]);
    if (alertThrows) throw new Error("alert failed");
  };
  ops.saveState = async (state) => {
    calls.push(["saveState", { ...state }]);
  };
  return ops;
}

const effectful = (ops) => ops.calls.filter(([name]) => MUTATING.has(name));
const names = (ops) => effectful(ops).map(([name]) => name);
// 부수 효과 호출을 순서대로 단순화한다. saveState는 단계, alert는 종류·단계로 줄인다.
const trace = (ops) =>
  effectful(ops).map(([n, ...a]) => {
    if (n === "saveState") return ["saveState", a[0].phase];
    if (n === "alert") return ["alert", a[0], a[1].step];
    return [n, ...a];
  });
const after = (items, name) =>
  items.slice(items.findIndex(([n]) => n === name));
const saved = (ops) =>
  ops.calls.filter(([n]) => n === "saveState").map(([, s]) => s);

const IMAGES = {
  [CONFIG.sourceRef]: "sha256:new",
  [CONFIG.currentRef]: "sha256:old",
};
const BACKUP = "20261121-030000-abcdef1.dump";

test("runCycle — 같은 이미지면 아무것도 멈추지 않는다", async () => {
  const ops = makeOps({
    images: {
      [CONFIG.sourceRef]: "sha256:old",
      [CONFIG.currentRef]: "sha256:old",
    },
  });
  const result = await runCycle({ ...DEFAULT_STATE }, ops, CONFIG);
  assert.deepEqual(names(ops), ["pullSource"]);
  assert.deepEqual(result, DEFAULT_STATE);
});

test("runCycle — 되돌린 이미지는 다시 시도하지 않는다", async () => {
  const ops = makeOps({ images: IMAGES });
  const state = { ...DEFAULT_STATE, failedImageId: "sha256:new" };
  const result = await runCycle(state, ops, CONFIG);
  assert.deepEqual(names(ops), ["pullSource"]);
  assert.deepEqual(result, state);
});

test("runCycle — 멈춤 상태에서는 확인도 하지 않는다", async () => {
  const ops = makeOps({ images: IMAGES });
  const state = { ...DEFAULT_STATE, phase: "halted" };
  const result = await runCycle(state, ops, CONFIG);
  assert.deepEqual(ops.calls, []);
  assert.deepEqual(result, state);
});

test("runCycle — current 이름표가 없으면 교체하지 않는다", async () => {
  const ops = makeOps({ images: { [CONFIG.sourceRef]: "sha256:new" } });
  await runCycle({ ...DEFAULT_STATE }, ops, CONFIG);
  assert.ok(ops.calls.some(([n]) => n === "log"));
  assert.ok(!ops.calls.some(([n]) => n === "stop"));
  assert.deepEqual(saved(ops), []);
});

test("runCycle — 성공 순서", async () => {
  const ops = makeOps({ images: IMAGES });
  const result = await runCycle({ ...DEFAULT_STATE }, ops, CONFIG);
  const seq = effectful(ops);
  assert.deepEqual(
    seq.map(([n, ...a]) =>
      n === "saveState" ? ["saveState", a[0].phase] : [n, ...a],
    ),
    [
      ["pullSource"],
      ["saveState", "backing-up"],
      ["stop", ["cloudflared", "server"]],
      ["backup", BACKUP],
      ["saveState", "starting-new"],
      ["tag", "sha256:old", CONFIG.previousRef],
      ["tag", "sha256:new", CONFIG.currentRef],
      ["recreateServer"],
      ["start", ["cloudflared"]],
      ["saveState", "idle"],
      ["pruneBackups", 10],
    ],
  );
  const [first, second, last] = saved(ops);
  assert.equal(first.previousId, "sha256:old");
  assert.equal(first.candidateId, "sha256:new");
  assert.equal(first.candidateRevision, "abcdef1234567890");
  assert.equal(second.backupFile, BACKUP);
  assert.equal(last.backupFile, null);
  assert.equal(result.phase, "idle");
  assert.equal(result.candidateId, null);
  assert.ok(!names(ops).includes("alert"));
});

test("runCycle — 백업 실패", async () => {
  const ops = makeOps({ images: IMAGES, failOn: { backup: true } });
  const result = await runCycle({ ...DEFAULT_STATE }, ops, CONFIG);
  assert.ok(!names(ops).includes("tag"));
  assert.deepEqual(after(trace(ops), "backup"), [
    ["backup", BACKUP],
    ["recreateServer"],
    ["start", ["cloudflared"]],
    ["saveState", "idle"],
    ["alert", "backup-failed", "backup"],
  ]);
  const states = saved(ops);
  assert.equal(states.length, 2);
  assert.equal(states[0].phase, "backing-up");
  assert.equal(states[1].phase, "idle");
  assert.equal(states[1].failedImageId, "sha256:new");
  assert.equal(states[1].candidateId, null);
  assert.equal(result.phase, "idle");
  assert.equal(result.failedImageId, "sha256:new");
});

test("runCycle — stop이 실패해도 백업 실패 경로로 복구한다", async () => {
  const ops = makeOps({ images: IMAGES, failOn: { stop: true } });
  const result = await runCycle({ ...DEFAULT_STATE }, ops, CONFIG);
  assert.ok(!names(ops).includes("tag"));
  assert.deepEqual(after(trace(ops), "stop"), [
    ["stop", ["cloudflared", "server"]],
    ["recreateServer"],
    ["start", ["cloudflared"]],
    ["saveState", "idle"],
    ["alert", "backup-failed", "stop"],
  ]);
  const states = saved(ops);
  assert.deepEqual(
    states.map((x) => x.phase),
    ["backing-up", "idle"],
  );
  assert.equal(states[1].failedImageId, "sha256:new");
  assert.equal(result.phase, "idle");
  assert.equal(result.failedImageId, "sha256:new");
});

test("runCycle — 백업 실패 뒤 기존 서버도 못 살리면 멈춤", async () => {
  const ops = makeOps({
    images: IMAGES,
    failOn: { backup: true, recreateServer: true },
  });
  const result = await runCycle({ ...DEFAULT_STATE }, ops, CONFIG);
  assert.deepEqual(after(trace(ops), "recreateServer"), [
    ["recreateServer"],
    ["alert", "rollback-failed", "start-previous"],
    ["saveState", "halted"],
  ]);
  assert.equal(result.phase, "halted");
  assert.equal(saved(ops).at(-1).phase, "halted");
});

const ROLLBACK_TAIL = [
  ["stop", ["server"]],
  ["tag", "sha256:old", CONFIG.currentRef],
  ["restore", BACKUP],
  ["recreateServer"],
  ["start", ["cloudflared"]],
];

test("runCycle — 새 버전 실패 후 되돌림", async () => {
  const ops = makeOps({
    images: IMAGES,
    failOn: { recreateServer: (n) => n === 1 },
  });
  const result = await runCycle({ ...DEFAULT_STATE }, ops, CONFIG);
  const seq = trace(ops);
  const at = seq.findIndex(([n]) => n === "recreateServer");
  assert.deepEqual(seq.slice(at + 1), [
    ...ROLLBACK_TAIL,
    ["saveState", "idle"],
    ["alert", "rolled-back", "health"],
  ]);
  const alert = effectful(ops).find(([n]) => n === "alert");
  assert.equal(alert[2].revision, "abcdef1234567890");
  assert.deepEqual(
    saved(ops).map((x) => x.phase),
    ["backing-up", "starting-new", "idle"],
  );
  assert.equal(saved(ops).at(-1).failedImageId, "sha256:new");
  assert.equal(result.phase, "idle");
  assert.equal(result.failedImageId, "sha256:new");
  assert.equal(result.backupFile, null);
});

test("runCycle — tag 실패도 되돌림 경로를 탄다", async () => {
  const ops = makeOps({
    images: IMAGES,
    failOn: { tag: (n) => n === 2 },
  });
  const result = await runCycle({ ...DEFAULT_STATE }, ops, CONFIG);
  const seq = trace(ops);
  assert.deepEqual(seq.slice(-2), [
    ["saveState", "idle"],
    ["alert", "rolled-back", "health"],
  ]);
  assert.equal(result.phase, "idle");
});

test("runCycle — 되돌림 실패", async () => {
  const ops = makeOps({
    images: IMAGES,
    failOn: { recreateServer: (n) => n === 1, restore: true },
  });
  const result = await runCycle({ ...DEFAULT_STATE }, ops, CONFIG);
  const seq = effectful(ops);
  const alert = seq.find(([n]) => n === "alert");
  assert.equal(alert[1], "rollback-failed");
  assert.equal(alert[2].step, "restore");
  const afterRestore = seq.slice(seq.findIndex(([n]) => n === "restore"));
  assert.ok(
    !afterRestore.some(([n, a]) => n === "start" && a[0] === "cloudflared"),
  );
  assert.equal(result.phase, "halted");
  assert.equal(result.previousId, "sha256:old");
  assert.equal(result.backupFile, BACKUP);
  assert.deepEqual(trace(ops).slice(-3), [
    ["restore", BACKUP],
    ["alert", "rollback-failed", "restore"],
    ["saveState", "halted"],
  ]);
  assert.equal(saved(ops).at(-1).phase, "halted");
  assert.equal(saved(ops).at(-1).failedImageId, "sha256:new");
});

test("runCycle — 알림 실패가 되돌림을 막지 않는다", async () => {
  const ops = makeOps({
    images: IMAGES,
    alertThrows: true,
    failOn: { recreateServer: (n) => n === 1 },
  });
  const result = await runCycle({ ...DEFAULT_STATE }, ops, CONFIG);
  assert.equal(result.phase, "idle");
  assert.equal(result.failedImageId, "sha256:new");
  assert.equal(saved(ops).at(-1).phase, "idle");
  assert.deepEqual(trace(ops).slice(-2), [
    ["saveState", "idle"],
    ["alert", "rolled-back", "health"],
  ]);
});

test("runCycle — GHCR 접속 실패 알림 간격", async () => {
  let now = T0;
  const ops = makeOps({
    images: IMAGES,
    failOn: { pullSource: true },
    clock: () => now,
  });
  let state = { ...DEFAULT_STATE };
  const alertsAt = [];
  for (const minutes of [0, 59, 60, 90, 120]) {
    now = new Date(T0.getTime() + minutes * 60000);
    const before = ops.calls.filter(([n]) => n === "alert").length;
    state = await runCycle(state, ops, CONFIG);
    const sent = ops.calls.filter(([n]) => n === "alert");
    if (sent.length > before) {
      assert.equal(sent.at(-1)[1], "registry-unreachable");
      alertsAt.push(minutes);
    }
  }
  assert.deepEqual(alertsAt, [60, 120]);
  assert.ok(!names(ops).includes("stop"));
  const at = (m) => new Date(T0.getTime() + m * 60000).toISOString();
  const failing = saved(ops).map((x) => [
    x.pullFailingSince,
    x.lastRegistryAlertAt,
  ]);
  assert.deepEqual(failing, [
    [at(0), null],
    [at(0), at(60)],
    [at(0), at(120)],
  ]);

  ops.pullSource = async () => {
    ops.calls.push(["pullSource"]);
  };
  state = await runCycle(state, makeOpsWithPullOk(ops), CONFIG);
  assert.equal(state.pullFailingSince, null);
  assert.equal(state.lastRegistryAlertAt, null);
  assert.equal(saved(ops).length, 4);
  assert.equal(saved(ops).at(-1).pullFailingSince, null);
  assert.equal(saved(ops).at(-1).lastRegistryAlertAt, null);
});

function makeOpsWithPullOk(ops) {
  // images 동일 → 교체 없이 상태 초기화만 확인
  ops.imageId = async (ref) =>
    ref === CONFIG.sourceRef || ref === CONFIG.currentRef ? "sha256:old" : null;
  return ops;
}

test("recover — 백업 중 재시작", async () => {
  const ops = makeOps();
  const state = {
    ...DEFAULT_STATE,
    phase: "backing-up",
    previousId: "sha256:old",
    candidateId: "sha256:new",
  };
  const result = await recover(state, ops, CONFIG);
  assert.ok(!names(ops).includes("restore"));
  assert.ok(!names(ops).includes("tag"));
  assert.deepEqual(trace(ops), [
    ["recreateServer"],
    ["start", ["cloudflared"]],
    ["saveState", "idle"],
  ]);
  assert.equal(saved(ops).at(-1).failedImageId, null);
  assert.equal(saved(ops).at(-1).candidateId, null);
  assert.equal(result.phase, "idle");
  assert.equal(result.failedImageId, null);
});

const STARTING_NEW = {
  ...DEFAULT_STATE,
  phase: "starting-new",
  previousId: "sha256:old",
  candidateId: "sha256:new",
  candidateRevision: "abcdef1234567890",
  backupFile: BACKUP,
};

test("recover — 새 버전 시작 중 재시작", async () => {
  const ops = makeOps();
  const result = await recover(STARTING_NEW, ops, CONFIG);
  assert.deepEqual(trace(ops), [
    ...ROLLBACK_TAIL,
    ["saveState", "idle"],
    ["alert", "rolled-back", "restart"],
  ]);
  assert.equal(saved(ops).at(-1).failedImageId, "sha256:new");
  assert.equal(result.phase, "idle");
  assert.equal(result.failedImageId, "sha256:new");
});

test("recover — 되돌림 도중 재시작이 반복돼도 같은 결과", async () => {
  const first = makeOps({ failOn: { recreateServer: true } });
  const afterFirst = await recover(STARTING_NEW, first, CONFIG);
  assert.equal(afterFirst.phase, "halted");

  // 첫 시도가 restore 직후 죽은 것처럼, 저장된 상태(starting-new)로 다시 시작
  const second = makeOps();
  const result = await recover(STARTING_NEW, second, CONFIG);
  const restore = effectful(second).find(([n]) => n === "restore");
  assert.deepEqual(restore, ["restore", BACKUP]);
  assert.equal(result.phase, "idle");
});

test("recover — idle·halted는 아무것도 하지 않는다", async () => {
  for (const phase of ["idle", "halted"]) {
    const ops = makeOps();
    const state = { ...DEFAULT_STATE, phase };
    const result = await recover(state, ops, CONFIG);
    assert.deepEqual(ops.calls, []);
    assert.deepEqual(result, state);
  }
});
