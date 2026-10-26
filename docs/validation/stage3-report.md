# Stage 3 verification — provisional T08–T12

> **과거 기록 · 2026-10-22.** 현재 기준은 [정본](../status.md)을 따른다.

**2026-10-23 범위 보완:** 사용자가 C01/C02 조회 시점 비교·C10 지연/과거 범위 측정·T15 실제 3–5경기 시범 운영을 제외했다. 이 변경은 실측 성공이 아니다. 결정 근거는 [D22](../superpowers/decisions/2026-10-22-overnight-decisions.md#d22--2026-10-23-사용자-요청에-따른-검증-작업-제외)에 남긴다.

> **2026-10-25 편집 보완:** 반복 설명을 정본 링크로 줄였다. 사건 날짜·실측값은 당시 기록이며 현재 링크로 갱신하지 않았다.

Implemented on `codex/stage-3-evaluation-web` from reviewed stage 2 `d762a152f0bee3e0d363ab9943a4f8120c1e7d27`. Implementation commit: `b659db1`. No push or PR was performed by this worker. Coordinator owns independent review and integration. This report covers local synthetic-fixture correctness, not release acceptance or actual League compatibility.

## Delivered behavior

2026-10-22 T08–T12의 구현 범위는 활약 점수·랭킹·팀 추천, 계산 결과의 묶음 공개, 공개·운영자 화면, 포지션 참고 자료 가져오기였다. 현재 세부 기준은 [활약 점수](../spec.md#경기별-활약-점수), [누적 랭킹](../spec.md#누적-랭킹과-점수-표시), [팀 추천](../spec.md#팀-편성용-실력과-팀-추천), [재계산·일관성](../spec.md#변경재계산일관성), [참고 자료 가져오기 계약](../contracts/api.md#공식-기록-참고-자료-가져오기)에서 관리한다.

당시 계산 버전은 포함 관계 판단이 끝나기 전의 `objective-provisional-v1`이었다. 탑은 포탑 피해, 나머지 포지션은 목표물 피해만 사용한 임시 구현이었다. 이 값은 아래 시험이 대상으로 삼은 버전이며, [2026-10-24 사용자 확정 D24](../superpowers/decisions/2026-10-22-overnight-decisions.md#d24--2026-10-24-목표물-공격-평가-기준-사용자-확정)나 이후 제품 반영을 이 시험으로 검증한 것은 아니다.

당시 [단계 3 계약 기록](../contracts/stage3-api.md)과 [스키마](../contracts/stage3.schema.json)를 추가했다. 실제 검증의 환경·범위·예외는 다음 절에 남긴다.

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

- 2026-10-22 당시 C07의 목표물·포탑 피해 의미와 최종 점수 정책은 HOLD였고 단계 1–3은 임시 구현이었다. 실제 Windows 자격 증명 보호와 설치·업데이트는 시험하지 않았다. 후속 의미 조사와 지표 결정은 [C07 기록](lcu-objective-semantics.md#이전-판정-이력), 현재 반영 상태는 [진행 상태](../status.md#남은-작업-순서)를 따른다.
- Direct official Riot API export is unavailable under the existing network gate. Explicit mapping/import is implemented and tested; no live export/import identity flow is claimed.
- Independent stage 3 code review and hosted stage 3 CI remain coordinator work. Stage 2 hosted Windows fixture CI at `d762a15` was reported successful by the coordinator ([run 39650156211](https://github.com/SangHyeok0908/Civil-War/actions/runs/39650156211)); this does not validate actual Windows League behavior.
- 당시 외부 HTTPS·도메인·Tunnel, 운영 토폴로지·프록시 제한 조정, 설치·백업·복원을 수행하지 않았다. T12의 외부망 관리 수용은 미확인이었고 로컬 쿠키·CSRF·관리 흐름은 실제 서버에서 통과했다. T15 제외는 위 2026-10-23 사용자 결정에 따른다.
- 당시 공개 요청 제한은 프로세스 재시작과 직접 IP에 의존했다. 운영 프록시의 실제 제한 동작과 다른 정규화 알고리즘은 이 시험으로 확인하지 않았다. 현재 운영·평가 변경 기준은 [설치·운영 설계](../spec.md#설치운영-설계)와 [계산 규칙 계약](../contracts/api.md#계산-규칙-검증게시복구)을 따른다.

Local logs: `/tmp/cw-stage3-final-server.log`, `/tmp/cw-stage3-final-web.log`, `/tmp/cw-stage3-final-electron.log`, `/tmp/cw-stage3-final-probe.log`; Gradle XML under `apps/server/build/test-results/test`. Runtime credentials/traces are gitignored in `test-results`; they are synthetic test DB artifacts and are not committed.
