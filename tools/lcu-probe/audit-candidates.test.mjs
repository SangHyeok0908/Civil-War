import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, cp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { auditMatch, auditCandidates } from "./audit-candidates.mjs";

const directory = "fixtures/lcu/candidates/h2-20261021";
const original = JSON.parse(await readFile(directory + "/G1.json", "utf8"));

test("candidate audit accepts measured projections and retains HOLD", async () => {
  const result = await auditCandidates(directory);
  assert.equal(result.gate, "HOLD");
  assert.equal(result.games, 3);
  assert.equal(result.participants, 30);
  assert.equal(result.objectiveZeros, 1);
  assert.equal(result.turretZeros, 4);
  assert.equal(result.itemZeros, 7);
});

test("candidate audit distinguishes zero from missing, null, coercion and invalid ranges", () => {
  const zero = structuredClone(original);
  zero.participants[0].stats.visionScore = 0;
  assert.doesNotThrow(() => auditMatch(zero));
  for (const value of [
    undefined,
    null,
    "0",
    -1,
    0.5,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    const bad = structuredClone(original);
    if (value === undefined) delete bad.participants[0].stats.visionScore;
    else bad.participants[0].stats.visionScore = value;
    assert.throws(() => auditMatch(bad), /CANDIDATE_INVALID/);
  }
});

test("candidate audit rejects identity leaks and unknown nested fields without echoing values", () => {
  for (const mutate of [
    (m) => {
      m.participantIdentities[0].player.puuid = "private-test-identity";
    },
    (m) => {
      m.participantIdentities[0].player.gameName = "private-test-identity";
    },
    (m) => {
      m.participants[0].stats.authorization = "private-test-identity";
    },
    (m) => {
      m.gameVersion = "private-test-identity";
    },
    (m) => {
      m.gameCreation = 1791600000000;
    },
  ]) {
    const bad = structuredClone(original);
    mutate(bad);
    assert.throws(
      () => auditMatch(bad),
      (error) => error.message === "CANDIDATE_INVALID",
    );
  }
});

test("candidate audit rejects broken joins, teams, winners and lossy game identifiers", () => {
  for (const mutate of [
    (m) => {
      m.participants.pop();
    },
    (m) => {
      m.participants[1].participantId = m.participants[0].participantId;
    },
    (m) => {
      m.participantIdentities[1].player.puuid =
        m.participantIdentities[0].player.puuid;
    },
    (m) => {
      m.participants[0].teamId = 200;
    },
    (m) => {
      m.participants[0].stats.win = !m.participants[0].stats.win;
    },
    (m) => {
      m.teams[0].win = m.teams[1].win;
    },
    (m) => {
      m.gameId = Number(m.gameId);
    },
  ]) {
    const bad = structuredClone(original);
    mutate(bad);
    assert.throws(() => auditMatch(bad), /CANDIDATE_INVALID/);
  }
});

test("candidate audit rejects a hidden duplicate identity even with an updated file hash", async () => {
  const directoryCopy = await mkdtemp(join(tmpdir(), "lcu-candidate-audit-"));
  try {
    await cp(directory, directoryCopy, { recursive: true });
    const file = join(directoryCopy, "G1.json");
    const text = (await readFile(file, "utf8")).replace(
      '"gameId":',
      '"gameId": "private-test-identity",\n  "gameId":',
    );
    await writeFile(file, text);
    const manifestFile = join(directoryCopy, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    manifest.files[0].sha256 = createHash("sha256").update(text).digest("hex");
    await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
    await assert.rejects(auditCandidates(directoryCopy), /CANDIDATE_INVALID/);
  } finally {
    await rm(directoryCopy, { recursive: true, force: true });
  }
});

async function withManifest(mutate, verify) {
  const copy = await mkdtemp(join(tmpdir(), "lcu-manifest-audit-"));
  try {
    await cp(directory, copy, { recursive: true });
    const file = join(copy, "manifest.json");
    const manifest = JSON.parse(await readFile(file, "utf8"));
    mutate(manifest);
    await writeFile(file, JSON.stringify(manifest, null, 2) + "\n");
    await verify(copy);
  } finally {
    await rm(copy, { recursive: true, force: true });
  }
}

for (const field of [
  "source",
  "sourceGamePatch",
  "capturePlatform",
  "captureNode",
  "captureDate",
  "publishedDate",
]) {
  test(`candidate audit rejects unapproved metadata in ${field}`, async () => {
    for (const value of [
      undefined,
      null,
      42,
      [],
      { accessToken: "private-test-token" },
      "private-test-token",
    ]) {
      await withManifest(
        (manifest) => {
          if (value === undefined) delete manifest[field];
          else manifest[field] = value;
        },
        async (copy) => {
          await assert.rejects(auditCandidates(copy), {
            message: "CANDIDATE_INVALID",
          });
        },
      );
    }
  });
}

for (const field of [
  "gameId",
  "gameCreation",
  "participantIdentities[].player",
  "otherFields",
]) {
  test(`candidate audit rejects unapproved transformation description in ${field}`, async () => {
    for (const value of [
      undefined,
      null,
      42,
      [],
      { accessToken: "private-test-token" },
      "/Users/private-test/raw-capture",
    ]) {
      await withManifest(
        (manifest) => {
          if (value === undefined) delete manifest.transformations[field];
          else manifest.transformations[field] = value;
        },
        async (copy) => {
          await assert.rejects(auditCandidates(copy), {
            message: "CANDIDATE_INVALID",
          });
        },
      );
    }
  });
}

test("candidate audit rejects unexpected transformation structure and extra private fields", async () => {
  for (const value of [
    undefined,
    null,
    42,
    [],
    { accessToken: "private-test-token" },
  ]) {
    await withManifest(
      (manifest) => {
        if (value === undefined) delete manifest.transformations;
        else manifest.transformations = value;
      },
      async (copy) => {
        await assert.rejects(auditCandidates(copy), {
          message: "CANDIDATE_INVALID",
        });
      },
    );
  }
  await withManifest(
    (manifest) => {
      manifest.transformations.rawCapturePath =
        "/Users/private-test/raw-capture";
    },
    async (copy) => {
      await assert.rejects(auditCandidates(copy), {
        message: "CANDIDATE_INVALID",
      });
    },
  );
});

test("candidate audit accepts approved metadata regardless of description key order", async () => {
  await withManifest(
    (manifest) => {
      manifest.transformations = Object.fromEntries(
        Object.entries(manifest.transformations).reverse(),
      );
    },
    async (copy) => {
      const result = await auditCandidates(copy);
      assert.equal(result.privateIdentityScan, "not-run");
      assert.equal(result.sourceStatsCompared, null);
    },
  );
});

test("candidate audit CLI rejects private metadata without echoing it", async () => {
  await withManifest(
    (manifest) => {
      manifest.transformations.rawCapturePath =
        "/Users/private-test/raw-capture";
      manifest.capturePlatform = { accessToken: "private-test-token" };
    },
    async (copy) => {
      const result = spawnSync(
        process.execPath,
        ["tools/lcu-probe/audit-candidates.mjs", "--dir", copy],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr.trim(), "CANDIDATE_AUDIT_FAILED");
    },
  );
});

test("synthetic source comparison cannot approve a manifest with private metadata", async () => {
  const source = await mkdtemp(join(tmpdir(), "lcu-synthetic-source-"));
  try {
    await writeFile(
      join(source, "002-current-summoner.json"),
      JSON.stringify({ puuid: "synthetic-source-player-01" }),
    );
    await writeFile(join(source, "003-history.json"), "{}");
    for (let i = 1; i <= 3; i++) {
      const raw = JSON.parse(
        await readFile(join(directory, `G${i}.json`), "utf8"),
      );
      raw.gameId = `synthetic-source-game-${i}`;
      for (const identity of raw.participantIdentities) {
        identity.player.puuid = identity.player.puuid.replace(
          "fixture-player-",
          "synthetic-source-player-",
        );
      }
      await writeFile(
        join(source, `00${i + 3}-game.json`),
        JSON.stringify(raw),
      );
    }
    const result = await auditCandidates(directory, source);
    assert.equal(result.sourceStatsCompared, 660);
    assert.equal(result.privateIdentityScan, "passed");
    await withManifest(
      (manifest) => {
        manifest.transformations.rawCapturePath =
          "/Users/private-test/raw-capture";
      },
      async (copy) => {
        await assert.rejects(auditCandidates(copy, source), {
          message: "CANDIDATE_INVALID",
        });
      },
    );
  } finally {
    await rm(source, { recursive: true, force: true });
  }
});
