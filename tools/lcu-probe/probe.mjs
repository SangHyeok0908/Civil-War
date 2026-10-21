import { mkdir, mkdtemp, writeFile, lstat } from 'node:fs/promises';
import { resolve, join, relative, sep, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { arch, release } from 'node:os';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import { ProbeError, readConnection, lcuGet, parseJson } from './client.mjs';

const historyRoot = '/lol-match-history/v1/products/lol/';
const gameId = /^\d{1,30}$/;
const puuid = /^[A-Za-z0-9_-]{1,128}$/;
const help = [
  'LCU read-only probe (Node.js 24; Windows measurement required)',
  'node tools/lcu-probe/probe.mjs --lockfile "C:\\Riot Games\\League of Legends\\lockfile" --out .private/lcu/run-01',
  'Options: --interactive | --game ID | --timeline ID | --friends | --player PUUID',
  'History page: --begin 0 --count 20 (1..100). No automatic polling or pagination.',
  'Manual metadata: --client-version VERSION --region REGION --label LABEL',
  'Interactive: history [BEGIN COUNT], game ID, timeline ID, friends, player PUUID, help, quit',
  'All captures are unverified. The probe never declares gate PASS.',
].join('\n') + '\n';

async function jsonFile(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}

function page(begin = 0, count = 20) {
  const start = Number(begin);
  const size = Number(count);
  if (!Number.isInteger(start) || !Number.isInteger(size) ||
    start < 0 || size < 1 || size > 100 || start + size - 1 > 100000) {
    throw new ProbeError('INVALID_PAGE');
  }
  return { begin: start, count: size };
}

function validateOperation(operation, value) {
  if (['game', 'timeline'].includes(operation) && !gameId.test(value ?? '')) {
    throw new ProbeError('INVALID_GAME_ID');
  }
  if (operation === 'player' && !puuid.test(value ?? '')) throw new ProbeError('INVALID_PUUID');
  if (!['history', 'player', 'game', 'timeline', 'friends'].includes(operation)) {
    throw new ProbeError('INVALID_COMMAND');
  }
}

export async function collect(options) {
  const { lockfile, out, operation = 'history', value, onRequest = async () => {} } = options;
  validateOperation(operation, value);
  const { begin, count } = page(options.begin, options.count);
  await mkdir(out, { recursive: true, mode: 0o700 });
  const startedAt = new Date().toISOString();
  const directory = await mkdtemp(join(out, startedAt.replace(/[:.]/g, '-') + '-'));
  const manifest = {
    schemaVersion: 1, probeVersion: '1.0.0', gate: 'HOLD', evidence: 'unverified-capture',
    startedAt, platform: process.platform, osRelease: release(), arch: arch(), node: process.version,
    clientVersion: options.clientVersion ?? null, clientVersionSource: 'manual-or-unknown',
    region: options.region ?? null, label: options.label ?? null,
    operation, begin, count, requestCount: 0, responses: [],
  };
  async function request(kind, path) {
    const entry = { kind, path, requestedAt: new Date().toISOString(), status: null };
    manifest.responses.push(entry);
    let data;
    try {
      // Re-read even within one command; the client may restart between requests.
      const connection = await readConnection(lockfile);
      manifest.requestCount++;
      await onRequest();
      const result = await lcuGet(connection, path);
      entry.status = result.status;
      entry.state = result.status >= 200 && result.status < 300 ? 'ok' : 'http-error';
      try { data = parseJson(result.body); entry.parseState = 'json'; }
      catch { entry.parseState = result.body.length === 0 ? 'empty-body' : 'invalid-json'; }
      entry.bodyFile = String(manifest.responses.length).padStart(3, '0') + '-' + kind +
        (entry.parseState === 'json' ? '.json' : '.txt');
      await writeFile(join(directory, entry.bodyFile), result.body, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (!(error instanceof ProbeError)) throw new ProbeError('CAPTURE_WRITE_FAILED');
      if (error.status !== undefined) entry.status = error.status;
      entry.state = 'request-failed';
      entry.error = error.code;
    }
    entry.completedAt = new Date().toISOString();
    return { entry, data };
  }
  if (operation === 'history' || operation === 'player') {
    const version = await request('game-version', '/lol-patch/v1/game-version');
    manifest.gameVersion = version.entry.state === 'ok' && typeof version.data === 'string'
      ? version.data : null;
    await request('current-summoner', '/lol-summoner/v1/current-summoner');
    const result = await request('history', historyRoot +
      (operation === 'player' ? value : 'current-summoner') +
      '/matches?beginIndex=' + begin + '&endIndex=' + (begin + count - 1));
    const games = result.data?.games?.games;
    if (result.entry.state !== 'ok') manifest.historyState = 'request-failed';
    else if (!Array.isArray(games)) manifest.historyState = 'unknown-schema';
    else if (games.length === 0) manifest.historyState = 'empty';
    else {
      const ids = [...new Set(games.map(game => game?.gameId))];
      manifest.historyState = ids.every(id => typeof id === 'string' && gameId.test(id))
        ? 'available' : 'unknown-schema';
      // Even an unexpectedly large server page cannot cause unbounded follow-up traffic.
      manifest.detailsTruncated = ids.length > count;
      for (const id of ids.slice(0, count)) {
        if (typeof id === 'string' && gameId.test(id)) {
          await request('game', '/lol-match-history/v1/games/' + id);
        }
      }
    }
  } else if (operation === 'friends') {
    await request('friends', '/lol-chat/v1/friends');
  } else {
    await request(operation, '/lol-match-history/v1/' +
      (operation === 'timeline' ? 'game-timelines/' : 'games/') + value);
  }
  manifest.completedAt = new Date().toISOString();
  manifest.errors = manifest.responses.filter(row =>
    row.state !== 'ok' || row.parseState !== 'json').length;
  await jsonFile(join(directory, 'manifest.json'), manifest);
  return { directory, manifest };
}

export async function privateOutput(cwd, target, { exclusive = false } = {}) {
  const base = resolve(cwd, '.private', 'lcu');
  const out = resolve(cwd, target);
  if (!out.startsWith(base + sep)) throw new ProbeError('OUTPUT_MUST_BE_PRIVATE');
  // Reject existing symlinks/junctions inside the private tree.
  let cursor = cwd;
  for (const segment of relative(cwd, out).split(sep)) {
    cursor = join(cursor, segment);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new ProbeError('UNSAFE_OUTPUT');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (exclusive) {
    await mkdir(dirname(out), { recursive: true, mode: 0o700 });
    await mkdir(out, { mode: 0o700 });
  } else {
    await mkdir(out, { recursive: true, mode: 0o700 });
  }
  return out;
}

function command(line, defaults) {
  const [operation, ...args] = line.trim().split(/\s+/);
  if (operation === 'history') {
    if (args.length !== 0 && args.length !== 2) throw new ProbeError('INVALID_COMMAND');
    return { operation, ...page(args[0] ?? defaults.begin, args[1] ?? defaults.count) };
  }
  if ((operation === 'friends' && args.length !== 0) ||
    (operation !== 'friends' && args.length !== 1)) throw new ProbeError('INVALID_COMMAND');
  validateOperation(operation, args[0]);
  return { operation, value: args[0], ...defaults };
}

export async function main(args, { cwd = process.cwd(), input = process.stdin, output = process.stdout } = {}) {
  const say = text => output.write(text + '\n');
  try {
    const { values } = parseArgs({ args, options: {
      lockfile: { type: 'string' }, out: { type: 'string' }, interactive: { type: 'boolean' },
      game: { type: 'string' }, timeline: { type: 'string' }, friends: { type: 'boolean' },
      player: { type: 'string' }, begin: { type: 'string' }, count: { type: 'string' },
      'client-version': { type: 'string' }, region: { type: 'string' }, label: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    }, strict: true, allowPositionals: false });
    if (values.help) { output.write(help); return 0; }
    if (process.versions.node.split('.')[0] !== '24') throw new ProbeError('NODE_24_REQUIRED');
    if (!values.lockfile || !values.out) throw new ProbeError('LOCKFILE_AND_OUTPUT_REQUIRED');
    const defaults = page(values.begin, values.count);
    const modes = ['game', 'timeline', 'friends', 'player', 'interactive']
      .filter(key => values[key] !== undefined);
    if (modes.length > 1) throw new ProbeError('CONFLICTING_MODES');
    const operation = modes[0] ?? 'history';
    if (operation !== 'interactive') validateOperation(operation, values[operation]);
    const out = await privateOutput(resolve(cwd), values.out);
    const sessionFile = join(out, 'session.json');
    const session = {
      schemaVersion: 1, startedAt: new Date().toISOString(), requestCount: 0,
      platform: process.platform, mode: operation, captures: [],
    };
    // Exclusive creation prevents overwriting a previous observation session.
    await jsonFile(sessionFile, session);
    const saveSession = () => writeFile(sessionFile, JSON.stringify(session, null, 2) + '\n', { mode: 0o600 });
    let exitCode = 0;
    const run = async request => {
      const result = await collect({
        lockfile: resolve(cwd, values.lockfile), out, ...request,
        clientVersion: values['client-version'], region: values.region, label: values.label,
        onRequest: async () => { session.requestCount++; await saveSession(); },
      });
      session.captures.push(relative(out, result.directory));
      await saveSession();
      const incomplete = result.manifest.errors > 0 ||
        result.manifest.historyState === 'unknown-schema' || result.manifest.detailsTruncated;
      if (incomplete) exitCode = 2;
      say('Capture ' + relative(out, result.directory) + ': requests=' + result.manifest.requestCount +
        ', errors=' + result.manifest.errors + ', history=' + (result.manifest.historyState ?? 'n/a') +
        ', gate=HOLD');
    };
    if (operation === 'interactive') {
      const lines = createInterface({ input, crlfDelay: Infinity, terminal: false });
      say('READY: requests=0. Enter history, game ID, timeline ID, friends, player PUUID, help, quit.');
      for await (const line of lines) {
        if (!line.trim()) continue;
        if (line.trim() === 'quit') { lines.close(); break; }
        if (line.trim() === 'help') { output.write(help); continue; }
        try { await run(command(line, defaults)); }
        catch (error) {
          exitCode = 1;
          say('ERROR: ' + (error instanceof ProbeError ? error.code : 'IO_OR_ARGUMENT_ERROR'));
        }
      }
    } else {
      await run({ operation, value: values[operation], ...defaults });
    }
    session.completedAt = new Date().toISOString();
    await saveSession();
    return exitCode;
  } catch (error) {
    // Never print raw exceptions, request objects, argv or lockfile contents.
    say('ERROR: ' + (error instanceof ProbeError ? error.code
      : error.code === 'EEXIST' ? 'OUTPUT_ALREADY_USED' : 'IO_OR_ARGUMENT_ERROR'));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
