import https from "node:https";
import { readFile } from "node:fs/promises";

export class ProbeError extends Error {
  constructor(code, status, sensitivity) {
    super(code);
    this.name = "ProbeError";
    this.code = code;
    if (status !== undefined) this.status = status;
    if (sensitivity !== undefined) this.sensitivity = sensitivity;
  }
}

const secretKey = /password|authorization|token|secret|cookie|lockfile/gi;
const diagnosticFields = new Set([
  "challengeTokensSelected",
  "challengeTokenNamesSelected",
]);
const accountKey = /^(gameId|accountId|currentAccountId|summonerId)$/;

// Node 24's reviver source preserves integer identifiers before Number rounding.
// Raw response files are saved separately, without JSON reserialization.
export function parseJson(text) {
  return JSON.parse(text, (key, value, context) => {
    if (typeof value === "number" && accountKey.test(key))
      return context.source;
    if (
      typeof value === "number" &&
      Number.isInteger(value) &&
      !Number.isSafeInteger(value)
    ) {
      return context.source;
    }
    return value;
  });
}

export async function readConnection(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new ProbeError(
      error.code === "ENOENT" ? "CLIENT_NOT_RUNNING" : "LOCKFILE_UNREADABLE",
    );
  }
  const match =
    text.length <= 4096 &&
    /^LeagueClient:[1-9]\d*:(\d{1,5}):([A-Za-z0-9_-]{1,256}):https\s*$/.exec(
      text,
    );
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) {
    throw new ProbeError("INVALID_LOCKFILE");
  }
  return { port: Number(match[1]), password: match[2], protocol: "https" };
}

function validPath(path) {
  if (typeof path !== "string") return false;
  if (
    [
      "/lol-summoner/v1/current-summoner",
      "/lol-chat/v1/friends",
      "/lol-patch/v1/game-version",
    ].includes(path)
  )
    return true;
  if (/^\/lol-match-history\/v1\/(games|game-timelines)\/\d{1,30}$/.test(path))
    return true;
  const history =
    /^\/lol-match-history\/v1\/products\/lol\/[A-Za-z0-9_-]{1,128}\/matches(?:\?begIndex=(\d+)&endIndex=(\d+))?$/.exec(
      path,
    );
  if (!history) return false;
  if (history[1] === undefined) return true;
  const begin = Number(history[1]);
  const end = Number(history[2]);
  return (
    Number.isSafeInteger(begin) &&
    Number.isSafeInteger(end) &&
    begin >= 0 &&
    end >= begin &&
    end - begin < 100 &&
    end <= 100000
  );
}

function hasDuplicateJsonKeys(text) {
  // The caller has already validated JSON syntax. Track object scopes in the
  // original text because JSON.parse discards earlier duplicate members.
  const scopes = [];
  for (const match of text.matchAll(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\]]/g)) {
    const token = match[0];
    if (token === "{") scopes.push(new Set());
    else if (token === "[") scopes.push(null);
    else if (token === "}" || token === "]") scopes.pop();
    else {
      let after = match.index + token.length;
      while (after < text.length && /\s/.test(text[after])) after++;
      if (text[after] !== ":") continue;
      const key = JSON.parse(token);
      const keys = scopes.at(-1);
      if (keys.has(key)) return true;
      keys.add(key);
    }
  }
  return false;
}

function sensitivityDetails(body, decoded, secrets, path) {
  const rules = new Set();
  const keyCategories = new Set();
  const recognizedFields = new Set();
  const friendLolObjects = new WeakSet();
  if (path === "/lol-chat/v1/friends" && Array.isArray(decoded)) {
    for (const friend of decoded) {
      if (
        friend &&
        !Array.isArray(friend) &&
        friend.lol &&
        typeof friend.lol === "object" &&
        !Array.isArray(friend.lol)
      ) {
        friendLolObjects.add(friend.lol);
      }
    }
  }
  if (secrets.some((secret) => body.includes(secret)))
    rules.add("credential-value");
  if (/authorization\s*[:=]|bearer\s+/i.test(body))
    rules.add("credential-marker");
  const pending = [decoded];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === "string") {
      if (secrets.some((secret) => value.includes(secret)))
        rules.add("credential-value");
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (secrets.some((secret) => key.includes(secret)))
          rules.add("credential-value");
        // Challenge badges are gameplay data. Exempt only this exact friends
        // field with empty or up to three comma-separated decimal IDs. Continue
        // scanning its value, and retain all credential-value/marker checks.
        const challengeSelection =
          friendLolObjects.has(value) &&
          key === "challengeTokensSelected" &&
          typeof child === "string" &&
          /^(?:\d{1,10}(?:,\d{1,10}){0,2})?$/.test(child);
        const categories = challengeSelection
          ? []
          : (key.match(secretKey) ?? []);
        if (categories.length) {
          rules.add("sensitive-key");
          for (const category of categories)
            keyCategories.add(category.toLowerCase());
          // Only fixed, reviewed field labels may leave this function. Never echo
          // arbitrary keys, paths or values: any of them may contain credentials.
          if (diagnosticFields.has(key)) recognizedFields.add(key);
        }
        pending.push(child);
      }
    }
  }
  if (!rules.size) return undefined;
  return {
    rules: [...rules].sort(),
    keyCategories: [...keyCategories].sort(),
    recognizedFields: [...recognizedFields].sort(),
  };
}

export async function lcuGet(
  connection,
  path,
  { timeoutMs = 8000, maxBytes = 16 * 1024 * 1024 } = {},
) {
  if (
    !connection ||
    connection.protocol !== "https" ||
    !Number.isInteger(connection.port) ||
    connection.port < 1 ||
    connection.port > 65535 ||
    !/^[A-Za-z0-9_-]{1,256}$/.test(connection.password ?? "") ||
    (connection.host !== undefined && connection.host !== "127.0.0.1") ||
    (connection.hostname !== undefined && connection.hostname !== "127.0.0.1")
  ) {
    throw new ProbeError("INVALID_CONNECTION");
  }
  if (!validPath(path)) throw new ProbeError("INVALID_ENDPOINT");
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    !Number.isInteger(maxBytes) ||
    maxBytes < 1
  ) {
    throw new ProbeError("INVALID_LIMIT");
  }
  const encoded = Buffer.from("riot:" + connection.password).toString("base64");
  const secrets = [connection.password, encoded];
  return new Promise((resolve, reject) => {
    let timer;
    let receivedStatus;
    const request = https.request(
      {
        hostname: "127.0.0.1",
        port: connection.port,
        path,
        method: "GET",
        headers: {
          Authorization: "Basic " + encoded,
          Accept: "application/json",
        },
        // Local LCU uses its own certificate. Never change global TLS settings.
        rejectUnauthorized: false,
        agent: false,
      },
      (response) => {
        receivedStatus = response.statusCode;
        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > maxBytes) {
            // end may fire before request.error after destroy; reject immediately.
            clearTimeout(timer);
            reject(new ProbeError("RESPONSE_TOO_LARGE", response.statusCode));
            request.destroy();
          } else chunks.push(chunk);
        });
        response.on("error", () => {
          clearTimeout(timer);
          reject(new ProbeError("RESPONSE_INTERRUPTED", receivedStatus));
        });
        response.on("end", () => {
          clearTimeout(timer);
          const body = Buffer.concat(chunks).toString("utf8");
          let decoded;
          try {
            decoded = parseJson(body);
          } catch {
            // Unparseable text cannot be inspected reliably for arbitrary secret fields.
            if (body.length > 0) {
              reject(new ProbeError("NON_JSON_RESPONSE", response.statusCode));
              return;
            }
          }
          if (hasDuplicateJsonKeys(body)) {
            reject(new ProbeError("DUPLICATE_JSON_KEYS", response.statusCode));
            return;
          }
          const sensitivity = sensitivityDetails(body, decoded, secrets, path);
          if (sensitivity) {
            reject(
              new ProbeError(
                "SENSITIVE_RESPONSE",
                response.statusCode,
                sensitivity,
              ),
            );
          } else {
            resolve({ status: response.statusCode, body });
          }
        });
      },
    );
    timer = setTimeout(
      () => request.destroy(new ProbeError("LCU_TIMEOUT")),
      timeoutMs,
    );
    request.on("error", (error) => {
      clearTimeout(timer);
      const code =
        error instanceof ProbeError
          ? error.code
          : error.code === "ECONNREFUSED"
            ? "LCU_UNAVAILABLE"
            : "LCU_NETWORK_ERROR";
      reject(new ProbeError(code, receivedStatus));
    });
    request.end();
  });
}
