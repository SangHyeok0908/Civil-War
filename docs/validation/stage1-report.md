# Stage 1 record foundation verification — 2026-10-22 KST

**Result: provisional T01–T04 implemented and locally verified. Stage 0 remains HOLD.** No Windows LCU claim, production deployment, push, or PR is part of this worker's result. Coordinator owns fresh review and GitHub integration.

Base: `d65f5d6` (stage 0). Branch: `codex/stage-1-record-foundation`.

## Delivered

- Strict Jackson 3 normalization of the observed custom SR tuple, lossless 1–30 digit game IDs, ten-identity join, five players per team, win consistency, positive duration, required metrics/items, missing/null/zero distinctions, supported schema version checks.
- PostgreSQL/Flyway/JPA persistence for immutable raw/normalized pending ingest, participant-only access/confirmation, first confirmation wins, all-state platform/game uniqueness, transactionally coupled audit/revision/jobs, immutable canceled state.
- Scoped hashed one-use codes, device/account binding, revocable credentials, admin session cookies and CSRF/origin enforcement, session reload, inactivity/absolute lifetime, local recovery, stable member IDs, allowed roles and bounded seed skill.
- Safe public DTOs, registered-only access, same-participant Specification filters, stable keyset pagination, owner role correction/cancellation and audit history. Names/profile roles do not overwrite historical roles; semantic no-ops do not recalculate.
- Shared provisional JSON expectations, 29 JSON Schema definitions, API consumer documentation, root start guide, dependency lockfile, official checksum wrapper, isolated Compose DB and CI workflow.

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

Commands (root; Java 25 selected through JAVA_HOME):

```sh
docker compose -f infra/compose.test.yml up -d --wait
./apps/server/gradlew -p apps/server clean build
node --test tools/lcu-probe/probe.test.mjs tools/lcu-probe/audit-candidates.test.mjs
git diff --check
```

The worker used `/tmp/cw-gradle-cache` as GRADLE_USER_HOME and the installed OpenJDK path; neither local path is required by repository code. Initial sandbox-only Gradle invocation failed at its local lock socket; rerun with authorized access succeeded. DB tests are not conditional, skipped, or substituted with H2. The test superclass rejects any database whose name is not `cw_test` before cleanup.

## Automated results

Final server build: **63 tests, 0 failures, 0 errors, 0 skipped**; classes, testClasses, executable bootJar and build succeeded. Existing stage 0 Node 24 suite: **31/31 pass, 0 skipped**. Local success does not imply remote GitHub Actions has run; the coordinator can run it after push.

| Suite | Tests | Evidence |
| --- | ---: | --- |
| MatchNormalizerTest | 10 | all G1–G3, huge string/integer IDs, missing/null/zero, range/type, team/win/count/join/schema checks |
| ContractCompatibilityTest | 3 | actual JSON wire values equal independently mapped G1–G3 expected documents |
| RegistrationIntegrationTest | 13 | all named T02 tests, concurrent transactions, discarded-response retries, participant authorization, rollback under audit/job constraint faults |
| AuthMembersIntegrationTest | 11 | all named T03 tests, concurrent code use in both scopes, real revoke endpoints, absolute session lifetime |
| HttpBoundaryIntegrationTest | 11 | CSRF reload, private errors/logs, strict envelopes/numeric schema, body cap, throttling, no-op member updates, collector HTTP round trip |
| LocalRecoveryIntegrationTest | 1 | child `java -jar ... admin:code --revoke-all` process against actual test DB |
| RealHttpBoundaryIntegrationTest | 4 | embedded HTTP server, truly chunked body without a content length, production cookie flags |
| ErrorHandlingIntegrationTest | 2 | unexpected/framework errors keep stable private envelopes |
| MatchAccessIntegrationTest | 8 | all named T04 tests, same-participant filters, equal-time cursor paging, no-op corrections |

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
- The worker performed local diff/invariant review. A separate fresh reviewer is the coordinator's next step, per ownership instructions; this report is not an independent code-review claim.

## API and next-stage handoff

- [API shapes, auth, errors and examples](../contracts/stage1-api.md)
- [JSON Schema](../contracts/stage1.schema.json)
- [Independent provisional G1–G3 expectations](../../fixtures/contracts/v1/README.md)
- [Start and recovery instructions](../../README.md)
- [Decisions D07–D12](../superpowers/decisions/2026-10-22-overnight-decisions.md)

T08–T12 can consume `MemberContracts`, `EvaluationContracts`, registered matches via MatchRepository/MatchViews, confirmed participant roles and stable member IDs. `service_state` owns the source revision and desired-version/active-generation pointers; `recalculation_jobs` durably records pending revisions. Future scoring mutations must use the same transaction boundary and preserve immutable raw data. Add V2+ migrations; do not edit applied V1.

## Remaining limitations

- C01/C02/C07/C10 remain external HOLD. Candidate IDs/PUUIDs/timestamps are synthetic/pseudonymous; fixtures are not relabeled verified or seeded as public demo players.
- Scoring workers/generations and frontend/Windows collector belong to subsequent stages. Public evaluation status is currently `recalculating`, scoringVersion null, jobs pending.
- The global mutation lock intentionally limits write throughput for this small group. Internal private queues return complete state-filtered lists; only public records have cursor pagination.
- Auth throttling is per-process/direct-IP and resets on restart. Production trusted-proxy configuration, TLS deployment, operational backups, JVM patch pin and Windows packaging remain stage 4 work.
- The CI file is prepared but has not been executed remotely by this worker. No remote push/PR or production changes were made.
