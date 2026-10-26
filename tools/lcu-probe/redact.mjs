// Conservative fixture preparation only. Unknown fields are dropped; private raw
// captures remain the authority. A human must review against the measured schema.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { parseJson, ProbeError } from './client.mjs';
import { privateOutput } from './probe.mjs';

const identifiers = new Set([
  'puuid', 'accountId', 'currentAccountId', 'summonerId', 'gameId', 'id',
  'summonerName', 'displayName', 'gameName', 'tagLine', 'gameTag', 'riotId', 'name',
]);
const containers = new Set([
  'games', 'participants', 'participantIdentities', 'player', 'teams', 'stats', 'timeline',
]);
const numbers = new Set([
  'participantId', 'teamId', 'championId', 'spell1Id', 'spell2Id', 'mapId', 'queueId',
  'gameDuration', 'gameLength', 'kills', 'deaths', 'assists', 'goldEarned', 'goldSpent',
  'totalMinionsKilled', 'neutralMinionsKilled', 'neutralMinionsKilledTeamJungle',
  'neutralMinionsKilledEnemyJungle', 'visionScore', 'wardsKilled', 'wardsPlaced',
  'sightWardsBoughtInGame', 'visionWardsBoughtInGame',
  'totalDamageDealtToChampions', 'physicalDamageDealtToChampions',
  'magicDamageDealtToChampions', 'trueDamageDealtToChampions',
  'totalDamageTaken', 'physicalDamageTaken', 'magicalDamageTaken', 'trueDamageTaken',
  'totalDamageDealt', 'damageDealtToObjectives', 'damageDealtToTurrets',
  'objectiveDamage', 'turretKills', 'inhibitorKills', 'dragonKills', 'baronKills',
  'champLevel', 'item0', 'item1', 'item2', 'item3', 'item4', 'item5', 'item6',
  'gameIndexBegin', 'gameIndexEnd', 'gameCount',
]);
const enums = new Map([
  ['platformId', /^(KR|NA1|EUW1|EUN1|BR1|JP1|LA1|LA2|OC1|TR1|RU|PH2|SG2|TH2|TW2|VN2|ME1)$/],
  ['gameType', /^(CUSTOM_GAME|MATCHED_GAME|TUTORIAL_GAME)$/],
  ['gameMode', /^(CLASSIC|ARAM|CHERRY|TFT)$/],
  ['lane', /^(TOP|JUNGLE|MIDDLE|MID|BOTTOM|BOT|NONE)$/],
  ['role', /^(SOLO|DUO|DUO_CARRY|DUO_SUPPORT|NONE)$/],
  ['win', /^(Win|Fail)$/],
]);

function alias(key, value, aliases) {
  const category = key === 'gameId' ? 'game'
    : /puuid/i.test(key) ? 'puuid'
      : /accountId/i.test(key) ? 'account'
        : /summonerId/i.test(key) ? 'summoner' : 'identity';
  const lookup = category + ':' + String(value);
  if (!aliases.has(lookup)) aliases.set(lookup, category + '-' + (aliases.size + 1));
  return aliases.get(lookup);
}

export function redactCapture(capture, aliases = new Map()) {
  if (Array.isArray(capture)) return capture.map(item => redactCapture(item, aliases));
  if (capture === null) return null;
  if (typeof capture !== 'object') return '[redacted]';
  const output = {};
  for (const [key, value] of Object.entries(capture)) {
    if (identifiers.has(key)) {
      if (value === null) output[key] = null;
      else if (['string', 'number'].includes(typeof value)) output[key] = alias(key, value, aliases);
    } else if (containers.has(key) && (value === null || typeof value === 'object')) {
      output[key] = redactCapture(value, aliases);
    } else if (numbers.has(key) && (value === null || typeof value === 'number')) {
      output[key] = value;
    } else if (key === 'win' && typeof value === 'boolean') {
      output[key] = value;
    } else if (enums.has(key) && typeof value === 'string' && enums.get(key).test(value)) {
      output[key] = value;
    }
  }
  return output;
}

export async function main(args, { cwd = process.cwd(), output = process.stdout } = {}) {
  try {
    const { values } = parseArgs({ args, options: {
      input: { type: 'string', multiple: true }, out: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    }, strict: true, allowPositionals: false });
    if (values.help) {
      output.write('node tools/lcu-probe/redact.mjs --input RAW.json [--input OTHER.json] --out .private/lcu/candidates-01\n');
      return 0;
    }
    if (process.versions.node.split('.')[0] !== '24') throw new ProbeError('NODE_24_REQUIRED');
    if (!values.input?.length || !values.out) throw new ProbeError('INPUT_AND_OUTPUT_REQUIRED');
    const aliases = new Map();
    const captures = [];
    for (const path of values.input) {
      captures.push(redactCapture(parseJson(await readFile(resolve(cwd, path), 'utf8')), aliases));
    }
    const out = await privateOutput(resolve(cwd), values.out, { exclusive: true });
    const files = [];
    for (const [index, capture] of captures.entries()) {
      const file = String(index + 1).padStart(3, '0') + '.json';
      await writeFile(join(out, file), JSON.stringify(capture, null, 2) + '\n',
        { flag: 'wx', mode: 0o600 });
      files.push({ source: values.input[index], candidate: file });
    }
    await writeFile(join(out, 'aliases.private.json'), JSON.stringify([...aliases], null, 2) + '\n',
      { flag: 'wx', mode: 0o600 });
    await writeFile(join(out, 'manifest.json'), JSON.stringify({
      gate: 'HOLD', reviewRequired: true, generatedAt: new Date().toISOString(),
      policy: 'Unknown fields omitted; review against measured schema before publishing.',
      files,
    }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    output.write('Prepared ' + captures.length + ' private candidates. Manual review required; gate=HOLD.\n');
    return 0;
  } catch (error) {
    output.write('ERROR: ' + (error instanceof ProbeError ? error.code
      : error.code === 'EEXIST' ? 'OUTPUT_ALREADY_USED' : 'REDACTION_FAILED') + '\n');
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
