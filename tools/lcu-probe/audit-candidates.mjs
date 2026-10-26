// Audits the public candidate projection, NOT an LCU capability/production gate.
import { readFile, readdir, lstat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { parseJson } from "./client.mjs";

export const statFields = [
  "kills",
  "deaths",
  "assists",
  "totalDamageDealtToChampions",
  "totalDamageTaken",
  "damageDealtToObjectives",
  "damageDealtToTurrets",
  "totalMinionsKilled",
  "neutralMinionsKilled",
  "neutralMinionsKilledTeamJungle",
  "neutralMinionsKilledEnemyJungle",
  "goldEarned",
  "visionScore",
  "wardsKilled",
  "wardsPlaced",
  "item0",
  "item1",
  "item2",
  "item3",
  "item4",
  "item5",
  "item6",
];
// This fixed public H2 projection requires review when provenance text changes.
const approvedMetadata = {
  source:
    "User-supplied Windows H2 capture, three custom games; G1 result screen checked in the existing report.",
  sourceGamePatch: "16.20.824.8524",
  capturePlatform: "win32",
  captureNode: "v24.22.1",
  captureDate: "2026-10-21",
  publishedDate: "2026-10-22",
};
const approvedTransformations = {
  gameId:
    "Synthetic decimal strings, deliberately above JavaScript safe integer range. Not real match IDs.",
  gameCreation:
    "Synthetic UTC dates 2000-01-01 through 2000-01-03; not measured event times.",
  "participantIdentities[].player":
    "Only stable fixture-player-NN aliases retained; account IDs, Riot IDs and names omitted.",
  otherFields:
    "Only explicitly selected structure, patch, completion marker and measured numeric stats retained; no raw metadata, paths, screenshots or alias map.",
};
function requireValid(condition) {
  // Never echo a rejected value, key, path or source JSON.
  if (!condition) throw new Error("CANDIDATE_INVALID");
}
function exactKeys(value, keys) {
  requireValid(
    value !== null && typeof value === "object" && !Array.isArray(value),
  );
  requireValid(
    Object.keys(value).length === keys.length &&
      keys.every((k) => Object.hasOwn(value, k)),
  );
}
function integer(value, minimum = 0) {
  requireValid(Number.isSafeInteger(value) && value >= minimum);
}
function same(a, b) {
  requireValid(JSON.stringify(a) === JSON.stringify(b));
}
function parseCandidate(text) {
  const value = JSON.parse(text);
  // Public artifacts use one canonical encoding. In particular, duplicate keys
  // must not hide a private value that JSON.parse would otherwise discard.
  requireValid(JSON.stringify(value, null, 2) + "\n" === text);
  return value;
}

export function auditMatch(match) {
  exactKeys(match, [
    "platformId",
    "gameDuration",
    "gameMode",
    "gameType",
    "mapId",
    "queueId",
    "gameVersion",
    "endOfGameResult",
    "gameId",
    "gameCreation",
    "participantIdentities",
    "participants",
    "teams",
  ]);
  requireValid(
    match.platformId === "KR" &&
      match.gameType === "CUSTOM_GAME" &&
      match.gameMode === "CLASSIC" &&
      match.mapId === 11 &&
      match.queueId === 3130 &&
      match.gameVersion === "16.20.824.8524" &&
      match.endOfGameResult === "GameComplete",
  );
  requireValid(
    typeof match.gameId === "string" &&
      /^900000000000000000000[1-3]$/.test(match.gameId),
  );
  const index = Number(match.gameId.slice(-1));
  requireValid(match.gameCreation === 946684800000 + (index - 1) * 86400000);
  integer(match.gameDuration, 1);
  requireValid(
    Array.isArray(match.participants) && match.participants.length === 10,
  );
  requireValid(
    Array.isArray(match.participantIdentities) &&
      match.participantIdentities.length === 10,
  );
  requireValid(Array.isArray(match.teams) && match.teams.length === 2);
  const identities = new Map();
  const puuids = new Set();
  for (const identity of match.participantIdentities) {
    exactKeys(identity, ["participantId", "player"]);
    exactKeys(identity.player, ["puuid"]);
    integer(identity.participantId, 1);
    requireValid(
      identity.participantId <= 10 && !identities.has(identity.participantId),
    );
    requireValid(
      typeof identity.player.puuid === "string" &&
        /^fixture-player-(0[1-9]|10)$/.test(identity.player.puuid),
    );
    identities.set(identity.participantId, identity.player.puuid);
    puuids.add(identity.player.puuid);
  }
  requireValid(puuids.size === 10);
  const teams = new Map();
  for (const team of match.teams) {
    exactKeys(team, ["teamId", "win"]);
    requireValid(
      [100, 200].includes(team.teamId) &&
        !teams.has(team.teamId) &&
        ["Win", "Fail"].includes(team.win),
    );
    teams.set(team.teamId, team.win === "Win");
  }
  requireValid(teams.get(100) !== teams.get(200));
  const participantIds = new Set();
  const counts = new Map([
    [100, 0],
    [200, 0],
  ]);
  for (const participant of match.participants) {
    exactKeys(participant, ["participantId", "teamId", "championId", "stats"]);
    requireValid(
      identities.has(participant.participantId) &&
        !participantIds.has(participant.participantId),
    );
    participantIds.add(participant.participantId);
    requireValid(teams.has(participant.teamId));
    counts.set(participant.teamId, counts.get(participant.teamId) + 1);
    integer(participant.championId, 1);
    exactKeys(participant.stats, [...statFields, "win"]);
    for (const field of statFields) integer(participant.stats[field]);
    requireValid(
      typeof participant.stats.win === "boolean" &&
        participant.stats.win === teams.get(participant.teamId),
    );
  }
  requireValid(counts.get(100) === 5 && counts.get(200) === 5);
}

export async function auditCandidates(
  directory = "fixtures/lcu/candidates/h2-20261021",
  sourceDirectory,
) {
  const names = ["G1.json", "G2.json", "G3.json", "manifest.json"];
  same((await readdir(directory)).sort(), names);
  const texts = new Map();
  for (const name of names) {
    requireValid((await lstat(join(directory, name))).isFile());
    texts.set(name, await readFile(join(directory, name), "utf8"));
  }
  const manifest = parseCandidate(texts.get("manifest.json"));
  exactKeys(manifest, [
    "schemaVersion",
    "status",
    "gate",
    "productionReady",
    "source",
    "sourceGamePatch",
    "capturePlatform",
    "captureNode",
    "captureDate",
    "publishedDate",
    "transformations",
    "statFields",
    "checks",
    "files",
  ]);
  requireValid(
    manifest.schemaVersion === 1 &&
      manifest.status === "candidate" &&
      manifest.gate === "HOLD" &&
      manifest.productionReady === false,
  );
  for (const [key, value] of Object.entries(approvedMetadata))
    requireValid(manifest[key] === value);
  exactKeys(manifest.transformations, Object.keys(approvedTransformations));
  for (const [key, value] of Object.entries(approvedTransformations))
    requireValid(manifest.transformations[key] === value);
  same([...manifest.statFields].sort(), [...statFields].sort());
  same(manifest.checks, { C01: "HOLD", C02: "HOLD", C07: "HOLD", C10: "HOLD" });
  requireValid(Array.isArray(manifest.files) && manifest.files.length === 3);
  const matches = [];
  for (const [index, entry] of manifest.files.entries()) {
    exactKeys(entry, ["file", "sha256", "participantRows", "numericStats"]);
    requireValid(
      entry.file === names[index] &&
        entry.participantRows === 10 &&
        entry.numericStats === 220,
    );
    requireValid(
      createHash("sha256").update(texts.get(entry.file)).digest("hex") ===
        entry.sha256,
    );
    const match = parseCandidate(texts.get(entry.file));
    auditMatch(match);
    requireValid(match.gameId.endsWith(String(index + 1)));
    matches.push(match);
  }
  let sourceStatsCompared = null;
  if (sourceDirectory) {
    sourceStatsCompared = 0;
    const aliases = new Map();
    const privateValues = new Set();
    const identityFields = new Set([
      "puuid",
      "gameId",
      "accountId",
      "currentAccountId",
      "summonerId",
      "summonerName",
      "displayName",
      "gameName",
      "tagLine",
      "internalName",
      "matchHistoryUri",
    ]);
    function gather(value) {
      if (Array.isArray(value)) value.forEach(gather);
      else if (value && typeof value === "object")
        for (const [key, child] of Object.entries(value)) {
          if (
            identityFields.has(key) &&
            ["string", "number"].includes(typeof child) &&
            child !== "" &&
            String(child) !== "0"
          )
            privateValues.add(String(child));
          gather(child);
        }
    }
    for (const name of [
      "002-current-summoner.json",
      "003-history.json",
      "004-game.json",
      "005-game.json",
      "006-game.json",
    ]) {
      gather(parseJson(await readFile(join(sourceDirectory, name), "utf8")));
    }
    for (const [index, match] of matches.entries()) {
      const raw = parseJson(
        await readFile(
          join(sourceDirectory, `00${index + 4}-game.json`),
          "utf8",
        ),
      );
      for (const field of [
        "platformId",
        "gameDuration",
        "gameMode",
        "gameType",
        "mapId",
        "queueId",
        "gameVersion",
        "endOfGameResult",
      ])
        same(match[field], raw[field]);
      same(
        match.teams,
        raw.teams.map((t) => ({ teamId: t.teamId, win: t.win })),
      );
      for (const participant of match.participants) {
        const original = raw.participants.find(
          (p) => p.participantId === participant.participantId,
        );
        requireValid(Boolean(original));
        same(participant.teamId, original.teamId);
        same(participant.championId, original.championId);
        same(participant.stats.win, original.stats.win);
        for (const field of statFields) {
          same(participant.stats[field], original.stats[field]);
          sourceStatsCompared++;
        }
        const real = raw.participantIdentities.find(
          (p) => p.participantId === participant.participantId,
        ).player.puuid;
        const alias = match.participantIdentities.find(
          (p) => p.participantId === participant.participantId,
        ).player.puuid;
        if (aliases.has(real)) same(aliases.get(real), alias);
        else aliases.set(real, alias);
      }
    }
    requireValid(aliases.size === 10 && new Set(aliases.values()).size === 10);
    function scan(value) {
      if (Array.isArray(value)) value.forEach(scan);
      else if (value && typeof value === "object")
        for (const [key, child] of Object.entries(value)) {
          requireValid(!privateValues.has(key));
          scan(child);
        }
      else if (typeof value === "string" || typeof value === "number")
        requireValid(!privateValues.has(String(value)));
    }
    for (const text of texts.values()) {
      scan(JSON.parse(text));
      for (const value of privateValues)
        if (value.length >= 4) requireValid(!text.includes(value));
    }
  }
  const stats = matches.flatMap((m) => m.participants.map((p) => p.stats));
  return {
    gate: "HOLD",
    evidence: "offline-candidate-audit",
    games: matches.length,
    participants: stats.length,
    objectiveZeros: stats.filter((s) => s.damageDealtToObjectives === 0).length,
    turretZeros: stats.filter((s) => s.damageDealtToTurrets === 0).length,
    itemZeros: stats.reduce(
      (n, s) =>
        n +
        Array.from({ length: 7 }, (_, i) => s["item" + i]).filter(
          (v) => v === 0,
        ).length,
      0,
    ),
    sourceStatsCompared,
    privateIdentityScan: sourceDirectory ? "passed" : "not-run",
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    requireValid(process.versions.node.split(".")[0] === "24");
    const { values } = parseArgs({
      options: { dir: { type: "string" }, "source-dir": { type: "string" } },
      strict: true,
    });
    console.log(
      JSON.stringify(await auditCandidates(values.dir, values["source-dir"])),
    );
  } catch {
    console.error("CANDIDATE_AUDIT_FAILED");
    process.exitCode = 1;
  }
}
