# Code readability implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Make code consistently readable and reject formatting drift in CI.

**Architecture:** Keep Prettier for client code and development configuration; use Gradle Spotless with google-java-format AOSP for Java. Commit mechanical formatting separately from behavior-preserving readability refactoring.

**Tech Stack:** Existing Node 24.22.1, pnpm 11.5.0, Java 25, Gradle 9.8.2; pinned Spotless 8.10.4 and google-java-format 1.36.1. Version 1.37.0 changed the Style API and is incompatible with this Spotless release.

**Spec:** User-approved approach in the conversation on 2026-10-23: formatting configuration, Java formatter, editor/CI enforcement, then clearer names and smaller methods.

## Global constraints

- TypeScript/JavaScript/JSON/YAML/CSS/HTML use 2 spaces; Java uses 4 spaces through AOSP style.
- Preserve application behavior, HTTP contracts, scoring priorities and deterministic team ordering.
- Do not format historical documentation, captured fixtures, dependency locks or build output.
- Preserve pre-existing staged AGENTS.md and unrelated working-tree documentation edits.
- Work in the existing feature branch; do not create a worktree or publish changes.

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

- [ ] Use existing recommendation, match API and SQLite tests to verify behavior before edits.
- [ ] Replace ambiguous local names, extract coherent recommendation/query steps and expand embedded SQL.
- [ ] Apply formatters and run TypeScript checks/tests, Java/PostgreSQL tests, probe tests and browser/Electron regression tests as applicable.
- [ ] Commit refactoring separately.
- [ ] Request a fresh final code review; address material findings and verify the resulting change.
