# Code readability implementation plan

> 기록일 2026-10-23. 현재: [제품 명세](../../spec.md).

> 2026-10-25: 반복 설명을 정본 링크로 정리했다. 날짜별 사실·근거는 보존하며, 현재 링크의 값은 당시와 다를 수 있다.

**Goal:** Make code consistently readable and reject formatting drift in CI.

**Architecture:** Keep Prettier for client code and development configuration; use Gradle Spotless with google-java-format AOSP for Java. Commit mechanical formatting separately from behavior-preserving readability refactoring.

**Tech Stack:** Existing Node 24.22.1, pnpm 11.5.0, Java 25, Gradle 9.8.2; pinned Spotless 8.10.4 and google-java-format 1.36.1. Version 1.37.0 changed the Style API and is incompatible with this Spotless release.

**Spec:** User-approved approach in the conversation on 2026-10-23: formatting configuration, Java formatter, editor/CI enforcement, then clearer names and smaller methods.

## Global constraints

2026-10-23 사용자는 기존 기능·HTTP 계약·계산 우선순위와 팀 정렬을 유지하는 가독성 정리를 승인했다. 당시 작업은 기존 브랜치에서 진행하고 기존 staged AGENTS.md 및 다른 문서 변경을 보존하며 게시하지 않는 조건이었다. 과거 문서·실측 fixture·잠금 파일·생성물은 기계적 포맷 대상에서 제외했다.

현재 들여쓰기·에디터·포맷 명령은 [코드 작성 규칙](../../development/code-style.md), 빌드·전체 검증 명령은 [개발 환경](../../development/setup.md#웹과-전체-통합-검증)에 모았다. 아래 결과 수치는 당시 실행 값이다.

## Review focus

- A formatting-only PR must trigger CI without requiring a database.
- Both Java production and test sources must be checked.
- Editor formatting must use the repository's formatter rather than a conflicting default.
- Team recommendation must preserve balance-before-preference and stable tie breaking.
- Reformatting embedded SQL must preserve schema and migration version.

### Task 1: Formatting baseline and enforcement

**Files:** New .editorconfig, .gitattributes, .prettierrc.json, .prettierignore, .vscode/settings.json, .vscode/extensions.json, .github/workflows/format.yml, scripts/format-java.mjs, docs/development/code-style.md; modify package.json, apps/server/build.gradle and formatter-covered source/config files.

**Interfaces:** Add pnpm format, pnpm format:java, pnpm format:java:check; retain pnpm format:check. Java formatting is included in Gradle check/build.

- [x] Run existing TypeScript and Java tests as a baseline.
- [x] Add pinned formatter configuration, explicit source coverage, editor integration and standalone CI checks.
- [x] Run format checks before applying; confirm existing formatting violations are detected.
- [x] Apply both formatters; verify checks pass, Java compiles/tests pass and TypeScript typecheck/tests pass.
- [x] Commit only this task's files as the mechanical formatting commit.

### Task 2: Focused readability refactoring

**Files:** apps/server/src/main/java/cw/domain/TeamRecommender.java, apps/server/src/main/java/cw/matches/PublicMatchQuery.java, apps/server/src/main/java/cw/matches/IngestService.java, apps/web/src/features/matches/Detail.tsx, apps/collector/src/main/outbox-migrations.ts.

**Interfaces:** Keep all public signatures, output order and API response types unchanged. Private helper methods may name existing steps.

- [x] Use existing recommendation, match API and SQLite tests to verify behavior before edits.
- [x] Replace ambiguous local names, extract coherent recommendation/query steps and expand embedded SQL.
- [x] Apply formatters and run TypeScript checks/tests, Java/PostgreSQL tests, probe tests and browser/Electron regression tests as applicable.
- [x] Commit refactoring separately.
- [x] Request a fresh final code review; address material findings and verify the resulting change.

## Verification results

- Java formatting: 83 files reformatted; non-import code tokens matched the original before refactoring.
- Prettier and Java format checks pass; Gradle `build` includes Java format enforcement.
- TypeScript typecheck and 50 unit tests pass.
- Java/PostgreSQL: 108 tests pass, none skipped; 126-partition recommendation benchmark took 37ms.
- Local HTTPS probe regression: 31 tests pass.
- Web browser checks: 14 pass, comprising 11 actual-server checks and 3 injected UI-state checks.
- Electron checks: 7 pass against built main/preload/renderer and SQLite with simulated LCU/server responses.
- Embedded SQL tokens, SQLite table/index/foreign-key definitions and migration version are unchanged.
- Fresh review found a missing nested Gradle discovery setting; added `gradle.nestedProjects: ["apps/server"]` and checked against the Gradle extension's documented configuration.
- Windows launcher branch and editor configuration were reviewed; no actual Windows or interactive editor session was exercised.
