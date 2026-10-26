import assert from 'node:assert/strict';
import { test } from 'node:test';
import https from 'node:https';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readFile, writeFile, readdir, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConnection, lcuGet, parseJson } from './client.mjs';
import { main, collect } from './probe.mjs';
import { redactCapture } from './redact.mjs';

// Public test-only credentials for a synthetic local server.
const key = await readFile(new URL('./test-fixtures/localhost-key.pem', import.meta.url));
const cert = await readFile(new URL('./test-fixtures/localhost-cert.pem', import.meta.url));
const password = 'synthetic-password-DO-NOT-USE';
const authorization = 'Basic ' + Buffer.from('riot:' + password).toString('base64');
const historyPath = '/lol-match-history/v1/products/lol/current-summoner/matches';

async function temporary(t) {
  const dir = await mkdtemp(join(tmpdir(), 'lcu-probe-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function server(t, handler = (_req, res) => res.end('{}')) {
  const requests = [];
  const instance = https.createServer({ key, cert }, (req, res) => {
    requests.push({ path: req.url, method: req.method, auth: req.headers.authorization });
    handler(req, res);
  });
  instance.listen(0, '127.0.0.1');
  await once(instance, 'listening');
  t.after(() => {
    instance.closeAllConnections();
    return new Promise(resolve => instance.close(resolve));
  });
  return { instance, requests, port: instance.address().port };
}

async function lockfile(dir, port, secret = password) {
  const path = join(dir, 'lockfile');
  await writeFile(path, 'LeagueClient:1234:' + port + ':' + secret + ':https\n');
  return path;
}

async function filesUnder(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(path));
    else result.push({ path, text: await readFile(path, 'utf8') });
  }
  return result;
}

test('rejectNonLoopback: credentials cannot reach other hosts or arbitrary routes', async () => {
  const base = { port: 12345, password, protocol: 'https' };
  for (const connection of [
    { ...base, host: 'example.com' }, { ...base, hostname: 'localhost' },
    { ...base, protocol: 'http' }, { ...base, port: 0 },
  ]) {
    await assert.rejects(lcuGet(connection, historyPath), { code: 'INVALID_CONNECTION' });
  }
  for (const path of [
    'https://example.com/', '//example.com/', '/lol-chat/v1/conversations',
    '/lol-match-history/v1/games/../1', '/lol-match-history/v1/games/1?redirect=x',
    historyPath + '?beginIndex=0&endIndex=19',
    historyPath + '?begIndex=0&endIndex=19&other=1',
    historyPath + '?begIndex=0&endIndex=100',
    historyPath + '?begIndex=99999&endIndex=100001',
  ]) {
    await assert.rejects(lcuGet(base, path), { code: 'INVALID_ENDPOINT' });
  }
});

test('readConnection rejects malformed and missing lockfiles without echoing them', async t => {
  const dir = await temporary(t);
  await assert.rejects(readConnection(join(dir, 'absent')), { code: 'CLIENT_NOT_RUNNING' });
  const path = join(dir, 'lockfile');
  for (const text of [
    'LeagueClient:1:70000:' + password + ':https',
    'LeagueClient:1:1234:' + password + ':http',
    'LeagueClient:1:1234:' + password + ':https:external', password,
  ]) {
    await writeFile(path, text);
    await assert.rejects(readConnection(path), error =>
      error.code === 'INVALID_LOCKFILE' && !error.stack.includes(password));
  }
});

test('HTTPS GET uses loopback auth, preserves raw body and does not expose headers', async t => {
  const raw = '{"gameId":9007199254740993123,"stats":{"visionScore":0}}\n';
  const remote = await server(t, (_req, res) => res.end(raw));
  const connection = await readConnection(await lockfile(await temporary(t), remote.port));
  const result = await lcuGet(connection, '/lol-match-history/v1/games/1');
  assert.equal(result.status, 200);
  assert.equal(result.body, raw);
  assert.deepEqual(remote.requests, [{
    path: '/lol-match-history/v1/games/1', method: 'GET', auth: authorization,
  }]);
  assert.equal(JSON.stringify(result).includes(password), false);
  assert.equal(JSON.stringify(result).includes(authorization), false);
  assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED, undefined);
});

test('reloadChangedLockfile: each collection uses the current port and password', async t => {
  const first = await server(t);
  const second = await server(t);
  const dir = await temporary(t);
  const path = await lockfile(dir, first.port);
  await collect({ lockfile: path, out: join(dir, 'captures'), operation: 'friends' });
  await lockfile(dir, second.port, 'replacement-password');
  await collect({ lockfile: path, out: join(dir, 'captures'), operation: 'friends' });
  assert.equal(first.requests.length, 1);
  assert.equal(second.requests.length, 1);
  assert.equal(second.requests[0].auth,
    'Basic ' + Buffer.from('riot:replacement-password').toString('base64'));
});

test('preserveMissingVersusZero and exact numeric game identifiers', () => {
  const output = parseJson('{"gameId":9007199254740993123,"stats":{"visionScore":0}}');
  assert.equal(output.gameId, '9007199254740993123');
  assert.equal(output.stats.visionScore, 0);
  assert.equal('objectiveDamage' in output.stats, false);
  assert.equal(parseJson('{"gameId":123}').gameId, '123');
  assert.equal(parseJson('{"gameId":"00123"}').gameId, '00123');
});

test('HTTP errors, timeout, empty responses and redirection stay distinguishable', async t => {
  const remote = await server(t, (req, res) => {
    if (req.url.endsWith('/1')) res.end('');
    else if (req.url.endsWith('/2')) { res.statusCode = 404; res.end('{"errorCode":"NOT_FOUND"}'); }
    else if (req.url.endsWith('/3')) { /* Deliberately never answer. */ }
    else { res.writeHead(302, { location: 'https://example.com/' }); res.end(); }
  });
  const connection = { port: remote.port, password, protocol: 'https' };
  assert.deepEqual(await lcuGet(connection, '/lol-match-history/v1/games/1'),
    { status: 200, body: '' });
  assert.equal((await lcuGet(connection, '/lol-match-history/v1/games/2')).status, 404);
  await assert.rejects(lcuGet(connection, '/lol-match-history/v1/games/3', { timeoutMs: 80 }),
    { code: 'LCU_TIMEOUT' });
  assert.equal((await lcuGet(connection, '/lol-match-history/v1/games/4')).status, 302);
  assert.equal(remote.requests.length, 4);
});

test('oversized and credential-bearing responses are not persisted', async t => {
  const remote = await server(t, (req, res) => {
    if (req.url.endsWith('/1')) res.end('x'.repeat(1024));
    else if (req.url.endsWith('/2')) res.end(JSON.stringify({ note: authorization }));
    else res.end('{"accessToken":"synthetic-other-secret"}');
  });
  const connection = { port: remote.port, password, protocol: 'https' };
  await assert.rejects(lcuGet(connection, '/lol-match-history/v1/games/1', { maxBytes: 100 }),
    { code: 'RESPONSE_TOO_LARGE' });
  for (const id of ['2', '3']) {
    await assert.rejects(lcuGet(connection, '/lol-match-history/v1/games/' + id),
      { code: 'SENSITIVE_RESPONSE' });
  }
  const dir = await temporary(t);
  await collect({ lockfile: await lockfile(dir, remote.port), out: join(dir, 'captures'),
    operation: 'game', value: '2' });
  const saved = JSON.stringify(await filesUnder(join(dir, 'captures')));
  for (const secret of [password, authorization, 'synthetic-other-secret']) {
    assert.equal(saved.includes(secret), false);
  }
  assert.match(saved, /SENSITIVE_RESPONSE/);
});

test('history stores exact response, metadata and bounded details without polling', async t => {
  const history = '{"games":{"games":[{"gameId":9007199254740993123},{"gameId":12},{"gameId":12}]}}';
  const remote = await server(t, (req, res) => {
    if (req.url === historyPath + '?begIndex=20&endIndex=39') res.end(history);
    else if (req.url.startsWith(historyPath)) {
      res.statusCode = 400;
      res.end('{"errorCode":"BAD_REQUEST","httpStatus":400,"message":"Unknown argument \'beginIndex\' for \'GetLolMatchHistoryV1ProductsLolCurrentSummonerMatches\'."}');
    }
    else if (req.url === '/lol-patch/v1/game-version') res.end('"test-patch"');
    else res.end('{"stats":{"visionScore":0}}');
  });
  const dir = await temporary(t);
  const result = await collect({
    lockfile: await lockfile(dir, remote.port), out: join(dir, 'captures'),
    operation: 'history', begin: 20, count: 20, clientVersion: 'manual-client-version',
  });
  assert.deepEqual(remote.requests.map(r => r.path), [
    '/lol-patch/v1/game-version', '/lol-summoner/v1/current-summoner',
    historyPath + '?begIndex=20&endIndex=39',
    '/lol-match-history/v1/games/9007199254740993123', '/lol-match-history/v1/games/12',
  ]);
  assert.equal(result.manifest.historyState, 'available');
  assert.equal(result.manifest.clientVersion, 'manual-client-version');
  assert.equal(result.manifest.requestCount, 5);
  assert.match(result.manifest.startedAt, /^\d{4}-/);
  const files = await filesUnder(result.directory);
  assert.ok(files.some(f => f.text === history));
  assert.equal(JSON.stringify(files).includes(password), false);
  assert.equal(result.manifest.gate, 'HOLD');
});

test('player history uses the documented begIndex query on the PUUID route', async t => {
  const remote = await server(t, (req, res) => {
    if (req.url === '/lol-patch/v1/game-version') res.end('"test-patch"');
    else if (req.url === '/lol-summoner/v1/current-summoner') res.end('{}');
    else if (req.url === '/lol-match-history/v1/products/lol/synthetic-puuid/matches?begIndex=0&endIndex=19') {
      res.end('{"games":{"games":[]}}');
    } else {
      res.statusCode = 400;
      res.end('{"errorCode":"BAD_REQUEST","message":"Unknown argument"}');
    }
  });
  const dir = await temporary(t);
  const result = await collect({ lockfile: await lockfile(dir, remote.port),
    out: join(dir, 'captures'), operation: 'player', value: 'synthetic-puuid' });
  assert.equal(result.manifest.historyState, 'empty');
  assert.equal(result.manifest.errors, 0);
  assert.equal(remote.requests.length, 3);
});

test('sensitive friend responses record fixed classifications without leaking keys or values', async t => {
  const cases = [
    { body: '[{"lol":{"challengeTokensSelected":"synthetic-private-value"}}]',
      want: { rules: ['sensitive-key'], keyCategories: ['token'], recognizedFields: ['challengeTokensSelected'] } },
    { body: '{"token-synthetic-private-key":"synthetic-private-value"}',
      want: { rules: ['sensitive-key'], keyCategories: ['token'], recognizedFields: [] } },
    { body: '{"note":"Bearer synthetic-private-value"}',
      want: { rules: ['credential-marker'], keyCategories: [], recognizedFields: [] } },
    { body: JSON.stringify({ note: password }).replace('synthetic', '\\u0073ynthetic'),
      want: { rules: ['credential-value'], keyCategories: [], recognizedFields: [] } },
    { body: JSON.stringify({ [password]: 'synthetic-private-value' }),
      want: { rules: ['credential-value', 'sensitive-key'], keyCategories: ['password'], recognizedFields: [] } },
    { body: '[{"lol":{"challengeTokenNamesSelected":"synthetic-private-value"},"refreshToken":"synthetic-other-secret","cookie":"synthetic-cookie"}]',
      want: { rules: ['sensitive-key'], keyCategories: ['cookie', 'token'], recognizedFields: ['challengeTokenNamesSelected'] } },
  ];
  let body;
  const remote = await server(t, (_req, res) => res.end(body));
  const dir = await temporary(t);
  const path = await lockfile(dir, remote.port);
  for (const row of cases) {
    body = row.body;
    const result = await collect({ lockfile: path, out: join(dir, 'captures'), operation: 'friends' });
    const entry = result.manifest.responses[0];
    assert.equal(entry.status, 200);
    assert.equal(entry.error, 'SENSITIVE_RESPONSE');
    assert.deepEqual(entry.sensitivity, row.want);
    assert.equal('bodyFile' in entry, false);
    assert.deepEqual(await readdir(result.directory), ['manifest.json']);
  }
  const saved = JSON.stringify(await filesUnder(join(dir, 'captures')));
  for (const secret of [password, 'token-synthetic-private-key', 'synthetic-private-value',
    'synthetic-other-secret', 'synthetic-cookie']) assert.equal(saved.includes(secret), false);
});

test('CLI shows safe failure diagnostics and keeps sensitive response bodies out of output', async t => {
  const remote = await server(t, (_req, res) =>
    res.end('[{"lol":{"challengeTokensSelected":"synthetic-private-value"}}]'));
  const dir = await temporary(t);
  const output = new PassThrough();
  let log = '';
  output.on('data', data => { log += data; });
  assert.equal(await main(['--lockfile', await lockfile(dir, remote.port),
    '--out', '.private/lcu/friends', '--friends'], { cwd: dir, output }), 2);
  assert.match(log, /friends.*HTTP=200.*SENSITIVE_RESPONSE/);
  assert.match(log, /sensitive-key/);
  assert.match(log, /challengeTokensSelected/);
  assert.equal(log.includes('synthetic-private-value'), false);
  assert.equal(log.includes(password), false);
});

test('friends persist numeric challenge selections at the exact lol field without altering raw JSON', async t => {
  let raw;
  const remote = await server(t, (_req, res) => res.end(raw));
  const dir = await temporary(t);
  const path = await lockfile(dir, remote.port);
  for (const selection of ['', '0', '101001', '101001,202002,303003']) {
    raw = JSON.stringify([{ puuid: 'synthetic-friend', note: 'Display text: {"x":1,"x":2} []',
      lol: { challengeTokensSelected: selection } }]) + '\n';
    const result = await collect({ lockfile: path, out: join(dir, 'captures'), operation: 'friends' });
    assert.equal(result.manifest.errors, 0);
    const entry = result.manifest.responses[0];
    assert.equal(entry.state, 'ok');
    assert.equal(entry.status, 200);
    assert.equal(entry.sensitivity, undefined);
    assert.equal(await readFile(join(result.directory, entry.bodyFile), 'utf8'), raw);
  }
});

test('challenge selection exception cannot admit arbitrary tokens, locations or value shapes', async t => {
  let raw;
  const remote = await server(t, (_req, res) => res.end(raw));
  const connection = { port: remote.port, password, protocol: 'https' };
  for (const body of [
    [{ lol: { challengeTokensSelected: '101001,202002,303003', accessToken: 'other-credential' } }],
    [{ lol: { challengeTokensSelected: 'other-credential' } }],
    [{ lol: { challengeTokensSelected: { accessToken: 'other-credential' } } }],
    [{ lol: { challengeTokensSelected: ['101001'] } }],
    [{ lol: { challengeTokensSelected: '1,2,3,4' } }],
    [{ lol: { challengeTokensSelected: null } }],
    [{ lol: { challengeTokenNamesSelected: '101001' } }],
    [{ challengeTokensSelected: '101001' }],
    { lol: { challengeTokensSelected: '101001' } },
    [{ lol: { nested: { challengeTokensSelected: '101001' } } }],
    [{ lol: [{ challengeTokensSelected: '101001' }] }],
  ]) {
    raw = JSON.stringify(body);
    await assert.rejects(lcuGet(connection, '/lol-chat/v1/friends'), { code: 'SENSITIVE_RESPONSE' });
  }
  raw = '[{"lol":{"challengeTokensSelected":"101001"}}]';
  await assert.rejects(lcuGet(connection, '/lol-match-history/v1/games/1'), { code: 'SENSITIVE_RESPONSE' });
});

test('known credential values stay blocked even inside a valid numeric challenge selection', async t => {
  const numericPassword = '101001';
  const remote = await server(t, (_req, res) =>
    res.end('[{"lol":{"challengeTokensSelected":"101001,202002"}}]'));
  const dir = await temporary(t);
  const result = await collect({ lockfile: await lockfile(dir, remote.port, numericPassword),
    out: join(dir, 'captures'), operation: 'friends' });
  const entry = result.manifest.responses[0];
  assert.equal(entry.error, 'SENSITIVE_RESPONSE');
  assert.deepEqual(entry.sensitivity.rules, ['credential-value']);
  assert.equal(entry.bodyFile, undefined);
  assert.equal(JSON.stringify(await filesUnder(join(dir, 'captures'))).includes(numericPassword), false);
});

test('duplicate JSON keys cannot hide discarded credentials behind allowed challenge selections', async t => {
  let raw;
  const remote = await server(t, (_req, res) => res.end(raw));
  const dir = await temporary(t);
  const path = await lockfile(dir, remote.port);
  for (const body of [
    '[{"lol":{"challengeTokensSelected":"\\u0073ynthetic-password-DO-NOT-USE","challengeTokensSelected":"101001"}}]',
    '[{"lol":{"challenge\\u0054okensSelected":"\\u0073ynthetic-password-DO-NOT-USE","challengeTokensSelected":"101001"}}]',
    '[{"lol":{"accessToken":"other-credential"},"lol":{"challengeTokensSelected":"101001"}}]',
    '[{"lol":{"challengeTokensSelected":"101001"},"a\\\"b":1,"a\\u0022b":2}]',
  ]) {
    raw = body;
    const result = await collect({ lockfile: path, out: join(dir, 'captures'), operation: 'friends' });
    const entry = result.manifest.responses[0];
    assert.equal(entry.status, 200);
    assert.equal(entry.error, 'DUPLICATE_JSON_KEYS');
    assert.equal(entry.bodyFile, undefined);
    assert.deepEqual(await readdir(result.directory), ['manifest.json']);
  }
  const saved = JSON.stringify(await filesUnder(join(dir, 'captures')));
  assert.equal(saved.includes(password), false);
  assert.equal(saved.includes('other-credential'), false);
});

test('README placeholder PUUID is rejected before creating a session or sending requests', async t => {
  const remote = await server(t);
  const dir = await temporary(t);
  const output = new PassThrough();
  let log = '';
  output.on('data', data => { log += data; });
  assert.equal(await main(['--lockfile', await lockfile(dir, remote.port),
    '--out', '.private/lcu/player', '--player', 'REPLACE_WITH_PUUID'], { cwd: dir, output }), 1);
  assert.match(log, /INVALID_PUUID/);
  assert.equal(remote.requests.length, 0);
  await assert.rejects(readFile(join(dir, '.private/lcu/player/session.json')), { code: 'ENOENT' });
});

test('unknown history schema is retained and not reported as empty history', async t => {
  const remote = await server(t, (_req, res) => res.end('{"unexpected":[]}'));
  const dir = await temporary(t);
  const result = await collect({ lockfile: await lockfile(dir, remote.port),
    out: join(dir, 'captures'), operation: 'history' });
  assert.equal(result.manifest.historyState, 'unknown-schema');
  assert.equal(remote.requests.length, 3);
});

test('historyOnlyOnExplicitCommand: idle CLI has zero requests; history triggers collection', async t => {
  const remote = await server(t, (_req, res) => res.end('{"games":{"games":[]}}'));
  const dir = await temporary(t);
  const input = new PassThrough();
  const output = new PassThrough();
  let log = '';
  output.on('data', data => { log += data; });
  const ready = once(output, 'data');
  const running = main(['--lockfile', await lockfile(dir, remote.port),
    '--out', '.private/lcu/test-run', '--interactive'], { cwd: dir, input, output });
  await ready;
  assert.equal(remote.requests.length, 0);
  assert.equal(JSON.parse(await readFile(join(dir, '.private/lcu/test-run/session.json'))).requestCount, 0);
  input.end('history\nquit\n');
  assert.equal(await running, 0);
  assert.equal(remote.requests.length, 3);
  assert.equal(log.includes(password), false);
  const files = await filesUnder(join(dir, '.private/lcu/test-run'));
  assert.ok(files.some(f => f.text.includes('"historyState": "empty"')));
});

test('CLI refuses unsafe output and invalid options before making requests', async t => {
  const remote = await server(t);
  const dir = await temporary(t);
  const path = await lockfile(dir, remote.port);
  for (const extra of [
    ['--out', 'public'], ['--out', '.private/lcu/x', '--count', '0'],
    ['--out', '.private/lcu/x', '--game', '../1'],
    ['--out', '.private/lcu/x', '--friends', '--game', '1'],
  ]) {
    const output = new PassThrough();
    let log = '';
    output.on('data', data => { log += data; });
    assert.equal(await main(['--lockfile', path, ...extra], { cwd: dir, output }), 1);
    assert.equal(log.includes(password), false);
  }
  assert.equal(remote.requests.length, 0);
});

test('redactSecretsAndStableIdentifiers: consistent aliases across games, no private fields', () => {
  const aliases = new Map();
  const first = redactCapture({
    gameId: '9007199254740993123', platformId: 'KR',
    participants: [{ participantId: 1, puuid: 'real-puuid-A', summonerName: 'Real Name',
      stats: { visionScore: 0, kills: 4 }, accessToken: password }],
    unknownField: 'unreviewed private text', 'real-puuid-as-key': { goldEarned: 3 },
  }, aliases);
  const second = redactCapture({
    gameId: '2', participants: [{ participantId: 1, puuid: 'real-puuid-A',
      summonerName: 'Changed Name', stats: { visionScore: 12, kills: 2 } }],
  }, aliases);
  assert.equal(first.participants[0].puuid, second.participants[0].puuid);
  assert.notEqual(first.gameId, second.gameId);
  assert.equal(first.participants[0].stats.visionScore, 0);
  assert.equal('objectiveDamage' in first.participants[0].stats, false);
  const saved = JSON.stringify([first, second]);
  for (const sensitive of [password, 'real-puuid-A', 'Real Name', 'Changed Name',
    '9007199254740993123', 'unreviewed private text', 'real-puuid-as-key']) {
    assert.equal(saved.includes(sensitive), false);
  }
  assert.equal(first.platformId, 'KR');
});

test('malformed JSON is withheld with HTTP status rather than saving unparseable secrets', async t => {
  const remote = await server(t, (_req, res) => {
    res.statusCode = 502;
    res.end('{"accessToken":"unknown-secret",');
  });
  const dir = await temporary(t);
  const result = await collect({ lockfile: await lockfile(dir, remote.port),
    out: join(dir, 'captures'), operation: 'friends' });
  assert.equal(result.manifest.responses[0].status, 502);
  assert.equal(result.manifest.responses[0].error, 'NON_JSON_RESPONSE');
  assert.equal('bodyFile' in result.manifest.responses[0], false);
  assert.equal(JSON.stringify(await filesUnder(result.directory)).includes('unknown-secret'), false);
});

test('missing lockfile and refused LCU connection produce different capture evidence', async t => {
  const remote = await server(t);
  const port = remote.port;
  await new Promise(resolve => remote.instance.close(resolve));
  const dir = await temporary(t);
  const closed = await collect({ lockfile: join(dir, 'absent'), out: join(dir, 'captures'),
    operation: 'friends' });
  const unavailable = await collect({ lockfile: await lockfile(dir, port), out: join(dir, 'captures'),
    operation: 'friends' });
  assert.equal(closed.manifest.responses[0].error, 'CLIENT_NOT_RUNNING');
  assert.equal(unavailable.manifest.responses[0].error, 'LCU_UNAVAILABLE');
  assert.equal(closed.manifest.requestCount, 0);
  assert.equal(unavailable.manifest.requestCount, 1);
});

test('CLI rejects reused output and a junction outside .private', async t => {
  const remote = await server(t, (_req, res) => res.end('[]'));
  const dir = await temporary(t);
  const path = await lockfile(dir, remote.port);
  const output = new PassThrough();
  output.resume();
  const args = ['--lockfile', path, '--out', '.private/lcu/run', '--friends'];
  assert.equal(await main(args, { cwd: dir, output }), 0);
  assert.equal(await main(args, { cwd: dir, output }), 1);
  assert.equal(remote.requests.length, 1);
  const external = join(dir, 'outside');
  await mkdir(external);
  await symlink(external, join(dir, '.private/lcu/link'), 'junction');
  assert.equal(await main(['--lockfile', path, '--out', '.private/lcu/link/run', '--friends'],
    { cwd: dir, output }), 1);
  assert.deepEqual(await readdir(external), []);
});

test('offline redaction writes consistent private candidates and refuses public output', async t => {
  const { main: redactMain } = await import('./redact.mjs');
  assert.equal(typeof redactMain, 'function');
  const dir = await temporary(t);
  await mkdir(join(dir, '.private/lcu/raw'), { recursive: true });
  for (const id of ['1', '2']) {
    await writeFile(join(dir, '.private/lcu/raw/' + id + '.json'), JSON.stringify({
      gameId: id, participants: [{ puuid: 'original-identity', stats: { kills: 0 } }],
    }));
  }
  const output = new PassThrough();
  output.resume();
  const args = ['--input', '.private/lcu/raw/1.json', '--input', '.private/lcu/raw/2.json'];
  assert.equal(await redactMain([...args, '--out', 'fixtures/lcu/verified'],
    { cwd: dir, output }), 1);
  assert.equal(await redactMain([...args, '--out', '.private/lcu/candidates'],
    { cwd: dir, output }), 0);
  const first = JSON.parse(await readFile(join(dir, '.private/lcu/candidates/001.json')));
  const second = JSON.parse(await readFile(join(dir, '.private/lcu/candidates/002.json')));
  assert.equal(first.participants[0].puuid, second.participants[0].puuid);
  assert.equal(JSON.stringify([first, second]).includes('original-identity'), false);
  const manifest = JSON.parse(await readFile(join(dir, '.private/lcu/candidates/manifest.json')));
  assert.equal(manifest.gate, 'HOLD');
  assert.equal(manifest.reviewRequired, true);
  assert.equal(await redactMain([...args, '--out', '.private/lcu/candidates'],
    { cwd: dir, output }), 1);
});

test('interrupted body retains received HTTP status in capture evidence', async t => {
  const remote = await server(t, (_req, res) => {
    res.writeHead(503);
    res.write('{"incomplete":');
    setTimeout(() => res.destroy(), 20);
  });
  const dir = await temporary(t);
  const result = await collect({ lockfile: await lockfile(dir, remote.port),
    out: join(dir, 'captures'), operation: 'friends' });
  assert.equal(result.manifest.responses[0].error, 'RESPONSE_INTERRUPTED');
  assert.equal(result.manifest.responses[0].status, 503);
  assert.equal('bodyFile' in result.manifest.responses[0], false);
});

test('timeout after receiving headers retains HTTP status without exposing partial body', async t => {
  const remote = await server(t, (_req, res) => {
    res.writeHead(503);
    res.write('{"partial":"sensitive');
  });
  await assert.rejects(lcuGet({ port: remote.port, password, protocol: 'https' },
    '/lol-chat/v1/friends', { timeoutMs: 80 }), error => {
    assert.equal(error.code, 'LCU_TIMEOUT');
    assert.equal(error.status, 503);
    assert.equal(JSON.stringify(error).includes('sensitive'), false);
    return true;
  });
});
