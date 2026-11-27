# 팀 추천 시점 솔로랭크 조회 구현 계획

> **실행 담당자 안내:** superpowers:subagent-driven-development 또는 superpowers:executing-plans로 작업 단위마다 진행하고, 체크박스로 단계를 추적한다.

**Goal:** 팀 추천 요청 때 선택한 10명의 솔로랭크 등급을 동시에 조회해 포지션별 실력에 반영하고, 초기 포지션 참고 자료 기능을 제거한다.

**Architecture:** `HttpRiotGateway`가 서버 전체 동시 요청 수를 제한하고 429 대기 시각을 스레드 간에 안전하게 공유한다. 새 `LiveRankLookup`이 10명을 가상 스레드로 동시에 `SoloRankService.refresh`에 넘기고, 4초 상한이 지나면 남은 작업을 취소한다. `TeamService`는 조회 결과의 시드로 `RoleSkillCalculator`를 요청 시점에 실행하고, 사람별 반영 상태(`rankLookups`)를 응답에 붙인다.

**Tech Stack:** Java 25, Spring Boot 4.1, PostgreSQL(Flyway), React + TypeScript, Playwright.

**Spec:** [팀 추천 시점의 솔로랭크 조회와 초기 포지션 참고 자료 제거 설계](../specs/2026-11-25-team-live-solo-rank-design.md)

## Global Constraints

- 전체 대기 상한 기본값 4000ms(`cw.riot.lookup-deadline-ms`), 서버 전체 동시 Riot 요청 기본값 10개(`cw.riot.max-concurrent-requests`), Riot 요청 하나의 제한 시간 기본값 4000ms(`cw.riot.request-timeout-ms`).
- `rankLookups[].source`는 `live`·`saved`·`default`, `status`는 `ranked`·`unranked`·`unavailable`·`not_found`·`conflict`·`timeout`이다.
- `live`는 이번 조회 결과가 `ranked`·`unranked`일 때, `saved`는 그 밖이면서 마지막 성공 조회 시각(`observedAt`)이 있을 때, `default`는 그 밖의 경우다. `default`의 시드는 정책 중립값 50이다.
- 상한을 넘긴 조회는 결과를 저장하지 않는다.
- 등급 시드가 바뀌어도 재계산 번호(`source_revision`)를 올리지 않는다. 감사 기록 `rank_seed_updated`는 유지한다.
- 공개 순위·종합 점수 계산은 바꾸지 않는다.
- 커밋 메시지는 `영어 유형: 한글 제목` 형식이며 공동 작성자 줄을 넣지 않는다.
- Java는 커밋 전 `pnpm format:java`, 웹 코드는 `pnpm format`을 실행한다.
- 서버 시험은 `docker compose -f infra/compose.test.yml up -d --wait` 뒤 `./apps/server/gradlew -p apps/server test --tests <클래스>`로 실행한다.

## Review Focus

1. **Riot 키가 없는 환경(개발·웹 시험 서버):** 모든 사람이 즉시 `default`로 처리되어야 하고, 4초를 기다리면 안 된다. → Task 2 `blankKeyFinishesWithoutWaitingForTheDeadline`
2. **재계산 중(평가 결과 없음):** 202 `RECALCULATING`을 돌려주고 Riot을 한 번도 호출하지 않아야 한다. → Task 3 `recalculatingSkipsRiotLookups`
3. **한 사람의 조회 코드가 예외를 던짐:** 그 사람만 `unavailable`로 처리하고 나머지와 추천은 정상이어야 한다. → Task 2 `exceptionForOneMemberOnlyAffectsThatMember`
4. **같은 참가자가 포함된 추천 두 건이 동시에 들어옴:** 둘 다 오류 없이 응답해야 한다. → Task 2 `concurrentLookupsForSameMembersBothSucceed`
5. **업그레이드 전에 저장된 평가 결과 JSON(`roleSkills` 포함):** 그대로 읽혀야 한다. → Task 3 `generationJsonWithLegacyRoleSkillsIsReadable`

---

### Task 1: Riot 요청 동시 실행과 동시 요청 수 제한

**Files:**
- Modify: `apps/server/src/main/java/cw/riot/HttpRiotGateway.java`
- Test: `apps/server/src/test/java/cw/riot/HttpRiotGatewayTest.java`

**Interfaces:**
- Produces: 생성자 `HttpRiotGateway(String key, URI accountOrigin, URI platformOrigin, JsonMapper json, int maxConcurrentRequests, Duration requestTimeout)`. 기존 4인자 생성자는 `(…, 10, Duration.ofMillis(4000))`로 위임한다. Spring 생성자는 `@Value("${cw.riot.max-concurrent-requests:10}")`, `@Value("${cw.riot.request-timeout-ms:4000}")`를 받는다.

- [ ] **Step 1: 실패하는 시험 작성.** 기존 시험처럼 `HttpServer`로 가짜 Riot을 띄운다.

```java
@Test
void requestsRunConcurrentlyUpToTheLimit() throws Exception {
    // 서버 처리기는 진입 시 inFlight를 올리고 최대값을 기록, 300ms 잠든 뒤 내림. 응답은 "[]".
    HttpRiotGateway gateway = new HttpRiotGateway("key", origin, origin, json, 2, Duration.ofSeconds(2));
    // 가상 스레드 4개로 getSoloRank("p"+i) 동시 호출
    assertThat(maxInFlight.get()).isEqualTo(2);
    assertThat(elapsedMillis).isLessThan(1000); // 순차라면 1200ms 이상
}

@Test
void tooManyRequestsBlocksConcurrentCallers() throws Exception {
    // 첫 요청에 429 + Retry-After: 60, 이후 요청은 횟수만 센다.
    // 첫 호출 뒤 다른 스레드 5개가 동시에 getSoloRank 호출
    assertThat(results).allSatisfy(r -> assertThat(r.status()).isEqualTo("unavailable"));
    assertThat(serverHits.get()).isEqualTo(1);
}

@Test
void interruptedWaitForPermitReturnsUnavailable() throws Exception {
    // 한도 1, 첫 호출이 서버에서 2초 잠든 동안 두 번째 호출 스레드를 interrupt
    assertThat(second.status()).isEqualTo("unavailable");
    assertThat(secondElapsedMillis).isLessThan(500);
}
```

- [ ] **Step 2: 실패 확인.** `--tests cw.riot.HttpRiotGatewayTest` → 6인자 생성자가 없어 컴파일 실패.
- [ ] **Step 3: 구현.** `get`의 `synchronized`를 없앤다. `retryNotBefore`는 `AtomicLong`으로 바꾸고 429 때 `accumulateAndGet(…, Math::max)`로 기록한다. `Semaphore(maxConcurrentRequests, true)`의 `acquire()`를 요청 전에 하고 `finally`에서 반납한다. 키가 비어 있거나 429 대기 중이면 허가를 받기 전에 바로 돌려준다. 요청 제한 시간은 `requestTimeout`을 쓴다. `acquire` 중 인터럽트되면 인터럽트 표시를 복원하고 `null`을 돌려준다.
- [ ] **Step 4: 통과 확인.** `--tests cw.riot.HttpRiotGatewayTest` → 기존 시험 포함 전부 PASS.
- [ ] **Step 5: 커밋.** `feat: Riot 요청을 동시에 보내되 서버 전체 동시 수를 제한`

### Task 2: 10명 동시 조회와 대기 상한

**Files:**
- Create: `apps/server/src/main/java/cw/riot/LiveRankLookup.java`
- Modify: `apps/server/src/main/java/cw/riot/SoloRankService.java`, `apps/server/src/main/java/cw/contracts/EvaluationContracts.java`
- Test: `apps/server/src/test/java/cw/riot/LiveRankLookupIntegrationTest.java`(새 파일, `DatabaseTestSupport` 상속), `apps/server/src/test/java/cw/members/SoloRankIntegrationTest.java`

**Interfaces:**
- Consumes: Task 1의 동시 실행 가능한 `RiotGateway`.
- Produces:
  - `record RankLookup(String memberId, String source, String status, double teamSeed, String tier, String division, Instant observedAt)` (`EvaluationContracts` 안). 정적 함수 `RankLookup.of(String memberId, RankSeedSnapshot value, String status)`가 Global Constraints의 `source` 규칙과 `default` 시 시드 50·tier/division/observedAt null을 적용한다.
  - `SoloRankService.refresh(String memberId, Instant deadline)` → `RankSeedSnapshot` 또는 저장 전 상한이 지났거나 인터럽트되었으면 `null`. 기존 `refresh(String memberId)`는 `Instant.MAX`로 위임한다.
  - `SoloRankService.snapshotForMember(String memberId)` → 회원의 계정으로 `snapshot(...)`을 돌려준다.
  - `LiveRankLookup(SoloRankService ranks, Clock clock, @Value("${cw.riot.lookup-deadline-ms:4000}") long deadlineMillis)`, `List<RankLookup> lookup(List<String> memberIds)`: 입력 순서대로 돌려준다.

- [ ] **Step 1: 실패하는 시험 작성.** `@MockitoBean RiotGateway gateway`. 상한 시험은 `new LiveRankLookup(ranks, clock, 300)`으로 직접 만든다. 회원 `member-N`의 Riot ID는 `PlayerN#test`다.

```java
@Test void successfulLookupIsLive()              // member-1 DIAMOND I → source live, status ranked, teamSeed 90
@Test void failedLookupUsesSavedValue()          // 먼저 DIAMOND I 저장, 다음 getSoloRank unavailable → source saved, teamSeed 90, observedAt = 첫 조회 시각
@Test void neverSucceededUsesDefault()           // 스텁 없음 → source default, status unavailable, teamSeed 50, tier null
@Test void unrankedIsLiveAtFifty()               // unranked → source live, teamSeed 50
@Test void memberPastDeadlineTimesOutAndIsNotSaved() {
    // member-3 getSoloRank 응답이 2초 지연, 나머지는 즉시 GOLD IV
    // 결과 반환까지 1000ms 미만, member-3: status timeout, source default
    // 2.5초 뒤 ranks.snapshotForMember("member-3").status()가 "ranked"가 아님
}
@Test void blankKeyFinishesWithoutWaitingForTheDeadline() // gateway 모든 호출 null → 10명 default, 기본 4000ms 상한 객체로 200ms 미만
@Test void exceptionForOneMemberOnlyAffectsThatMember()   // member-2 resolveAccount가 RuntimeException → member-2 unavailable, member-1 live
@Test void concurrentLookupsForSameMembersBothSucceed()   // 같은 10명으로 lookup 두 번 동시 실행 → 예외 없음, 둘 다 10개
```

`SoloRankIntegrationTest`에 추가:

```java
@Test void rankChangeDoesNotBumpRevision() // refresh로 DIAMOND I 저장 전후 revision() 동일, audit_log에 rank_seed_updated 1건
```

- [ ] **Step 2: 실패 확인.** `--tests cw.riot.LiveRankLookupIntegrationTest --tests cw.members.SoloRankIntegrationTest` → 컴파일 실패.
- [ ] **Step 3: 구현.** `refresh`에서 `mutations.changed(state)` 호출을 없앤다. 저장 트랜잭션 직전과 잠금 직후에 `clock.instant().isAfter(deadline) || Thread.currentThread().isInterrupted()`이면 `null`을 돌려준다. `LiveRankLookup`은 필드로 `Executors.newVirtualThreadPerTaskExecutor()`를 두고 `@PreDestroy`에서 `shutdownNow()` 한다. 사람마다 작업을 제출하고 상한 시각까지 각 `Future.get(남은 시간)`을 기다린다. 끝나지 않은 작업은 `cancel(true)` 하고 `RankLookup.of(id, ranks.snapshotForMember(id), "timeout")`로 채운다. 작업 안의 예외는 `RankLookup.of(id, ranks.snapshotForMember(id), "unavailable")`로 바꾼다.
- [ ] **Step 4: 통과 확인.** 같은 명령 → PASS.
- [ ] **Step 5: 커밋.** `feat: 팀 추천용 솔로랭크를 10명 동시에 대기 상한 안에서 조회`

### Task 3: 팀 추천 요청 시점의 포지션별 실력 계산

**Files:**
- Modify: `apps/server/src/main/java/cw/teams/TeamService.java`, `apps/server/src/main/java/cw/domain/RoleSkillCalculator.java`, `apps/server/src/main/java/cw/domain/TeamRecommender.java`, `apps/server/src/main/java/cw/evaluation/RecalculationWorker.java`, `apps/server/src/main/java/cw/contracts/EvaluationContracts.java`
- Test: `apps/server/src/test/java/cw/teams/TeamApiIntegrationTest.java`, `apps/server/src/test/java/cw/evaluation/RecalculationIntegrationTest.java`, `apps/server/src/test/java/cw/evaluation/ConfirmedScoringMigrationIntegrationTest.java`, `apps/server/src/test/java/cw/domain/RoleSkillCalculatorTest.java`(없으면 새 파일)

**Interfaces:**
- Consumes: Task 2의 `LiveRankLookup.lookup`, `RankLookup`.
- Produces:
  - `RoleSkillCalculator.calculate(List<Member> members, List<GameScore> scores, Map<String, Double> seedByMember)`: 시드가 없는 회원은 `RankSeedPolicy.neutral()`.
  - `TeamRecommendation(List<TeamCandidate> candidates, String reason, long sourceRevision, List<RankLookup> rankLookups)`와 `TeamRecommendation withRankLookups(List<RankLookup>)`. `TeamRecommender`는 빈 목록을 넣는다.
  - `EvaluationGeneration`에서 `roleSkills` 필드를 없애고 `@JsonIgnoreProperties(ignoreUnknown = true)`를 붙인다.

- [ ] **Step 1: 실패하는 시험 작성.**

```java
// RoleSkillCalculatorTest
@Test void seedActsAsFiveVirtualGames() // 시드 90, TOP 점수 60 다섯 판 → TOP 75.0, 나머지 포지션 90.0
@Test void missingSeedUsesNeutral()      // seedByMember 비어 있음, 점수 없음 → 50.0

// TeamApiIntegrationTest (기존 noInhouse…, oneInhouse… 는 generation.roleSkills() 대신 응답으로 확인하도록 고침)
@Test void recommendationReturnsRankLookupsForAllTen() // 200, $.rankLookups.length()==10, member-1 항목 source live·teamSeed 90
@Test void freshRankChangesRecommendationWithoutRecalculation() {
    // worker.runOnce() 후 member-1 DIAMOND I로 추천 → 이어서 IRON IV로 스텁 변경 후 추천
    // 두 번째 응답의 member-1 teamSeed 0, revision() 변화 없음, recalculation_jobs 수 변화 없음
}
@Test void recalculatingSkipsRiotLookups() // 평가 결과 없음 → 202 RECALCULATING, verify(gateway, never()).resolveAccount(any())

// ConfirmedScoringMigrationIntegrationTest 또는 RecalculationIntegrationTest
@Test void generationJsonWithLegacyRoleSkillsIsReadable() // evaluation_generations.result_json에 "roleSkills":[] 추가 후 evaluations.current()가 예외 없이 읽힘
```

- [ ] **Step 2: 실패 확인.** `--tests cw.teams.TeamApiIntegrationTest --tests cw.domain.RoleSkillCalculatorTest --tests 'cw.evaluation.*'` → 컴파일 실패.
- [ ] **Step 3: 구현.** `TeamService.recommend`에서 메서드 단위 `@Transactional`을 없앤다. 회원 검증과 `evaluations.current()` 읽기만 `TransactionTemplate`(읽기 전용, REPEATABLE_READ) 안에서 한다. 평가 결과가 없으면 조회 없이 202를 던진다. 그 뒤 트랜잭션 밖에서 `LiveRankLookup.lookup(ids)`를 호출하고, 결과 시드로 `RoleSkillCalculator`를 실행해 `TeamRecommender`에 넘긴다. 결과 캐시 키에 `memberId=teamSeed` 목록(정렬)을 덧붙이고, 응답은 `withRankLookups(lookups)`로 만든다. `RecalculationWorker`는 `roleSkills`를 만들지 않는다. 기존 시험의 `roleSkills()` 확인(`RecalculationIntegrationTest:38`, `ConfirmedScoringMigrationIntegrationTest:157`)은 제거한다.
- [ ] **Step 4: 통과 확인.** 같은 명령 → PASS.
- [ ] **Step 5: 커밋.** `feat: 팀 추천 때 조회한 등급으로 포지션별 실력 계산`

### Task 4: 백그라운드 등급 조회 제거

**Files:**
- Create: `apps/server/src/main/resources/db/migrations/V10__drop_rank_next_attempt.sql`
- Modify: `apps/server/src/main/java/cw/riot/SoloRankScheduler.java`, `apps/server/src/main/java/cw/riot/SoloRankService.java`, `apps/server/src/main/java/cw/riot/SoloRankSnapshot.java`, `apps/server/src/main/java/cw/accounts/AccountLinkService.java:105`, `apps/server/src/main/java/cw/domain/RankSeedPolicy.java`, `apps/server/src/main/resources/policies/rank-seed-v1.json`
- Test: `apps/server/src/test/java/cw/members/SoloRankIntegrationTest.java`

**Interfaces:**
- Produces: `SoloRankScheduler.tick()`은 `profiles.refreshNextDue()`만 호출한다. `SoloRankService.refreshNextDue()`, `RankSeedPolicy.successCacheSeconds()`, JSON의 `successCacheSeconds`, `SoloRankSnapshot.nextAttemptAt`, `solo_rank_snapshots.next_attempt_at` 열이 사라진다.

- [ ] **Step 1: 시험 수정.** `accountRateLimitDelaysTheMembersNextAttempt`를 지운다. 다음을 추가한다.

```java
@Test void schedulerTickDoesNotLookUpRanks() // new SoloRankScheduler(ranks, profiles).tick() 뒤 verify(gateway, never()).getSoloRank(any())
@Test void snapshotTableHasNoNextAttemptColumn() // information_schema.columns에 solo_rank_snapshots.next_attempt_at 0건
```

- [ ] **Step 2: 실패 확인.** `--tests cw.members.SoloRankIntegrationTest` → 두 시험 FAIL.
- [ ] **Step 3: 구현.** V10에서 `ALTER TABLE solo_rank_snapshots DROP COLUMN next_attempt_at;`. `AccountLinkService`의 병합 SQL에서 `next_attempt_at`을 뺀다. `accountMergeRetainsKnownRankWhenNextLookupFails`가 병합 동작을 계속 확인한다.
- [ ] **Step 4: 통과 확인.** `./apps/server/gradlew -p apps/server test` 전체 → PASS.
- [ ] **Step 5: 커밋.** `refactor: 솔로랭크 백그라운드 조회와 다음 조회 시각 제거`

### Task 5: 초기 포지션 참고 자료 서버·공용 코드 제거

**Files:**
- Create: `apps/server/src/main/resources/db/migrations/V11__drop_role_references.sql`
- Delete: `apps/server/src/main/java/cw/members/{MemberReferenceController,MemberReferenceImporter,ReferenceLinkEntity,ReferenceSampleEntity}.java`, `apps/server/src/main/java/cw/domain/RoleSuggester.java`, `apps/server/src/test/java/cw/domain/RoleSuggesterTest.java`, `apps/server/src/test/java/cw/members/MemberReferenceIntegrationTest.java`, `packages/lcu/src/role-reference.ts`, `packages/lcu/src/role-reference.test.ts`
- Modify: `apps/server/src/test/java/cw/teams/TeamApiIntegrationTest.java`(`importedSoloPositionSampleDoesNotSupplyTeamRecommendationSkill`와 importer 주입 삭제), `packages/contracts/src/index.ts`(`RoleReferenceSample` 삭제), `scripts/web-test-server.mjs:72`(TRUNCATE 목록에서 두 테이블 삭제)

**Interfaces:**
- Produces: `POST /api/admin/member-references`, `GET /api/admin/members/:id/role-suggestion`이 없어진다.

- [ ] **Step 1: 시험 작성.**

```java
// TeamApiIntegrationTest 또는 기존 관리자 API 시험 클래스
@Test void referenceEndpointsAreGone() // 관리자 로그인 후 두 경로 요청 → 404
@Test void referenceTablesAreDropped()  // information_schema.tables에 member_reference_links, role_reference_samples 0건
```

- [ ] **Step 2: 실패 확인.** → FAIL(경로가 아직 존재).
- [ ] **Step 3: 구현.** V11에서 `DROP TABLE role_reference_samples; DROP TABLE member_reference_links;`. 위 파일을 지우고 남은 참조를 정리한다.
- [ ] **Step 4: 통과 확인.** 서버 전체 시험, `pnpm typecheck`, `pnpm test` → PASS.
- [ ] **Step 5: 커밋.** `refactor: 초기 포지션 참고 자료 서버 기능과 저장 테이블 제거`

### Task 6: 웹 화면 변경

**Files:**
- Modify: `apps/web/src/types.ts`, `apps/web/src/features/teams/Recommendation.tsx`, `apps/web/src/features/admin/Members.tsx`
- Test: `tests/web/team-sparse-history.spec.ts`, `tests/web/admin-web.spec.ts`

**Interfaces:**
- Consumes: Task 3 응답의 `rankLookups`.
- Produces: `interface RankLookup { memberId: string; source: "live" | "saved" | "default"; status: string; teamSeed: number; tier: string | null; division: string | null; observedAt: string | null }`, `Recommendation.rankLookups: RankLookup[]`. `Suggestion` 타입 삭제.

- [ ] **Step 1: 시험 작성.** 웹 시험 서버에는 Riot 키가 없으므로 모두 `default`다.

```ts
// team-sparse-history.spec.ts 기존 시험에 추가
expect(result.rankLookups).toHaveLength(10);
expect(result.rankLookups.every((r) => r.source === "default")).toBe(true);
await expect(page.getByText("솔로랭크 반영 · 10명 중 0명 최신 조회")).toBeVisible();
await expect(page.getByText("조회 실패 · 기준값 50 사용")).toHaveCount(10);
// 스크린샷: docs/validation/assets/2026-11-25-teams-rank-lookups.png

// admin-web.spec.ts: 참고 자료 시험("referenceDoesNotOverwriteManual …")을 지우고 추가
test("member editor no longer offers role references", …
  await expect(panel.getByText("초기 포지션 참고 자료")).toHaveCount(0);
```

- [ ] **Step 2: 실패 확인.** `./apps/server/gradlew -p apps/server clean build` 후 `pnpm test:web` → 새 확인 FAIL.
- [ ] **Step 3: 구현.** `Recommendation.tsx`의 추천 결과 아래에 설계 문서의 "솔로랭크 반영" 목록을 둔다. 제목 줄은 `솔로랭크 반영 · 10명 중 {live 수}명 최신 조회`다. 상태 문구는 `live`+등급 있음 `방금 조회`, `live`+등급 없음 `방금 조회 (기준값 50)`, `saved` `조회 실패 · {observedAt 로컬 시각} 조회값 사용`, `default` `조회 실패 · 기준값 50 사용`이다. 티어 이름은 `Members.tsx`의 `tierNames`를 `components/Common`으로 옮겨 함께 쓴다. `Members.tsx`에서 참고 자료 영역과 관련 상태를 지우고, `rankLabel`의 마지막 문구를 `팀 추천 때 조회합니다`로 바꾼다.
- [ ] **Step 4: 통과 확인.** `pnpm typecheck`, `pnpm test`, `pnpm test:web` → PASS.
- [ ] **Step 5: 커밋.** `feat: 팀 추천 화면에 솔로랭크 반영 상태 표시와 참고 자료 화면 제거`

### Task 7: 문서·계약 갱신과 전체 검증

**Files:**
- Modify: `docs/spec.md`, `docs/contracts/api.md`, `docs/contracts/stage3.schema.json`, `docs/development/setup.md`, `docs/status.md`, `docs/ssot.json`, `docs/README.md`(생성)
- Create: `docs/validation/2026-11-25-team-live-solo-rank-report.md`

- [ ] **Step 1: 정본 갱신.** 설계 문서의 "문서" 표대로 고친다. `spec.md`의 "초기 포지션 참고 자료" 절을 지우고, R04에 "팀 추천 요청 때 조회, 4초 상한, 사람별 반영 상태 표시"를 넣는다. `api.md` 팀 추천 행에 `rankLookups`를 추가하고, "공식 기록 참고 자료 가져오기" 절을 지우고, 회원 등급 필드 설명의 갱신 문구를 "마지막 팀 추천 조회 결과"로 고친다. 스키마에 `RankLookup` 정의를 추가하고 `TeamRecommendation.required`에 넣으며 `ReferenceImport`·`RoleReferenceSample`을 지운다.
- [ ] **Step 2: 전체 검증 실행.** `pnpm format:check`, `pnpm format:java:check`, `./apps/server/gradlew -p apps/server clean build`, `pnpm typecheck`, `pnpm test`, `pnpm test:web`. 모두 통과해야 한다.
- [ ] **Step 3: 검증 보고서 작성.** 환경, 실행 명령, 시험 수(무엇을 센 값인지 함께), 화면 이미지, 가상 Riot 응답 검증과 실제 Personal API Key 연동이 미확인인 점, 설계 문서의 한계 항목을 적는다. `ssot.json`에 `historical`·`current: docs/status.md`로 등록한다.
- [ ] **Step 4: 문서 검사.** `pnpm docs:index`, `pnpm test:docs`, `pnpm docs:check` → 통과.
- [ ] **Step 5: 커밋.** `docs: 팀 추천 시점 솔로랭크 조회 정본·계약·검증 기록 갱신`

## 병합 전 확인 (구현 범위 밖, 운영자 작업)

- 운영 DB에서 `select count(*) from member_reference_links; select count(*) from role_reference_samples;`를 실행해 지울 자료가 있는지 확인한다. 자료가 있으면 V11 적용 전에 보관 여부를 사용자가 정한다.
