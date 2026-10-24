# Stage 3 verification — provisional T08–T12

**2026-10-24 update:** The C07 inclusion review is complete: the official result-stat definition includes turret damage in objective damage, supported by the installed client display mapping and existing G1 comparison. The user confirmed TOP=turret damage per minute and the other four roles=objective damage per minute, retaining the existing overall weights ([D24](../superpowers/decisions/2026-10-22-overnight-decisions.md#d24--2026-10-24-목표물-공격-평가-기준-사용자-확정)). Stage 0 remains HOLD pending selection and implementation of a new algorithm version, contract/UI updates, and recalculation and validation of all eligible matches. The current `objective-provisional-v1` implementation is retained until that follow-up is completed. See [C07 evidence](lcu-objective-semantics.md) and [D23](../superpowers/decisions/2026-10-22-overnight-decisions.md#d23--2026-10-24-c07-포함-관계-조사-결과). Earlier dated status notes are historical.

**Current scope, 2026-10-23:** By explicit user decision, C01/C02 (new-game lookup timing comparisons), C10 (availability-delay/history-range measurements), and T15 (3–5 real pilot games) are excluded from pending work and acceptance conditions. Exclusion does not establish a successful measurement. C07 objective/turret semantics and scoring finalization, T13 Windows installation/upgrades, and T14 external access/backup/restore remain. See [D22](../superpowers/decisions/2026-10-22-overnight-decisions.md#d22--2026-10-23-사용자-요청에-따른-검증-작업-제외).

Implemented on `codex/stage-3-evaluation-web` from reviewed stage 2 `d762a152f0bee3e0d363ab9943a4f8120c1e7d27`. Implementation commit: `b659db1`. No push or PR was performed by this worker. Coordinator owns independent review and integration. This report covers local synthetic-fixture correctness, not release acceptance or actual League compatibility.

## Delivered behavior

- Exact role-normalized P/H scoring, both current-game role observations excluded from history, group k=5 cumulative prior, null/unrated at zero games, provisional at 1–2, ranked at 3+, displayed two-decimal competition ranks, totals-based KDA/Perfect and finite conservative zero handling. Seed and solo data cannot enter public scores. Full immutable rules persist weights, mixes and supported v1 constants. The unresolved objective-overlap decision remains `objective-provisional-v1`: TOP turret, other roles objective alone.
- Durable PostgreSQL jobs and generations; repeatable-read snapshots; one session advisory-lock worker; revision, desired version and claim-attempt fencing before atomic publication. All game scores, member aggregates and role skills live in one generation. Mutations clear the pointer immediately. Stale/failed work is never active; failed jobs retry manually or at web restart, interrupted running jobs recover. The non-web admin recovery CLI never starts the worker.
- Exactly 126 distinct 5/5 roster partitions, only playable role permutations, balance then preference then stable IDs, one assignment per roster, at most three within best+5. Hall subset shortages, duplicate/inactive inputs, bounded revision/generation/ID cache and anonymous IP rate limit are covered.
- Korean React/TypeScript/Vite public list/detail, members/profile, rankings and team pages, all ten participants, KST/filter/pagination, icons and numeric fallback, score breakdown and actual rule weights, keyboard controls and narrow-screen table scrolling. Match detail automatically refreshes its 200/recalculating response; aggregate 202 responses also poll. Admin cookie/CSRF login, complete member preferences and seed editor, codes/sessions/devices, role correction/cancel, raw readonly precision, audits, rules/jobs/retry and explicit role suggestion application are implemented.
- Confirmed member↔official-PUUID mapping is mandatory for solo reference import. Newest 20 valid samples use frequency, recency and fixed role tie-breaks. Imported data never changes preferences or ranked statistics. Stage 2 evidence adapter now supplies duration/early-end fields; live official API export remains unavailable.
- Spring packages the web during a clean build and serves only enumerated SPA fallback routes; `/api` remains JSON. Updated [API contract](../contracts/stage3-api.md) and [schema](../contracts/stage3.schema.json) preserve stage 1 ingest/auth behavior.

## Verification evidence

Local runtime: macOS arm64, Java 25.0.1, Gradle 9.8.2, Node 24.22.1, pnpm 11.5.0, actual PostgreSQL 18.6 Docker Compose. Browser tests use packaged Spring JAR and isolated `cw_web_test`; server tests use isolated `cw_test`. No H2 replacement, skip-on-no-Docker path, or product test fixture API exists.

| Command | Result |
| --- | --- |
| `./apps/server/gradlew -p apps/server clean build --console=plain` | **108 passed, 0 failed/errors/skipped**; includes real PostgreSQL, raw precision, contracts, packaged admin recovery and same-origin Vite assets |
| `pnpm typecheck` | PASS |
| `pnpm test` | **50 passed**, 7 files; prior 48 retained plus 2 web API/rounding tests |
| `pnpm build` | PASS, collector and public web |
| `pnpm test:web` | **14 passed**, 0 skipped: 11 actual-server scenarios + 3 scoped UI fixture scenarios (42.9s) |
| `pnpm test:e2e` | **7 passed**, actual Electron/SQLite with scoped LCU/server fixtures |
| `pnpm test:probe` | **31 passed**, 0 skipped, local HTTPS transport/security regression |
| `pnpm format:check` | PASS, includes web, browser tests and harness |
| `git diff --check` | PASS |

`TeamRecommenderTest` measured **34 ms** for all 10 members playable in all 5 roles, **126** partitions and at most 3 unique recommendations, below the 2s target on this development machine. Production-host latency has not been measured.

Server tests include hand-calculated neutral winner/loser 52.5/47.5 and history 62.121212… goldens, rounded rank ties, same-role/current-game exclusion, n0/n1/n2/n3 thresholds, cancellation, seed isolation, Hall overlap and one/two candidate results. Repeatable-read isolation injects concurrent role/seed/cancel mutations. PostgreSQL failure triggers, stale revision/version guards, single worker locking, recovered claim fencing and recovery failures test publication boundaries. Public DTO/schema checks prohibit raw/PUUID/seed/credential leakage.

The web suite separates **11 real-server scenarios** from **3 explicitly named fixture-only UI scenarios**. Real tests cover anonymous public views/recommendations, missing image responses, 390px mobile width and keyboard selection, code/cookie/CSRF and device flows, explicit suggestion import/apply, immutable new rules and jobs, and collector HTTP integration. The collector cross-stage scenario uses actual Stage 2 `HttpServerApi`, file SQLite Outbox and Uploader against Spring: ingest remains private, explicit confirmation commits, its acknowledgment is deliberately lost, reopened Outbox retries without duplication, then browser role correction and cancellation preserve raw high-precision text and audit history. The crash scenario stalls a generation DB insert, SIGKILLs the actual web JVM, verifies no active pointer and a durable running job, invokes actual `admin:code` without claiming jobs, restarts the JVM and verifies attempt 2 publication. Fixture-only tests inject loading/empty/error/202/malformed-200 and pending-selection/200-recalculation states; these are not backend evidence.

Initial test failures led to numeric JsonNode semantic comparison after PostgreSQL roundtrip, overflow-safe reference evidence validation, raw JSON string display instead of JS number rounding, claim-attempt fencing, and automatic detail refresh. Browser fixture defects (waiting for PATCH commit, URL encoding/navigation) were corrected separately. T08–T10 started with missing implementation failures. T11/T12 browser coverage was developed alongside the UI; an initial route failure and later regressions were observed, but this does not establish every originally prescribed test-first step.

## Visual review

[Desktop match](assets/stage3-match-desktop.png) deliberately blocks all remote images and opens a score breakdown; fallback IDs remain readable. [Mobile match](assets/stage3-mobile.png) verifies 390px body width and horizontal table scroll. [Rankings](assets/stage3-rankings.png), [teams](assets/stage3-teams.png) and [admin](assets/stage3-admin.png) show the restrained slate/navy/cyan interface. Worker and coordinator inspected screenshots; coordinator requested no redesign. Screenshots contain synthetic names/records only.

Pinned Korean asset metadata uses Data Dragon **16.20.1**, checked against [Riot's official Data Dragon documentation](https://developer.riotgames.com/docs/lol#data-dragon) and official version list. Remote images may fail or omit older items; IDs remain visible and record queries do not depend on image success. This does not resolve LCU patch validation.

## Remaining acceptance limits

- **C07 remains HOLD** for objective/turret damage semantics and final scoring policy. C01/C02/C10 are excluded by user decision, as are the previously waived client-restart and other-PC comparisons. Actual Windows credential protection and installation/update acceptance remain under T13. Stage 1–3 remain provisional drafts.
- Direct official Riot API export is unavailable under the existing network gate. Explicit mapping/import is implemented and tested; no live export/import identity flow is claimed.
- Independent stage 3 code review and hosted stage 3 CI remain coordinator work. Stage 2 hosted Windows fixture CI at `d762a15` was reported successful by the coordinator ([run 39650156211](https://github.com/SangHyeok0908/Civil-War/actions/runs/39650156211)); this does not validate actual Windows League behavior.
- External HTTPS/domain/Tunnel access, production topology and rate-limit proxy tuning, installation, and backups/restore belong to T13–T14 and remain unperformed. T15 pilot games have been removed from the plan and are not an acceptance condition. T12's external-network management acceptance is still open; local real cookie/CSRF/admin flows pass.
- In-process public limiter resets on restart and uses direct remote IP; a reverse proxy may share one bucket until trusted proxy deployment is deliberately configured. Rules editor changes weights/mixes; alternative normalization algorithms require implementation of another supported algorithm version.

Local logs: `/tmp/cw-stage3-final-server.log`, `/tmp/cw-stage3-final-web.log`, `/tmp/cw-stage3-final-electron.log`, `/tmp/cw-stage3-final-probe.log`; Gradle XML under `apps/server/build/test-results/test`. Runtime credentials/traces are gitignored in `test-results`; they are synthetic test DB artifacts and are not committed.
