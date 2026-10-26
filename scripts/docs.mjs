import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REGISTRY = "docs/ssot.json";
const INDEX = "docs/README.md";
const ROLES = new Set(["canonical", "reference", "historical"]);
const PRESERVED_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value) =>
  typeof value === "string" && value.trim().length > 0;
const markdown = (name) => /\.md$/iu.test(name);
const cleanPath = (value) =>
  nonempty(value) &&
  !/[\\?#\r\n]/u.test(value) &&
  !path.posix.isAbsolute(value) &&
  value
    .split("/")
    .every((part) => part !== "" && part !== "." && part !== "..");
const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const issue = (errors, file, line, code, message) =>
  errors.push({ path: file, line, code, message });

function readRegistry(root, errors) {
  let text;
  let registry;
  try {
    text = readFileSync(path.join(root, REGISTRY), "utf8");
    registry = JSON.parse(text);
  } catch {
    issue(
      errors,
      REGISTRY,
      1,
      "registry",
      "등록부를 읽을 수 없거나 JSON 형식이 잘못되었습니다.",
    );
    return null;
  }
  const invalid = (message) => issue(errors, REGISTRY, 1, "registry", message);
  if (
    !isObject(registry) ||
    registry.version !== 1 ||
    !Array.isArray(registry.documents) ||
    !Array.isArray(registry.topics) ||
    !Array.isArray(registry.conditionalEvidence)
  ) {
    invalid(
      "version: 1과 documents, topics, conditionalEvidence 배열이 필요합니다.",
    );
    return null;
  }
  const seen = new Set();
  for (const entry of registry.documents) {
    if (
      !isObject(entry) ||
      !cleanPath(entry.path) ||
      !markdown(entry.path) ||
      !ROLES.has(entry.role)
    ) {
      invalid(
        "각 문서에는 저장소 안의 Markdown 경로와 canonical/reference/historical 역할이 필요합니다.",
      );
      continue;
    }
    if (seen.has(entry.path))
      invalid(`문서 경로가 중복되었습니다: ${entry.path}`);
    seen.add(entry.path);
    if (entry.date !== undefined && !validDate(entry.date))
      invalid(`실제 날짜를 YYYY-MM-DD로 적어 주세요: ${entry.path}`);
    if (
      entry.current !== undefined &&
      (!cleanPath(entry.current) || !markdown(entry.current))
    )
      invalid(`현재 문서 경로가 잘못되었습니다: ${entry.path}`);
    if (
      entry.role === "historical" &&
      (!validDate(entry.date) ||
        !cleanPath(entry.current) ||
        !markdown(entry.current))
    )
      invalid(`이력 문서에는 date와 current가 필요합니다: ${entry.path}`);
    if (entry.preserved !== undefined) {
      if (entry.role !== "historical" || !Array.isArray(entry.preserved)) {
        invalid(
          `preserved는 이력 문서의 배열로만 등록할 수 있습니다: ${entry.path}`,
        );
        continue;
      }
      const ids = new Set();
      for (const saved of entry.preserved) {
        if (
          !isObject(saved) ||
          typeof saved.id !== "string" ||
          !PRESERVED_ID.test(saved.id) ||
          !nonempty(saved.reason) ||
          typeof saved.sha256 !== "string" ||
          !/^[a-f0-9]{64}$/u.test(saved.sha256)
        ) {
          invalid(
            `보존 구간에는 소문자 id, 보존 이유 reason, SHA-256 소문자 64자리 sha256이 필요합니다: ${entry.path}`,
          );
          continue;
        }
        if (ids.has(saved.id))
          invalid(`보존 구간 id가 중복되었습니다: ${entry.path}#${saved.id}`);
        ids.add(saved.id);
      }
    }
  }
  for (const topic of registry.topics) {
    if (
      !isObject(topic) ||
      !nonempty(topic.id) ||
      !nonempty(topic.title) ||
      !nonempty(topic.source)
    ) {
      invalid("각 주제에는 비어 있지 않은 id, title, source가 필요합니다.");
      continue;
    }
    const [source, ...fragments] = topic.source.split("#");
    if (
      !cleanPath(source) ||
      fragments.length > 1 ||
      (fragments.length === 1 && !nonempty(fragments[0]))
    )
      invalid(`주제 원본 경로가 잘못되었습니다: ${topic.source}`);
  }
  for (const evidence of registry.conditionalEvidence) {
    if (
      !isObject(evidence) ||
      !nonempty(evidence.prefix) ||
      !evidence.prefix.endsWith("/") ||
      !cleanPath(evidence.prefix.slice(0, -1)) ||
      !nonempty(evidence.reason)
    )
      invalid(
        "조건부 근거에는 저장소 안의 디렉터리 prefix(끝에 /)와 reason이 필요합니다.",
      );
  }
  return errors.length ? null : { registry, text };
}

function registryLine(text, value) {
  const offset = text.indexOf(JSON.stringify(value));
  return offset < 0 ? 1 : text.slice(0, offset).split("\n").length;
}
const cell = (text) => text.replaceAll("|", "\\|").replace(/[\r\n]/gu, " ");
const destination = (text) =>
  text.replace(/[\s()<>]/gu, (char) => encodeURIComponent(char));
function indexLink(target, title = target) {
  const [file, anchor] = target.split("#");
  const relative = path.posix.relative("docs", file);
  return `[${cell(title)}](${destination(relative)}${anchor === undefined ? "" : `#${destination(anchor)}`})`;
}

export function generateIndex(registry) {
  const lines = [
    "# 문서 안내",
    "",
    "<!-- docs/ssot.json에서 생성합니다. pnpm docs:index로 갱신하세요. -->",
    "",
    "주제별 원본과 문서 역할은 [문서 등록부](ssot.json)에서 관리합니다. 내용은 아래 원본에서 확인하고, 안내·이력 문서는 원본으로 연결합니다.",
    "",
    "## 주제별 원본",
    "",
    "| 주제 | 원본 |",
    "| --- | --- |",
    ...registry.topics.map(
      (topic) =>
        `| ${cell(topic.id)} | ${indexLink(topic.source, topic.title)} |`,
    ),
  ];
  for (const [role, title] of [
    ["canonical", "기준 문서"],
    ["reference", "안내·근거 문서"],
    ["historical", "이력 문서"],
  ]) {
    lines.push("", `## ${title}`, "");
    const entries = registry.documents.filter((entry) => entry.role === role);
    if (!entries.length) lines.push("등록된 문서가 없습니다.");
    for (const entry of entries) {
      const history =
        role === "historical"
          ? ` — ${entry.date}, 현재: ${indexLink(entry.current)}`
          : "";
      lines.push(`- ${indexLink(entry.path)}${history}`);
    }
  }
  lines.push(
    "",
    "## 보존한 과거 기록 구간",
    "",
    "이력 문서도 중복을 검사합니다. 당시 결정·측정·근거를 남겨야 하는 아래 구간만 등록한 내용 해시가 일치할 때 중복 비교에서 제외합니다. 링크와 제목 연결은 계속 검사합니다.",
    "",
    "| 문서 | 구간 ID | 보존 이유 |",
    "| --- | --- | --- |",
  );
  for (const entry of registry.documents)
    for (const saved of entry.preserved ?? [])
      lines.push(
        `| ${indexLink(entry.path)} | \`${cell(saved.id)}\` | ${cell(saved.reason)} |`,
      );
  lines.push(
    "",
    "## 조건부 근거",
    "",
    "공개 저장소에 없는 근거는 아래 경로가 Git에서 제외된 경우에만 파일 존재 검사를 생략합니다. 공개 문서의 링크와 제목 연결은 계속 검사합니다.",
    "",
    "| 경로 | 이유 |",
    "| --- | --- |",
  );
  for (const entry of registry.conditionalEvidence)
    lines.push(`| \`${cell(entry.prefix)}\` | ${cell(entry.reason)} |`);
  return `${lines.join("\n")}\n`;
}

export function writeIndex({ root = process.cwd() } = {}) {
  const errors = [];
  const loaded = readRegistry(root, errors);
  if (!loaded) return { errors, index: null };
  const index = generateIndex(loaded.registry);
  mkdirSync(path.join(root, "docs"), { recursive: true });
  writeFileSync(path.join(root, INDEX), index);
  return { errors, index };
}

function visibleLines(text) {
  let fence = null;
  return text
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
      if (fence) {
        if (
          marker &&
          marker[1][0] === fence.char &&
          marker[1].length >= fence.length &&
          marker[2].trim() === ""
        )
          fence = null;
        return "";
      }
      if (marker) {
        fence = { char: marker[1][0], length: marker[1].length };
        return "";
      }
      return line;
    });
}
function withoutCode(line) {
  return line.replace(/(`+)(.*?)\1/gu, (span) => " ".repeat(span.length));
}
function unescapeMarkdown(text) {
  return text.replace(/\\([\\`*_{}[\]()#+.!<> -])/gu, "$1");
}
function headingSlug(text) {
  return unescapeMarkdown(text)
    .replace(/!?(\[([^\]]+)\])\([^)]*\)/gu, "$2")
    .replace(/<[^>]*>/gu, "")
    .replace(/&(?:amp|lt|gt|quot|apos);/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\s-]/gu, "")
    .replace(/\s/gu, "-");
}
function anchorsFor(lines) {
  const anchors = new Set();
  const usedHeadings = new Set();
  const addHeading = (text) => {
    const base = headingSlug(text.trim());
    let slug = base;
    let suffix = 0;
    while (usedHeadings.has(slug)) slug = `${base}-${++suffix}`;
    usedHeadings.add(slug);
    anchors.add(slug);
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = line.match(/^ {0,3}#{1,6}[\t ]+(.*?)(?:[\t ]+#+[\t ]*)?$/u);
    if (heading) addHeading(heading[1]);
    else if (
      i > 0 &&
      /^ {0,3}(?:=+|-+)[\t ]*$/u.test(line) &&
      lines[i - 1].trim()
    )
      addHeading(lines[i - 1]);
    for (const tag of line.matchAll(
      /<[A-Za-z][^>]*\s(?:id|name)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gu,
    ))
      anchors.add(tag[1] ?? tag[2] ?? tag[3]);
  }
  return anchors;
}
function referenceId(text) {
  return unescapeMarkdown(text).trim().replace(/\s+/gu, " ").toLowerCase();
}

// 괄호가 있는 파일명과 선택적인 링크 제목을 구분한다.
function linkDestination(text, start, inline) {
  let i = start;
  while (/\s/u.test(text[i] ?? "") && i < text.length) i++;
  let target = "";
  if (text[i] === "<") {
    const end = text.indexOf(">", i + 1);
    if (end < 0) return null;
    target = text.slice(i + 1, end);
    i = end + 1;
  } else {
    let depth = 0;
    for (; i < text.length; i++) {
      const char = text[i];
      if (char === "\\" && i + 1 < text.length) {
        target += char + text[++i];
        continue;
      }
      if (char === "(") depth++;
      if (char === ")") {
        if (depth === 0) break;
        depth--;
      }
      if (/\s/u.test(char) && depth === 0) break;
      target += char;
    }
  }
  if (!inline) return { target: unescapeMarkdown(target), end: i };
  while (/\s/u.test(text[i] ?? "") && i < text.length) i++;
  if (text[i] === '"' || text[i] === "'") {
    const quote = text[i++];
    while (i < text.length && text[i] !== quote) {
      if (text[i] === "\\") i++;
      i++;
    }
    i++;
    while (/\s/u.test(text[i] ?? "") && i < text.length) i++;
  }
  return text[i] === ")"
    ? { target: unescapeMarkdown(target), end: i + 1 }
    : null;
}
function linksFor(lines) {
  const definitions = new Map();
  const definitionLines = new Set();
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^ {0,3}\[([^\]]+)\]:\s*(.*)$/u);
    if (!match) continue;
    const target = linkDestination(match[2] || lines[i + 1] || "", 0, false);
    if (target) definitions.set(referenceId(match[1]), target.target);
    definitionLines.add(i);
    if (!match[2]) definitionLines.add(i + 1);
  }
  const links = [];
  for (let i = 0; i < lines.length; i++) {
    if (definitionLines.has(i)) continue;
    const line = withoutCode(lines[i]);
    const brackets = /!?\[((?:[^\]\\]|\\.|\[[^\]]*\])*)\]/gu;
    let match;
    while ((match = brackets.exec(line))) {
      if (match.index > 0 && line[match.index - 1] === "\\") continue;
      let next = brackets.lastIndex;
      if (line[next] === "(") {
        const parsed = linkDestination(line, next + 1, true);
        if (parsed) {
          links.push({
            target: parsed.target,
            line: i + 1,
            image: match[0].startsWith("!"),
          });
          brackets.lastIndex = parsed.end;
        }
      } else {
        const explicit = line.slice(next).match(/^\[([^\]]*)\]/u);
        const label = referenceId(explicit?.[1] || match[1]);
        if (definitions.has(label))
          links.push({
            target: definitions.get(label),
            line: i + 1,
            image: match[0].startsWith("!"),
          });
        else if (explicit) links.push({ reference: label, line: i + 1 });
        if (explicit) brackets.lastIndex = next + explicit[0].length;
      }
    }
  }
  return links;
}
function inside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}
function resolveTarget(root, source, target) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(target)) return { external: true };
  const hash = target.indexOf("#");
  const rawFile = (hash < 0 ? target : target.slice(0, hash)).split("?")[0];
  let file;
  let anchor;
  try {
    file = decodeURIComponent(rawFile);
    anchor = hash < 0 ? undefined : decodeURIComponent(target.slice(hash + 1));
  } catch {
    return {
      error: "link-invalid",
      message: `URL 인코딩이 잘못되었습니다: ${target}`,
    };
  }
  if (file.includes("\\") || file.includes("\0"))
    return {
      error: "path-escape",
      message: `저장소 밖의 경로는 연결할 수 없습니다: ${target}`,
    };
  const absolute = file
    ? path.resolve(
        root,
        file.startsWith("/") ? `.${file}` : path.posix.dirname(source),
        file.startsWith("/") ? "" : file,
      )
    : path.resolve(root, source);
  if (!inside(root, absolute))
    return {
      error: "path-escape",
      message: `링크가 저장소 밖으로 나갑니다: ${target}`,
    };
  let ancestor = absolute;
  while (!existsSync(ancestor) && path.dirname(ancestor) !== ancestor)
    ancestor = path.dirname(ancestor);
  if (!inside(realpathSync(root), realpathSync(ancestor)))
    return {
      error: "path-escape",
      message: `심볼릭 링크가 저장소 밖으로 나갑니다: ${target}`,
    };
  return {
    file: path.relative(root, absolute).split(path.sep).join("/"),
    absolute,
    anchor,
  };
}
function conditionalTarget(root, file, registry) {
  return (
    registry.conditionalEvidence.some(({ prefix }) =>
      file.startsWith(prefix),
    ) &&
    spawnSync("git", ["check-ignore", "--quiet", "--", file], { cwd: root })
      .status === 0
  );
}

function jsonPointerExists(absolute, pointer) {
  if (!pointer.startsWith("/") || /~(?![01])/u.test(pointer)) return false;
  try {
    let value = JSON.parse(readFileSync(absolute, "utf8"));
    for (const raw of pointer.slice(1).split("/")) {
      const key = raw.replaceAll("~1", "/").replaceAll("~0", "~");
      if (
        value === null ||
        typeof value !== "object" ||
        !Object.hasOwn(value, key)
      )
        return false;
      value = value[key];
    }
    return true;
  } catch {
    return false;
  }
}

// 따옴표 안의 공백은 데이터이므로 그대로 둔다. 코드의 의미가 같은지는 판정하지 않는다.
function normalizedCode(text) {
  let result = "";
  let quote = null;
  let whitespace = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === "\\" && i + 1 < text.length) {
        result += char + text[++i];
      } else if (text.startsWith(quote, i)) {
        result += quote;
        i += quote.length - 1;
        quote = null;
      } else result += char;
    } else if (/\s/u.test(char)) {
      whitespace = true;
    } else {
      if (whitespace && result) result += " ";
      whitespace = false;
      if (char === '"' || char === "'" || char === "`") {
        quote =
          char !== "`" && text.startsWith(char.repeat(3), i)
            ? char.repeat(3)
            : char;
        result += quote;
        i += quote.length - 1;
      } else result += char;
    }
  }
  return result;
}
function blocksFor(text, boundaries = new Set()) {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  const blocks = [];
  let current = [];
  let start = 0;
  const flush = () => {
    if (current.length)
      blocks.push({
        kind: "text",
        line: start + 1,
        value: current.join("\n").replace(/\s+/gu, " ").trim(),
      });
    current = [];
  };
  for (let i = 0; i < lines.length; i++) {
    if (boundaries.has(i)) flush();
    const fence = lines[i].match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
    if (fence) {
      flush();
      const line = i + 1;
      const code = [];
      for (i++; i < lines.length; i++) {
        const end = lines[i].match(/^ {0,3}(`{3,}|~{3,})\s*$/u);
        if (
          end &&
          end[1][0] === fence[1][0] &&
          end[1].length >= fence[1].length
        )
          break;
        code.push(lines[i]);
      }
      blocks.push({
        kind: "code",
        line,
        value: normalizedCode(code.join("\n")),
      });
    } else if (
      !lines[i].trim() ||
      /^ {0,3}#{1,6}\s/u.test(lines[i]) ||
      /^ {0,3}(?:=+|-+)\s*$/u.test(lines[i])
    )
      flush();
    else {
      if (!current.length) start = i;
      current.push(lines[i]);
    }
    if (boundaries.has(i)) flush();
  }
  flush();
  return blocks;
}

// 원문은 링크·제목 검사에 계속 쓰고, 유효한 보존 구간만 중복 비교용 사본에서 지운다.
function duplicateText(text, entry, errors) {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  const visible = visibleLines(text);
  const result = [...lines];
  const boundaries = new Set();
  const registered = new Map(
    (entry?.preserved ?? []).map((saved) => [saved.id, saved]),
  );
  const opened = new Map();
  const stack = [];
  const regions = [];
  const report = (line, code, message) =>
    issue(errors, entry.path, line + 1, code, message);
  for (let i = 0; i < visible.length; i++) {
    if (!/ssot:preserve/iu.test(visible[i])) continue;
    boundaries.add(i);
    const marker = visible[i].match(
      /^\s*<!-- (\/?)ssot:preserve ([a-z][a-z0-9-]{0,63}) -->\s*$/u,
    );
    // 지시문 자체는 비교에서 빼되 같은 줄에 붙은 실제 본문은 남긴다.
    result[i] = visible[i].replace(/<!--[^>]*ssot:preserve[^>]*-->/giu, "");
    if (entry.role !== "historical")
      report(
        i,
        "preserve-role",
        "보존 구간은 historical 문서에서만 사용할 수 있습니다.",
      );
    if (!marker) {
      report(
        i,
        "preserve-marker",
        "보존 지시문은 정해진 열기·닫기 형식으로 한 줄에 적어 주세요.",
      );
      for (const active of stack) active.valid = false;
      continue;
    }
    const [, closing, id] = marker;
    if (!closing) {
      const region = { id, start: i, valid: entry.role === "historical" };
      if (stack.length) {
        report(i, "preserve-nested", "보존 구간을 중첩할 수 없습니다.");
        region.valid = false;
        for (const active of stack) active.valid = false;
      }
      if (opened.has(id)) {
        report(
          i,
          "preserve-duplicate",
          `보존 구간 id를 본문에서 한 번만 사용할 수 있습니다: ${id}`,
        );
        opened.get(id).valid = false;
        region.valid = false;
      } else opened.set(id, region);
      if (!registered.has(id)) {
        report(
          i,
          "preserve-unregistered",
          `등록하지 않은 보존 구간입니다: ${id}`,
        );
        region.valid = false;
      }
      stack.push(region);
    } else if (!stack.length) {
      report(i, "preserve-orphan", `여는 지시문이 없는 보존 구간입니다: ${id}`);
    } else {
      const region = stack.pop();
      if (region.id !== id) {
        report(
          i,
          "preserve-mismatch",
          `보존 구간의 열기·닫기 id가 다릅니다: ${region.id}, ${id}`,
        );
        for (const active of stack) active.valid = false;
        continue;
      }
      region.end = i;
      const body = lines.slice(region.start + 1, i).join("\n");
      if (!body.trim()) {
        report(
          region.start,
          "preserve-empty",
          `보존 구간 본문이 비었습니다: ${id}`,
        );
        region.valid = false;
      }
      const saved = registered.get(id);
      if (
        saved &&
        createHash("sha256").update(`${body}\n`).digest("hex") !== saved.sha256
      ) {
        report(
          region.start,
          "preserve-hash",
          `등록한 내용과 보존 구간의 SHA-256이 다릅니다: ${id}`,
        );
        region.valid = false;
      }
      regions.push(region);
    }
  }
  for (const region of stack)
    report(
      region.start,
      "preserve-unclosed",
      `닫지 않은 보존 구간입니다: ${region.id}`,
    );
  for (const id of registered.keys())
    if (!opened.has(id))
      report(
        0,
        "preserve-unused",
        `등록했지만 본문에서 사용하지 않은 보존 구간입니다: ${id}`,
      );
  for (const region of regions)
    if (region.valid)
      for (let i = region.start + 1; i < region.end; i++) result[i] = "";
  return { text: result.join("\n"), boundaries };
}

export function checkDocs({ root = process.cwd(), files } = {}) {
  root = path.resolve(root);
  const errors = [];
  const loaded = readRegistry(root, errors);
  if (!loaded) return { errors, index: null };
  const { registry, text: registryText } = loaded;
  const index = generateIndex(registry);
  const entries = new Map(
    registry.documents.map((entry) => [entry.path, entry]),
  );
  const parsed = new Map();
  const parse = (file) => {
    if (!parsed.has(file)) {
      const text = readFileSync(path.join(root, file), "utf8");
      const lines = visibleLines(text);
      parsed.set(file, {
        text,
        lines,
        anchors: anchorsFor(lines),
        links: linksFor(lines),
      });
    }
    return parsed.get(file);
  };
  let discovered;
  try {
    discovered =
      files ??
      execFileSync(
        "git",
        [
          "ls-files",
          "--cached",
          "--others",
          "--exclude-standard",
          "-z",
          "--",
          ":(icase)*.md",
        ],
        { cwd: root, encoding: "utf8" },
      )
        .split("\0")
        .filter(Boolean);
  } catch {
    issue(
      errors,
      REGISTRY,
      1,
      "discovery",
      "Git 문서 목록을 읽지 못했습니다. 저장소 안에서 실행하세요.",
    );
    return { errors, index };
  }
  const documents = [...new Set([...discovered, ...entries.keys()])].filter(
    (file) => markdown(file) && existsSync(path.join(root, file)),
  );
  for (const file of documents)
    if (!entries.has(file))
      issue(
        errors,
        file,
        1,
        "unregistered",
        "문서가 docs/ssot.json에 등록되지 않았습니다.",
      );
  for (const entry of entries.values())
    if (!existsSync(path.join(root, entry.path)))
      issue(
        errors,
        entry.path,
        1,
        "document-missing",
        "등록한 문서가 없습니다.",
      );
  if (
    !existsSync(path.join(root, INDEX)) ||
    readFileSync(path.join(root, INDEX), "utf8") !== index
  )
    issue(
      errors,
      INDEX,
      1,
      "index-stale",
      "등록부와 문서 안내가 다릅니다. pnpm docs:index를 실행하세요.",
    );
  const validateLink = (source, link, sourceTopic = false) => {
    if (link.reference !== undefined) {
      issue(
        errors,
        source,
        link.line,
        "reference-missing",
        `참고 링크 정의가 없습니다: ${link.reference}`,
      );
      return;
    }
    const resolved = resolveTarget(
      root,
      sourceTopic ? "root.md" : source,
      link.target,
    );
    if (resolved.external) return;
    if (resolved.error) {
      issue(errors, source, link.line, resolved.error, resolved.message);
      return;
    }
    const { file, absolute, anchor } = resolved;
    if (!sourceTopic && conditionalTarget(root, file, registry)) return;
    if (!existsSync(absolute)) {
      issue(
        errors,
        source,
        link.line,
        sourceTopic ? "source-missing" : "link-missing",
        `대상 파일이 없습니다: ${file}`,
      );
      return;
    }
    if (sourceTopic && !statSync(absolute).isFile()) {
      issue(
        errors,
        source,
        link.line,
        "source-file",
        `주제 원본은 디렉터리가 아닌 파일이어야 합니다: ${file}`,
      );
      return;
    }
    if (
      sourceTopic &&
      markdown(file) &&
      entries.get(file)?.role !== "canonical"
    )
      issue(
        errors,
        source,
        link.line,
        "source-owner",
        `Markdown 주제 원본은 canonical 문서여야 합니다: ${file}`,
      );
    if (
      anchor &&
      (!statSync(absolute).isFile() ||
        !(markdown(file)
          ? parse(file).anchors.has(anchor)
          : /\.json$/iu.test(file) && jsonPointerExists(absolute, anchor)))
    )
      issue(
        errors,
        source,
        link.line,
        "anchor-missing",
        `대상 제목·HTML 앵커 또는 JSON Pointer가 없습니다: ${file}#${anchor}`,
      );
  };
  const topics = new Set();
  for (const topic of registry.topics) {
    const line = registryLine(registryText, topic.source);
    if (topics.has(topic.id))
      issue(
        errors,
        REGISTRY,
        line,
        "topic-duplicate",
        `주제 id의 원본이 중복되었습니다: ${topic.id}`,
      );
    topics.add(topic.id);
    validateLink(REGISTRY, { line, target: topic.source }, true);
  }
  for (const file of documents) {
    const resolved = resolveTarget(root, "root.md", file);
    if (resolved.error) {
      issue(errors, file, 1, resolved.error, resolved.message);
      continue;
    }
    if (!statSync(path.join(root, file)).isFile()) {
      issue(
        errors,
        file,
        1,
        "document-missing",
        "Markdown 경로가 일반 파일이 아닙니다.",
      );
      continue;
    }
    const doc = parse(file);
    for (const link of doc.links) validateLink(file, link);
    const entry = entries.get(file);
    if (entry?.role !== "historical") continue;
    if (!doc.lines.join("\n").includes(entry.date))
      issue(
        errors,
        file,
        1,
        "historical-date",
        `당시 기록 날짜 ${entry.date}를 본문에 적어 주세요.`,
      );
    const current = entries.get(entry.current);
    const currentLink = doc.links.some(
      (link) =>
        !link.image &&
        link.target &&
        resolveTarget(root, file, link.target).file === entry.current,
    );
    if (
      !current ||
      current.role !== "canonical" ||
      !existsSync(path.join(root, entry.current)) ||
      !currentLink
    )
      issue(
        errors,
        file,
        1,
        "historical-current",
        `현재 정본(canonical)이 존재해야 하며 본문에서 Markdown 링크로 연결해야 합니다: ${entry.current}`,
      );
  }
  const seenBlocks = new Map();
  for (const entry of entries.values()) {
    if (!parsed.has(entry.path)) continue;
    const comparison = duplicateText(parse(entry.path).text, entry, errors);
    if (entry.path === INDEX) continue;
    for (const block of blocksFor(comparison.text, comparison.boundaries)) {
      if ([...block.value.replace(/\s+/gu, " ").trim()].length < 120) continue;
      const key = `${block.kind}\0${block.value}`;
      const previous = seenBlocks.get(key);
      if (previous && previous.path !== entry.path)
        issue(
          errors,
          entry.path,
          block.line,
          "duplicate-block",
          `120자 이상 같은 블록이 있습니다. 원본으로 연결해 주세요: ${previous.path}:${previous.line}`,
        );
      else if (!previous)
        seenBlocks.set(key, { path: entry.path, line: block.line });
    }
  }
  return { errors, index };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const command = process.argv[2];
  if (!["check", "index"].includes(command) || process.argv.length !== 3) {
    console.error("사용법: node scripts/docs.mjs check|index");
    process.exitCode = 1;
  } else {
    try {
      const result = command === "index" ? writeIndex() : checkDocs();
      for (const error of result.errors)
        console.error(
          `${error.path}:${error.line} [${error.code}] ${error.message}`,
        );
      if (result.errors.length) process.exitCode = 1;
      else
        console.log(
          command === "index"
            ? "docs/README.md를 갱신했습니다."
            : "문서 등록·원본·링크·중복 검사를 통과했습니다.",
        );
    } catch (error) {
      console.error(
        `${REGISTRY}:1 [read-error] 문서를 읽을 수 없습니다: ${error.code ?? "unknown"}`,
      );
      process.exitCode = 1;
    }
  }
}
