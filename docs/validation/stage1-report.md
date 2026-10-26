# Stage 1 record foundation verification — 2026-10-22 KST

> **과거 기록 · 2026-10-22.** 현재 기준은 [정본](../status.md)을 따른다.

**2026-10-22 결과:** 임시 T01–T04 구현을 독립 검토했고 수정 후 로컬 검증을 마쳤다. 당시 단계 0은 HOLD였다. 실제 Windows LCU·운영 배포는 검증하지 않았으며, 이 작업자는 push·PR을 수행하지 않았다. 새 커밋의 원격 통합·CI 확인은 코디네이터에게 남겼다.

> **2026-10-25 편집 보완:** 반복 설명을 정본 링크로 줄였다. 사건 날짜·실측값은 당시 기록이며 현재 링크로 갱신하지 않았다.

Base: `d65f5d6` (stage 0). Branch: `codex/stage-1-record-foundation`.

## Delivered

2026-10-22 구현 범위는 원본 정규화·경기 저장과 확인·기기 및 운영자 인증·공개 조회였다. 당시 공유 스키마에는 정의 29개가 있었고, 임시 기대값·실행 안내·의존성 고정·격리 시험 DB·CI 설정을 추가했다. 구현 범위와 실제 검증 결과는 아래 시험 표를 구분해 읽는다.

각 기능의 현재 세부 기준은 [원본 정규화 계약](../contracts/api.md#lcu-원본을-정규화하는-규칙), [등록·중복 처리](../contracts/api.md#경기-수집등록과-중복-처리), [인증·권한](../contracts/api.md#인증과-권한), [공개 조회·정정](../contracts/api.md#공개-기록과-관리자-정정)에 있다.

## Environment and reproducibility

| Item | Observed/pinned value |
| --- | --- |
| Local runtime | macOS arm64, OpenJDK `25.0.1+8-27` |
| Spring Boot | exact `4.1.1`, official requirements checked; Java 25 and Gradle 9.x supported |
| Gradle | official `9.8.2` Wrapper task output |
| Distribution SHA-256 | `21bd5da2de49b642904077f38c0efdc7778e92b3ed0889392dca61b97e389607` |
| PostgreSQL | actual `18.6 (Debian 18.6-1.pgdg13+2)`, aarch64 |
| Container digest | `sha256:1267c7e692de235fda2a50dbcdbcbca4672ea6a0298576a6bd9d07cafc319b32` |
| Flyway / Hibernate / JUnit | Boot-managed `12.4.0` / `7.4.5.Final` / `6.0.3`, resolved lockfile |
| Test DB | `cw_test`, loopback port 55432, `cw-stage1-test` project and named volume |
| Migration | `V1__core.sql`, successful Flyway rows=1, service_state rows=1 |

당시 아래 시험은 저장소 루트에서 Java 25를 선택해 실행했다. 일반적인 DB 시작·빌드·복구 명령은 [서버 빌드와 테스트](../development/setup.md#서버-빌드와-테스트)를 따른다. 아래 `--rerun-tasks` 실행과 회복 프로세스 출력은 이 보고서의 결과를 특정하는 기록이다.

The worker used `/tmp/cw-gradle-cache` as GRADLE_USER_HOME and the installed OpenJDK path; neither local path is required by repository code. Initial sandbox-only Gradle invocation failed at its local lock socket; rerun with authorized access succeeded. DB tests are not conditional, skipped, or substituted with H2. The test superclass rejects any database whose name is not `cw_test` before cleanup.

## Automated results

Final server build after independent-review fixes: **70 tests, 0 failures, 0 errors, 0 skipped**; `build --rerun-tasks --console=plain` rebuilt classes, testClasses, executable bootJar and ran all tests against PostgreSQL. Existing stage 0 Node 24 suite: **31/31 pass, 0 skipped**. The coordinator confirmed that prior HEAD `727e2e0` passed the Ubuntu real-PostgreSQL [GitHub Actions run](https://github.com/SangHyeok0908/Civil-War/actions/runs/39643558919); the new fix commit still requires its own remote CI run after coordinator push.

| Suite | Tests | Evidence |
| --- | ---: | --- |
| MatchNormalizerTest | 10 | all G1–G3, huge string/integer IDs, missing/null/zero, range/type, team/win/count/join/schema checks |
| ContractCompatibilityTest | 3 | actual JSON wire values equal independently mapped G1–G3 expected documents |
| RegistrationIntegrationTest | 13 | all named T02 tests, concurrent transactions, discarded-response retries, participant authorization, rollback under audit/job constraint faults |
| AuthMembersIntegrationTest | 11 | all named T03 tests, concurrent code use in both scopes, real revoke endpoints, absolute session lifetime |
| HttpBoundaryIntegrationTest | 11 | CSRF reload, private errors/logs, strict envelopes/numeric schema, body cap, throttling, no-op member updates, collector HTTP round trip |
| StrictJsonIntegrationTest | 5 | numeric roles rejected without DB mutations, valid string roles, exact extra raw decimals through HTTP/DB/admin read, strict integer tokens, typed evaluation doubles |
| LocalRecoveryIntegrationTest | 1 | child `java -jar ... admin:code --revoke-all` process against actual test DB |
| RealHttpBoundaryIntegrationTest | 4 | embedded HTTP server, truly chunked body without a content length, production cookie flags |
| ErrorHandlingIntegrationTest | 2 | unexpected/framework errors keep stable private envelopes |
| MatchAccessIntegrationTest | 10 | all named T04 tests, same-participant filters, equal-time cursor paging, no-op corrections, injected correction/cancellation rollback |

Packaged recovery test's sanitized output:

```text
LOCAL_RECOVERY exit=0 codeLines=1 previousSessionRejected=true previousCodeRejected=true newCodeConsumed=true webListener=false
```

The temporary child-process output was deleted; no live code/token was checked into this report. The child process did not receive a test-only mock of AuthService. It used the packaged application and real database, and the fresh code was successfully consumed after old auth was rejected.

Concurrency tests use two threads with a start barrier and distinct transactions. Lost-response tests deliberately discard successful ingest/confirmation replies and resubmit the same logical operation. Real HTTP tests separately exercise the external upload/confirmation boundary. This is not a claim of Windows client/network failure testing.

## RED→GREEN and review findings

- T01: unimplemented normalizer produced 8 failing cases, then all passed; later strict join/schema and shared-wire expectations expanded coverage.
- T02: service stubs produced 9 failing cases; an overly broad rollback assertion was tightened to DataIntegrityViolationException, then actual PostgreSQL failures proved rollback. All 13 final tests pass.
- T03: all 8 initial tests failed against missing auth behavior, then passed. Display-name-only updates at profile revision zero exposed create/update coupling; explicit create context fixed it.
- T04: 7 of 8 initial tests failed on missing routes; existing member-only behavior already passed. Public query/correction implementation made all pass.
- Malformed code scope null originally threw; explicit scope validation now returns 422. Unknown JSON envelope properties initially passed; strict global Jackson settings now reject them, duplicate keys, trailing values, float-as-int and scalar coercions.
- Final local review: role-set reordering incorrectly raised revision/job; a failing no-op regression test now passes with canonical role order. Framework/unexpected failures lacked the common envelope; two failing tests now pass without reflected exception/request values.
- Contract comparison initially compared Jackson IntNode/LongNode implementation types. It now compares serialized-and-reparsed wire JSON to independent expectations; all three agree. No expected statistical value was changed to make the tests pass.
- Final security review: raw URI prefix checks allowed matrix-parameter paths to miss the authentication boundary while MVC still routed them. Two regression tests failed first; using Spring MVC parsed path segments fixed both, and a real HTTP test covers 18 literal/encoded-semicolon, double-slash, dot-segment and encoded-separator spellings; a separate round trip proves encoded `%3A` match keys work for collector confirmation/read and public read.
- The original implementer performed local diff/invariant review. A separate dispatched reviewer subsequently reviewed immutable `727e2e0`, reran 63 server/31 Node tests, and verified the source-backed audit of 660 candidate statistics before issuing the findings below.

## Independent review and resolution

The independent review requested changes for two P2 contract defects; no P0/P1 finding was reported. The review accepted conditional draft development and `objective-provisional-v1`, and retained C01/C02/C07/C10 HOLD. After review settlement, the coordinator explicitly assigned the reviewer a separate implementation dispatch to resolve the findings.

- **Numeric role ordinals:** `DatabaseConfiguration` allowed numeric JSON values 0–4 to deserialize into `Role` values, despite the string-only contract. New HTTP tests for collector confirmation and owner correction both failed with expected 400 / actual 200. Jackson 3 `EnumFeature.FAIL_ON_NUMBERS_FOR_ENUMS` now rejects these requests before mutation; regression checks cover unchanged match state, roles, audit, revision and jobs, followed by successful string-role requests.
- **Raw decimal precision:** extra raw JSON fields were parsed as doubles before storage, so `0.12345678901234567890123456789` became `0.12345678901234568`. A new HTTP/real-DB regression reproduced that loss. `USE_BIG_DECIMAL_FOR_FLOATS` now preserves numeric values in raw JSON trees through storage and owner readback, including nested scientific-notation decimals. Required metric tokens `1.25` and `1.0` still return 422, large integer game IDs and existing metrics remain exact, and typed `GameScore` double fields retain their existing wire behavior.
- **T04 transaction coverage:** owner role correction with an injected audit constraint failure and cancellation with an injected job constraint failure each return 409 and roll back roles/state, audit, revision and jobs. A failed cancellation leaves the registered match publicly visible. These tests confirmed existing behavior without a product-code change.

Before the mapper fix, the focused five-test suite had exactly the three expected failures (two numeric-role requests and decimal precision); after the fix all five passed. Final complete verification is the 70/70 server and 31/31 Node result above. Production changes are limited to mapper configuration; fixture statistics, API shapes, migrations and provisional gates are unchanged.

## API and next-stage handoff

당시 T08–T12에 전달한 자료는 [단계 1 계약 기록](../contracts/stage1-api.md), [단계 1 스키마](../contracts/stage1.schema.json), [G1–G3 임시 기대값의 용도](../../fixtures/contracts/v1/README.md), [D07–D12 결정](../superpowers/decisions/2026-10-22-overnight-decisions.md)이다.

현재 소비자 계약은 [통합 계약](../contracts/api.md), 변경·재계산 경계는 [명세](../spec.md#변경재계산일관성), 실행·복구는 [개발 안내](../development/setup.md#최초-관리자와-복구)를 따른다. 이 링크는 이후 구현이 당시 시험에 포함됐다는 뜻이 아니다.

## Remaining limitations

- 범위 보완 기록, 2026-10-23: C07 damage semantics remains HOLD. C01/C02/C10 and T15 pilot games are excluded by explicit user decision ([D22](../superpowers/decisions/2026-10-22-overnight-decisions.md#d22--2026-10-23-사용자-요청에-따른-검증-작업-제외)); prior review notes retain their historical scope. Candidate IDs/PUUIDs/timestamps are synthetic/pseudonymous; fixtures are not relabeled verified or seeded as public demo players.
- 2026-10-22에는 계산 작업자·세대 공개·화면·Windows 수집기가 후속 단계였다. 당시 공개 평가 상태는 `recalculating`, scoringVersion은 null, 작업은 pending이었다. 이후 결과는 [현재 상태](../status.md#단계별-확인-범위)에서 확인한다.
- 당시 소규모 모임용 전역 쓰기 잠금과 전체 상태별 내부 목록을 사용했다. 대규모 쓰기 처리량은 측정하지 않았다. 현재 일관성·조회 기준은 [변경·재계산 명세](../spec.md#변경재계산일관성)와 [공개 조회 계약](../contracts/api.md#공개-기록과-관리자-정정)을 따른다.
- 당시 시험은 인증 요청 제한의 실제 프록시 환경·운영 TLS·백업·JVM 패치 고정·Windows 패키징을 다루지 않았다. 운영 설계는 [설치·운영 명세](../spec.md#설치운영-설계), 후속 검증 상태는 [남은 작업](../status.md#남은-작업-순서)을 따른다.
- The coordinator confirmed prior HEAD CI success as linked above; this fix commit has only local verification until the coordinator pushes and checks its own run. No remote push/PR or production changes were made by this worker.
