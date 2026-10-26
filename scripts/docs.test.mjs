import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./docs.mjs", import.meta.url));
let api;
async function harness() {
  assert.ok(existsSync(script), "문서 검증 CLI와 API가 구현되어야 한다");
  return (api ??= await import("./docs.mjs"));
}
function put(root, name, text) {
  mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  writeFileSync(path.join(root, name), text);
}
function registry(documents = [], topics = []) {
  return {
    version: 1,
    documents: [
      { path: "docs/README.md", role: "reference" },
      { path: "docs/spec.md", role: "canonical" },
      ...documents,
    ],
    topics: [
      { id: "scope", title: "현재 범위", source: "docs/spec.md#현재-범위" },
      ...topics,
    ],
    conditionalEvidence: [{ prefix: ".private/", reason: "비공개 원본" }],
  };
}
async function fixture(t, options = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "civil-war-docs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  put(root, ".gitignore", ".private/\nnode_modules/\n");
  const data = options.registry ?? registry();
  put(root, "docs/ssot.json", JSON.stringify(data, null, 2));
  put(root, "docs/spec.md", "# 기획\n\n## 현재 범위\n\n확인한 내용.\n");
  for (const [name, text] of Object.entries(options.contents ?? {}))
    put(root, name, text);
  const module = await harness();
  if (options.index !== false)
    assert.deepEqual(module.writeIndex({ root }).errors, []);
  return {
    root,
    data,
    check: (files) => module.checkDocs({ root, ...(files ? { files } : {}) }),
    save: () => put(root, "docs/ssot.json", JSON.stringify(data, null, 2)),
  };
}
function faults(result, code) {
  return result.errors.filter((error) => error.code === code);
}
function cli(root, ...args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("CLI generates the complete index and accepts a valid registered repository", async (t) => {
  const f = await fixture(t);
  const result = cli(f.root, "check");
  assert.equal(result.status, 0, result.stderr);
  const index = readFileSync(path.join(f.root, "docs/README.md"), "utf8");
  assert.match(index, /\[현재 범위\]\(spec\.md#현재-범위\)/u);
  assert.match(index, /비공개 원본/u);
  assert.deepEqual(f.check().errors, []);
});
test("check refuses a stale index and index replaces it deterministically", async (t) => {
  const f = await fixture(t);
  put(f.root, "docs/README.md", "outdated\n");
  assert.equal(faults(f.check(), "index-stale").length, 1);
  assert.equal(cli(f.root, "check").status, 1);
  assert.equal(cli(f.root, "index").status, 0);
  assert.deepEqual(f.check().errors, []);
  const once = readFileSync(path.join(f.root, "docs/README.md"), "utf8");
  cli(f.root, "index");
  assert.equal(readFileSync(path.join(f.root, "docs/README.md"), "utf8"), once);
});
test("malformed registry values fail cleanly with actionable diagnostics", async (t) => {
  const f = await fixture(t);
  const invalid = [
    "{ broken json",
    "null",
    "[]",
    "{}",
    JSON.stringify({ ...registry(), version: 2 }),
    JSON.stringify({
      ...registry(),
      documents: [{ path: "docs/spec.md", role: "guide" }],
    }),
    JSON.stringify({
      ...registry(),
      documents: [{ path: "../outside.md", role: "canonical" }],
    }),
    JSON.stringify({
      ...registry(),
      topics: [{ id: "", title: "제목", source: "docs/spec.md" }],
    }),
    JSON.stringify({
      ...registry(),
      topics: [{ id: "x", source: "docs/spec.md" }],
    }),
    JSON.stringify({
      ...registry(),
      conditionalEvidence: [{ prefix: "", reason: "원본" }],
    }),
    JSON.stringify({
      ...registry(),
      conditionalEvidence: [{ prefix: ".private/", reason: "" }],
    }),
    JSON.stringify({
      ...registry(),
      documents: [
        {
          path: "docs/old.md",
          role: "historical",
          date: "2026-02-30",
          current: "docs/spec.md",
        },
      ],
    }),
  ];
  for (const text of invalid) {
    put(f.root, "docs/ssot.json", text);
    assert.ok(faults(f.check(), "registry").length > 0, text);
    const result = cli(f.root, "check");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /docs\/ssot\.json:\d+/u);
    assert.doesNotMatch(result.stderr, /TypeError|SyntaxError|at file:/u);
  }
});
test("each topic id has one owner and Markdown sources must be canonical", async (t) => {
  const f = await fixture(t, {
    registry: registry(
      [{ path: "docs/guide.md", role: "reference" }],
      [{ id: "scope", title: "다른 범위", source: "docs/guide.md" }],
    ),
    contents: { "docs/guide.md": "# 안내\n" },
  });
  assert.equal(faults(f.check(), "topic-duplicate").length, 1);
  assert.equal(faults(f.check(), "source-owner").length, 1);
});
test("topic sources check file existence separately from Markdown anchors", async (t) => {
  const f = await fixture(t, {
    registry: registry(
      [],
      [
        { id: "file", title: "파일", source: "missing.json" },
        { id: "heading", title: "잘못된 절", source: "docs/spec.md#없음" },
        { id: "schema", title: "스키마", source: "schema.json" },
      ],
    ),
    contents: { "schema.json": "{}\n" },
  });
  assert.equal(faults(f.check(), "source-missing").length, 1);
  assert.equal(
    faults(f.check(), "anchor-missing").filter(
      (e) => e.path === "docs/ssot.json",
    ).length,
    1,
  );
  assert.equal(faults(f.check(), "source-owner").length, 0);
});
test("topic owners must be actual files rather than existing directories", async (t) => {
  const f = await fixture(t, {
    registry: registry(
      [],
      [{ id: "directory", title: "파일이 아닌 원본", source: "docs" }],
    ),
  });
  assert.equal(faults(f.check(), "source-file").length, 1);
});

test("all discovered Markdown must be registered and all registered files must exist", async (t) => {
  const f = await fixture(t, {
    registry: registry([{ path: "docs/gone.md", role: "reference" }]),
    contents: { "notes.md": "# 새 문서\n" },
  });
  assert.equal(faults(f.check(), "unregistered").length, 1);
  assert.equal(faults(f.check(), "document-missing").length, 1);
  assert.equal(
    faults(f.check(["docs/README.md", "docs/spec.md"]), "unregistered").length,
    0,
  );
});
test("links support Unicode duplicate headings, setext headings, explicit anchors and encoded paths", async (t) => {
  const f = await fixture(t, {
    registry: registry([{ path: "docs/자료 이름.md", role: "reference" }]),
    contents: {
      "docs/자료 이름.md":
        "# 한글 제목!\n\n## 같은 제목\n\n## 같은 제목\n\nSetext 제목\n---\n\n<a id=\"직접-지정\"></a>\n\n<span id='other'></span>\n",
      "docs/spec.md":
        '# 기획\n\n## 현재 범위\n\n[첫째](자료%20이름.md#한글-제목)\n[둘째][절]\n[절]: <자료 이름.md#같은-제목-1> "제목"\n[셋째](자료%20이름.md#setext-제목)\n[넷째](자료%20이름.md#직접-지정)\n[다섯째](자료%20이름.md#other)\n![그림](../assets/a%20b.png)\n[자기 절](#%ED%98%84%EC%9E%AC-%EB%B2%94%EC%9C%84)\n\n```md\n[없는 링크](missing.md#missing)\n```\n\n`[인라인 예시](missing.md)`\n',
      "assets/a b.png": "image bytes",
    },
  });
  assert.deepEqual(f.check().errors, []);
});
test("dangling anchors and missing inline, image and reference targets report source lines", async (t) => {
  const f = await fixture(t, {
    contents: {
      "docs/spec.md":
        "# 기획\n\n## 현재 범위\n\n[잘못된 절](#없는-절)\n![없는 그림](missing.png)\n[없는 참고][bad]\n\n[bad]: missing.md\n",
    },
  });
  const result = f.check();
  assert.equal(faults(result, "anchor-missing").length, 1);
  assert.equal(faults(result, "link-missing").length, 2);
  assert.deepEqual(
    faults(result, "link-missing").map((e) => [e.path, e.line]),
    [
      ["docs/spec.md", 6],
      ["docs/spec.md", 7],
    ],
  );
});
test("local paths and symlinks cannot escape the repository", async (t) => {
  const f = await fixture(t, {
    contents: {
      "docs/spec.md":
        "# 기획\n\n## 현재 범위\n\n[탈출](../../outside.md)\n[인코딩](..%2F..%2Foutside.md)\n",
    },
  });
  assert.equal(faults(f.check(), "path-escape").length, 2);
  symlinkSync(tmpdir(), path.join(f.root, "outside"));
  put(
    f.root,
    "docs/spec.md",
    "# 기획\n\n## 현재 범위\n\n[탈출](../outside/)\n",
  );
  assert.equal(faults(f.check(), "path-escape").length, 1);
});
test("historical documents require a real date, a current file and a visible current Markdown link", async (t) => {
  const f = await fixture(t, {
    registry: registry([
      {
        path: "docs/old.md",
        role: "historical",
        date: "2026-10-21",
        current: "docs/spec.md",
      },
    ]),
    contents: { "docs/old.md": "# 당시 기록\n\n날짜 없음.\n" },
  });
  assert.equal(faults(f.check(), "historical-date").length, 1);
  assert.equal(faults(f.check(), "historical-current").length, 1);
  put(
    f.root,
    "docs/old.md",
    "# 당시 기록\n\n2026-10-21 당시 기록. [현재 문서](spec.md).\n",
  );
  assert.deepEqual(f.check().errors, []);
  f.data.documents.find((entry) => entry.path === "docs/old.md").current =
    "docs/absent.md";
  f.save();
  assert.equal(faults(f.check(), "historical-current").length, 1);
});
const longText =
  "확정한 내용은 한 원본에서 관리하고 안내 문서는 원본의 해당 절로 연결한다. ".repeat(
    5,
  );
const longTable =
  "| 항목 | 내용 |\n| --- | --- |\n" + `| 기준 | ${longText} |\n`;
const longCode =
  "```js\n" + `const value = ${JSON.stringify(longText)};\n` + "```\n";
for (const [kind, block] of [
  ["paragraph", longText],
  ["table", longTable],
  ["code", longCode],
]) {
  test(`exact long ${kind} copies across current documents are rejected`, async (t) => {
    const f = await fixture(t, {
      registry: registry([{ path: "docs/guide.md", role: "reference" }]),
      contents: {
        "docs/spec.md": `# 기획\n\n## 현재 범위\n\n${block}\n`,
        "docs/guide.md": `# 안내\n\n${block}\n`,
      },
    });
    const copies = faults(f.check(), "duplicate-block");
    assert.equal(copies.length, 1);
    assert.equal(copies[0].path, "docs/guide.md");
    assert.match(copies[0].message, /docs\/spec\.md:5/u);
  });
}
test("whitespace-only prose differences count as copies, while code semantics and short snippets remain distinct", async (t) => {
  const f = await fixture(t, {
    registry: registry([{ path: "docs/guide.md", role: "reference" }]),
    contents: {
      "docs/spec.md": `# 기획\n\n## 현재 범위\n\n${longText}\n\n짧은 예시는 허용한다.\n`,
      "docs/guide.md": `# 안내\n\n${longText.replaceAll(" ", "  ")}\n\n짧은 예시는 허용한다.\n`,
    },
  });
  assert.equal(faults(f.check(), "duplicate-block").length, 1);
  put(
    f.root,
    "docs/spec.md",
    `# 기획\n\n## 현재 범위\n\n${longCode}\n\n짧은 예시는 허용한다.\n`,
  );
  put(
    f.root,
    "docs/guide.md",
    `# 안내\n\n${longCode.replace("한 원본", "한  원본")}\n\n짧은 예시는 허용한다.\n`,
  );
  assert.deepEqual(f.check().errors, []);
});
test("unmarked historical copies are rejected while their broken links are checked", async (t) => {
  const f = await fixture(t, {
    registry: registry([
      {
        path: "docs/old.md",
        role: "historical",
        date: "2026-10-21",
        current: "docs/spec.md",
      },
    ]),
    contents: {
      "docs/spec.md": `# 기획\n\n## 현재 범위\n\n${longText}\n`,
      "docs/old.md": `# 과거\n\n2026-10-21 [현재](spec.md)\n\n${longText}\n\n[깨진 링크](missing.md)\n`,
    },
  });
  assert.equal(faults(f.check(), "duplicate-block").length, 1);
  assert.equal(faults(f.check(), "link-missing").length, 1);
});
const historicalEntry = (preserved) => ({
  path: "docs/old.md",
  role: "historical",
  date: "2026-10-21",
  current: "docs/spec.md",
  ...(preserved === undefined ? {} : { preserved }),
});
const historicalText = (body) =>
  `# 당시 기록\n\n2026-10-21 [현재](spec.md)\n\n${body}\n`;
const preservation = (id, body) => ({
  id,
  reason: "2026-10-21에 확인한 측정 원본을 보존한다.",
  sha256: createHash("sha256").update(`${body}\n`).digest("hex"),
});
const region = (id, body) =>
  `<!-- ssot:preserve ${id} -->\n${body}\n<!-- /ssot:preserve ${id} -->`;
async function historicalFixture(t, body, preserved) {
  return fixture(t, {
    registry: registry([historicalEntry(preserved)]),
    contents: {
      "docs/spec.md": `# 기획\n\n## 현재 범위\n\n${longText}\n`,
      "docs/old.md": historicalText(body),
    },
  });
}

test("a registered hash-bound historical region exempts only its own copied text and generates its inventory", async (t) => {
  const saved = preservation("measured-result", longText);
  const f = await historicalFixture(t, region(saved.id, longText), [saved]);
  assert.deepEqual(f.check().errors, []);
  const index = readFileSync(path.join(f.root, "docs/README.md"), "utf8");
  assert.match(index, /measured-result/u);
  assert.ok(index.includes(saved.reason));
  assert.match(index, /\[docs\/old\.md\]\(old\.md\)/u);
  put(
    f.root,
    "docs/old.md",
    historicalText(`${region(saved.id, longText)}\n\n${longText}`),
  );
  const copies = faults(f.check(), "duplicate-block");
  assert.equal(copies.length, 1);
  assert.equal(
    copies[0].line,
    9,
    "preservation must retain source line numbers",
  );
});
test("preserved headings and source links remain visible to navigation checks", async (t) => {
  const body =
    "## 당시 측정\n\n[누락 근거](missing.md)\n[누락 절](spec.md#없는-절)";
  const saved = preservation("source-evidence", body);
  const f = await historicalFixture(
    t,
    `${region(saved.id, body)}\n\n[당시 절](#당시-측정)`,
    [saved],
  );
  assert.equal(faults(f.check(), "link-missing").length, 1);
  assert.equal(faults(f.check(), "anchor-missing").length, 1);
});
test("preservation hashes normalize CRLF and cover exact interior whitespace plus its final newline", async (t) => {
  const saved = preservation("measured-result", longText);
  const f = await historicalFixture(t, region(saved.id, longText), [saved]);
  put(
    f.root,
    "docs/old.md",
    historicalText(region(saved.id, longText)).replaceAll("\n", "\r\n"),
  );
  assert.deepEqual(f.check().errors, []);
  put(f.root, "docs/old.md", historicalText(region(saved.id, `${longText} `)));
  const changed = f.check();
  assert.equal(faults(changed, "preserve-hash").length, 1);
  assert.equal(faults(changed, "duplicate-block").length, 1);
  saved.sha256 = createHash("sha256").update(longText).digest("hex");
  f.save();
  put(f.root, "docs/old.md", historicalText(region(saved.id, longText)));
  assert.equal(faults(f.check(), "preserve-hash").length, 1);
});
test("unmarked historical copies are compared with other historical documents", async (t) => {
  const f = await fixture(t, {
    registry: registry([
      historicalEntry(),
      { ...historicalEntry(), path: "docs/older.md" },
    ]),
    contents: {
      "docs/old.md": historicalText(longText),
      "docs/older.md": historicalText(longText),
    },
  });
  assert.equal(faults(f.check(), "duplicate-block").length, 1);
});
test("short historical prose remains allowed without preservation metadata", async (t) => {
  const f = await historicalFixture(t, "짧은 당시 기록.");
  assert.deepEqual(f.check().errors, []);
});
for (const fence of ["```", "~~~~"]) {
  test(`preservation directives inside a ${fence} fence are data and cannot hide duplicate code`, async (t) => {
    const code = `${fence}md\n${region("example", longText)}\n${fence}\n`;
    const f = await historicalFixture(t, code);
    put(f.root, "docs/spec.md", `# 기획\n\n## 현재 범위\n\n${code}`);
    const result = f.check();
    assert.equal(faults(result, "duplicate-block").length, 1);
    assert.equal(result.errors.length, 1);
  });
}
for (const [name, edit] of [
  ["non-array metadata", () => ({})],
  ["null record", () => [null]],
  ["empty reason", (saved) => [{ ...saved, reason: "" }]],
  ["whitespace reason", (saved) => [{ ...saved, reason: " \t" }]],
  ["invalid id", (saved) => [{ ...saved, id: "Invalid ID" }]],
  ["too-long id", (saved) => [{ ...saved, id: "a".repeat(65) }]],
  ["missing hash", ({ sha256: _unused, ...saved }) => [saved]],
  [
    "uppercase hash",
    (saved) => [{ ...saved, sha256: saved.sha256.toUpperCase() }],
  ],
  ["short hash", (saved) => [{ ...saved, sha256: "abc" }]],
  ["duplicate id", (saved) => [saved, saved]],
]) {
  test(`preservation registry rejects ${name} without crashing`, async (t) => {
    const saved = preservation("measured-result", longText);
    const f = await fixture(t, {
      index: false,
      registry: registry([historicalEntry(edit(saved))]),
      contents: { "docs/old.md": historicalText(region(saved.id, longText)) },
    });
    assert.ok(faults(f.check(), "registry").length > 0);
    const result = cli(f.root, "check");
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stderr, /TypeError|at file:/u);
  });
}
for (const role of ["canonical", "reference"]) {
  test(`${role} documents cannot register historical preservation`, async (t) => {
    const f = await fixture(t);
    const entry = f.data.documents.find((item) => item.role === role);
    entry.preserved = [preservation("measured-result", longText)];
    f.save();
    assert.ok(faults(f.check(), "registry").length > 0);
  });
  test(`${role} preservation markers are rejected and cannot suppress duplicate text`, async (t) => {
    const f = await fixture(t, {
      registry: registry([{ path: "docs/guide.md", role: "reference" }]),
      contents: {
        "docs/spec.md": `# 기획\n\n## 현재 범위\n\n${role === "canonical" ? region("measured-result", longText) : longText}\n`,
        "docs/guide.md": `# 안내\n\n${role === "reference" ? region("measured-result", longText) : longText}\n`,
      },
    });
    const result = f.check();
    assert.ok(faults(result, "preserve-role").length > 0);
    assert.equal(faults(result, "duplicate-block").length, 1);
  });
}
for (const [name, body, code] of [
  ["unregistered", region("unknown", longText), "preserve-unregistered"],
  [
    "nested",
    region("measured-result", region("nested", longText)),
    "preserve-nested",
  ],
  [
    "mismatched",
    `<!-- ssot:preserve measured-result -->\n${longText}\n<!-- /ssot:preserve other -->`,
    "preserve-mismatch",
  ],
  [
    "unclosed",
    `<!-- ssot:preserve measured-result -->\n${longText}`,
    "preserve-unclosed",
  ],
  [
    "orphan close",
    `${longText}\n<!-- /ssot:preserve measured-result -->`,
    "preserve-orphan",
  ],
  [
    "malformed",
    `<!-- ssot:preserve measured-result --> extra\n${longText}`,
    "preserve-marker",
  ],
  [
    "invalid marker id",
    `<!-- ssot:preserve Bad-ID -->\n${longText}\n<!-- /ssot:preserve Bad-ID -->`,
    "preserve-marker",
  ],
  [
    "uppercase directive",
    `<!-- SSOT:PRESERVE measured-result -->\n${longText}\n<!-- /SSOT:PRESERVE measured-result -->`,
    "preserve-marker",
  ],
  [
    "unclosed comment",
    `<!-- ssot:preserve measured-result\n${longText}`,
    "preserve-marker",
  ],
  [
    "duplicate marker id",
    `${region("measured-result", longText)}\n\n${region("measured-result", longText)}`,
    "preserve-duplicate",
  ],
]) {
  test(`${name} preservation fails safely and leaves historical prose in duplicate checks`, async (t) => {
    const saved = preservation("measured-result", longText);
    const f = await historicalFixture(t, body, [saved]);
    const result = f.check();
    assert.ok(faults(result, code).length > 0, JSON.stringify(result.errors));
    assert.ok(
      faults(result, "duplicate-block").length > 0,
      JSON.stringify(result.errors),
    );
  });
}
test("an unused registered preservation and an empty region both fail", async (t) => {
  const saved = preservation("measured-result", "");
  const f = await historicalFixture(t, "짧은 기록.", [saved]);
  assert.equal(faults(f.check(), "preserve-unused").length, 1);
  put(f.root, "docs/old.md", historicalText(region(saved.id, " \t")));
  assert.equal(faults(f.check(), "preserve-empty").length, 1);
});
test("an inline malformed directive cannot erase the copied prose on the same line", async (t) => {
  const saved = preservation("measured-result", longText);
  const f = await historicalFixture(
    t,
    `<!-- ssot:preserve measured-result -->${longText}`,
    [saved],
  );
  const result = f.check();
  assert.equal(faults(result, "preserve-marker").length, 1);
  assert.equal(faults(result, "duplicate-block").length, 1);
});
test("only configured ignored private evidence may be absent", async (t) => {
  const f = await fixture(t, {
    contents: {
      "docs/spec.md":
        "# 기획\n\n## 현재 범위\n\n[원본](../.private/secret.md#not-published)\n[누락 공개](public.md)\n",
    },
  });
  assert.equal(faults(f.check(), "link-missing").length, 1);
  put(f.root, ".gitignore", "node_modules/\n");
  assert.equal(faults(f.check(), "link-missing").length, 2);
  f.data.conditionalEvidence = [
    { prefix: "docs/", reason: "잘못된 공개 예외" },
  ];
  f.save();
  assert.equal(faults(f.check(), "link-missing").length, 2);
});
test("Git discovery scans tracked and unignored untracked Markdown, excluding ignored and deleted files", async (t) => {
  const f = await fixture(t);
  put(f.root, ".private/ignored.md", "[잘못된 링크](missing.md)\n");
  put(f.root, "node_modules/pkg/README.md", "[잘못된 링크](missing.md)\n");
  put(f.root, "deleted.md", "# 삭제 예정\n");
  execFileSync("git", ["add", "deleted.md"], { cwd: f.root });
  rmSync(path.join(f.root, "deleted.md"));
  assert.deepEqual(f.check().errors, []);
  put(f.root, "new.md", "# 아직 등록 안 됨\n");
  assert.equal(faults(f.check(), "unregistered").length, 1);
});
test("Git discovery also checks mixed-case Markdown extensions", async (t) => {
  const f = await fixture(t, {
    registry: registry([{ path: "docs/안내.Md", role: "reference" }]),
    contents: {
      "docs/안내.Md": "# 안내\n\n[현재 기준](spec.md#현재-범위)\n",
      "UNREGISTERED.MD": "# 새 기록\n\n[없는 대상](missing.md)\n",
      ".private/IGNORED.MD": "# 비공개\n\n[없는 대상](missing.md)\n",
    },
  });
  const result = f.check();
  assert.deepEqual(
    faults(result, "unregistered").map((error) => error.path),
    ["UNREGISTERED.MD"],
  );
  assert.deepEqual(
    faults(result, "link-missing").map((error) => error.path),
    ["UNREGISTERED.MD"],
  );
  assert.equal(result.errors.length, 2);
});

test("registered historical documents remain checked when Git ignores them", async (t) => {
  const copied =
    "현재 기준의 긴 설명을 과거 문서에 복사해도 검사가 반드시 찾아야 한다. ".repeat(
      6,
    );
  const f = await fixture(t, {
    registry: registry([
      {
        path: "docs/old.md",
        role: "historical",
        date: "2026-10-22",
        current: "docs/spec.md",
      },
    ]),
    contents: {
      ".gitignore": ".private/\nnode_modules/\ndocs/old.md\n",
      "docs/spec.md": `# 기획\n\n## 현재 범위\n\n${copied}\n`,
      "docs/old.md": `# 당시 기록\n\n2026-10-22 [현재](spec.md)\n\n${copied}\n\n[없는 링크](missing.md)\n\n<!-- ssot:preserve hidden -->\n\n닫지 않은 근거 구역\n`,
    },
  });
  const result = f.check();
  for (const code of [
    "duplicate-block",
    "link-missing",
    "preserve-unregistered",
    "preserve-unclosed",
  ]) {
    assert.ok(
      faults(result, code).some((error) => error.path === "docs/old.md"),
      code,
    );
  }
});

test("CLI rejects unknown operations without changing the index", async (t) => {
  const f = await fixture(t);
  const before = readFileSync(path.join(f.root, "docs/README.md"), "utf8");
  assert.equal(cli(f.root, "invalid").status, 1);
  assert.equal(
    readFileSync(path.join(f.root, "docs/README.md"), "utf8"),
    before,
  );
});

test("JSON Pointer fragments check actual definitions and escaped property names", async (t) => {
  const f = await fixture(t, {
    registry: registry(
      [],
      [
        {
          id: "schema",
          title: "응답 정의",
          source: "schema.json#/$defs/Error",
        },
      ],
    ),
    contents: {
      "schema.json": JSON.stringify({
        $defs: { Error: {} },
        "a/b": { "~name": true },
      }),
      "docs/spec.md":
        "# 기획\n\n## 현재 범위\n\n[오류 정의](../schema.json#/$defs/Error)\n[특수 키](../schema.json#/a~1b/~0name)\n",
    },
  });
  assert.deepEqual(f.check().errors, []);
  put(
    f.root,
    "docs/spec.md",
    "# 기획\n\n## 현재 범위\n\n[없는 정의](../schema.json#/$defs/Missing)\n",
  );
  const errors = faults(f.check(), "anchor-missing");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].path, "docs/spec.md");
  assert.equal(errors[0].line, 5);
});

test("a historical current-document image cannot replace the required Markdown navigation link", async (t) => {
  const f = await fixture(t, {
    registry: registry([
      {
        path: "docs/old.md",
        role: "historical",
        date: "2026-10-21",
        current: "docs/spec.md",
      },
    ]),
    contents: {
      "docs/old.md": "# 당시 기록\n\n2026-10-21\n\n![정본 그림](spec.md)\n",
    },
  });
  assert.equal(faults(f.check(), "historical-current").length, 1);
});

test("copied code bodies are detected after indentation and wrapping changes even with a different fence label", async (t) => {
  const literal = JSON.stringify(longText);
  const first = `\`\`\`js\nconst result = calculate({\n  first: ${literal},\n  second: true, });\n\`\`\`\n`;
  const second = `\`\`\`typescript\n    const result = calculate({ first: ${literal}, second: true, });\n\`\`\`\n`;
  const f = await fixture(t, {
    registry: registry([{ path: "docs/guide.md", role: "reference" }]),
    contents: {
      "docs/spec.md": `# 기획\n\n## 현재 범위\n\n${first}`,
      "docs/guide.md": `# 안내\n\n${second}`,
    },
  });
  assert.equal(faults(f.check(), "duplicate-block").length, 1);
});

test("historical current metadata must point to a canonical document", async (t) => {
  const f = await fixture(t, {
    registry: registry([
      {
        path: "docs/old.md",
        role: "historical",
        date: "2026-10-21",
        current: "docs/README.md",
      },
    ]),
    contents: {
      "docs/old.md": "# 당시 기록\n\n2026-10-21 [현재 안내](README.md)\n",
    },
  });
  assert.equal(faults(f.check(), "historical-current").length, 1);
});
