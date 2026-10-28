# 참가자 등록·게스트·수집기 사용성 개선 구현 계획

> **구현 담당 에이전트:** 작업별 실행에는 `superpowers:executing-plans` 또는 사용자가 선택한 `superpowers:subagent-driven-development`를 적용한다. 아래 체크박스는 당시 작업 정의다. T01–T11의 코드 반영·자동 검사·독립 검토 수정 결과와 남은 실연동 한계는 [실행 보고서](../../validation/2026-10-28-ux-implementation-report.md)를 따른다.

**목표:** 계정 입력과 모임 연결을 줄이고 게스트 이력을 이어 주며, 수집자가 경기 확인·등록·점수 반영 상태를 쉽게 이해하도록 한다.

**구조:** 사람과 게임 계정을 분리한 뒤 서버·수집기의 전달 형식과 인증을 함께 변경한다. 기존 원본·회원 ID·경기 키·확정 포지션을 보존하고, 표시용 제안·통신 관측·계산 상태를 별도 자료로 다룬다. API는 프로그램 간 요청·응답, DTO는 그때 전달하는 자료 구조, DB는 저장용 데이터베이스를 뜻한다.

**기술:** 기존 Java/Spring/PostgreSQL 서버와 Electron/React/TypeScript/SQLite 수집기를 유지한다. 정확한 도구 버전은 [Node 설정](../../../package.json)과 [서버 설정](../../../apps/server/build.gradle)이 정본이다.

**요구사항 정본:** [제품 명세](../../spec.md). 확정 이유·비교·미확인 기술 제안은 [결정 기록](../decisions/2026-10-28-ux-requirements.md). 기록·편집일: 2026-10-28. 작성 당시에는 코드 반영 전 계획이었다. 이후 사용자 요청에 따른 작업별 실행·검증 결과는 [실행 보고서](../../validation/2026-10-28-ux-implementation-report.md)에 연결한다.

## 공통 제약

- R01–R27의 상세 동작을 이 계획에 복사하지 않고 아래 추적표로 연결한다. P01–P07의 환산·갱신·코드·공개 표시 방식은 계획자 제안이며 사용자 확정 수치로 바꾸어 기록하지 않는다.
- 전체 경기는 10명·팀당 5명, 등록 인원 하한은 6명이다. 후보 판정과 사람의 등록 확정은 별개다.
- 표시 항목 축소가 원본 수집 축소로 이어지면 안 된다. 계정 키·토큰·원본은 렌더러와 공개 DTO에 불필요하게 노출하지 않는다.
- 기존 경기별 점수 가중치·목표물 지표·정규화 공식은 유지한다. 게스트를 구분하기 위한 참가자 키·누적 모집단·팀 편성 입력만 필요한 범위로 수정한다.
- 과거 경기·회원 ID·원본 JSON·등록 취소·수동 확정 포지션·미완료 전송 요청은 보존한다. 사용자 확인 없이 모임 전체 기록을 공개하거나 계정 간 대기를 옮기지 않는다.
- [현재 제외 범위](../../status.md#범위-제외와-미확인-사실)의 Windows 업데이트·인증 손상 복구·옛 조회 실험·친구 목록 조회를 새 완료 조건으로 되살리지 않는다.
- 계획 작성 단계에서는 제품 코드·설치판·운영 DB를 바꾸지 않았다. 이후 코드 반영은 격리 작업 공간에서 진행하고 운영 적용은 별도 요청 범위로 유지한다.

## 요구사항 추적표

| 요구사항 | 상세 정본 | 구현 작업 |
| --- | --- | --- |
| R01–R03: 계정 입력·연결·수동 실력 제거 | [참가자 관리](../../spec.md#참가자와-포지션-관리) | T01, T02, T04 |
| R04: 등급 자동 참고·공통 시작·기록 보정 | [실력 보정](../../spec.md#포지션별-실력-보정) | T04 |
| R05–R06: 후보 하한·사람의 확정 | [대상 경기](../../spec.md#제품-범위와-사용자), [확인 화면](../../spec.md#수집기-경기-확인-화면) | T03, T06, T07 |
| R07–R08: 게스트·소급 연결 | [게스트 규칙](../../spec.md#게스트-기록과-정식-등록) | T01–T03, T11 |
| R09–R11: 관리자·공통 코드·전체 기기 해제 | [인증](../../spec.md#인증과-개인정보) | T05, T06 |
| R12–R15: 제안·미지정·게스트·초안 보존 | [포지션 제안](../../spec.md#수집기-경기-확인-화면) | T07 |
| R16–R20: 챔피언·행 간소화·수집 보존 | [확인 화면](../../spec.md#수집기-경기-확인-화면) | T08 |
| R21: 전송·확인·재시도 관측 | [진행 안내](../../spec.md#전송등록계산-진행-안내) | T09 |
| R22–R24: 계산 단계·실패·연결 불가 | [계산 안내](../../spec.md#전송등록계산-진행-안내) | T09 |
| R25–R27: 필터·정렬·용어 | [목록·문구](../../spec.md#수집기-목록과-용어) | T10 |

## 검토에서 특히 볼 다섯 상황

1. **과거 이름 재사용·공식/LCU 키 불일치:** 자동 연결이 다른 사람의 과거 경기까지 합치지 않아야 한다. T02의 `rejectsStaleNameOnlyLink`로 확인한다.
2. **회원 연결과 경기 확인의 동시 실행:** 한 경기가 복제되거나 계정 일부만 소급 연결되지 않아야 한다. T03의 `promotionRacingConfirmationCountsOnce`로 고정한다.
3. **해제 직전 시작한 쓰기 요청:** 이전 공통 코드 세대가 저장 직전에 폐기되면 쓰기를 허용하지 않는다. T05의 `rotationBeforeWriteRejectsOldGeneration`을 둔다.
4. **계산 완료 직후 더 최신 입력 발생:** 오래된 성공 작업을 현재 반영 완료로 표시하지 않는다. T09의 `olderSuccessIsNotCurrentReady`로 확인한다.
5. **초안 보유·이미지 오프라인·재시도 대기 중 상태 필터:** 재조회로 초안이 사라지거나, 이미지 오류로 등록이 막히거나, 상태 이동 뒤 화면이 잘못 남지 않아야 한다. T07·T08·T10에 해당 회귀 검사를 둔다.

## 작업 순서와 경계

권고 순서는 T01 → T02 → T03 → T04 → T05 → T06 → T07 → T08 → T09 → T10 → T11이다. 게스트·계정·인증은 같은 자료 계약을 공유하므로 독립된 제품처럼 따로 배포하지 않는다. 자산 표시와 목록 UI는 계약이 고정된 뒤 별도 검토할 수 있다. 각 작업은 관련 실패 검사를 먼저 추가하고 최소 구현 후 그 검사로 확인한다. 아래 커밋 제목은 실제 구현 시 사용할 제안이다.

### Task 1: T01 — 계정·게스트 기반과 전달 형식 준비

**파일:** 새 `apps/server/src/main/java/cw/accounts/PlayerAccountEntity.java`, `PlayerAccountRepository.java`, `apps/server/src/main/resources/db/migrations/V5__player_accounts.sql`; 수정 `members/MemberEntity.java`, `matches/MatchParticipantEntity.java`, `contracts/MemberContracts.java`, `contracts/MatchContracts.java`, `contracts/EvaluationContracts.java`(모두 서버 `cw/` 아래), `packages/contracts/src/index.ts`, `decode.ts`, `docs/contracts/stage3.schema.json`, `docs/contracts/api.md`, `apps/server/src/test/java/cw/support/DatabaseTestSupport.java`; 새 `apps/server/src/test/java/cw/accounts/PlayerAccountMigrationIntegrationTest.java`.

**접점:** `PlayerAccount(id, lcuPuuid?, officialPuuid?, riotId, linkStatus)`를 정의한다. `members.account_id`와 경기 참가자의 `player_id`를 외래키로 추가하고 회원 연결은 조회 시 도출한다. 과도기에는 두 새 열의 null을 허용해 기존 생성 코드가 동작하게 하며, T11의 V8에서 최종 필수 제약을 건다. 기존 `members.puuid`와 기존 참가 행은 같은 계정으로 한 번만 옮긴다. 기존 `member_id`는 전환 중 호환 자료로 유지하되 계정 연결이 정본이 된다. 새 평가 참가자·경기 점수는 `playerId:string`과 `memberId:string|null`을 분리한다. `EvaluationContracts`와 양쪽 디코더에는 새 V2 자료형을 병행 추가해 기존 생성자·소비자가 컴파일되게 하고, T03에서 평가 소비자, T06에서 수집기 소비자를 전환한다. 개인 누적·팀 좌석은 기존 회원 ID를 유지한다.

- [ ] 기존 DB를 만드는 시험에 `backfillKeepsMemberAndMatchKeys`를 추가한다. 회원·경기 수, 원본·확정 역할·취소 상태가 전환 전과 같고 새 계정 중복이 없음을 검사한다. 두 게스트의 `playerId`가 달라야 하며 `memberId` null을 허용하는 계약 검사도 추가한다.
- [ ] `./apps/server/gradlew -p apps/server test --tests 'cw.accounts.PlayerAccountMigrationIntegrationTest'`로 새 필드·전환이 없는 실패를 확인한다.
- [ ] 기존 Flyway 파일은 수정하지 않고 V5를 추가한다. 계정 연결 증거용 `account_identity_evidence` 테이블도 V5에서 준비한다. 고유 제약·전환·이전 계산 세대 무효화·재계산 요청을 한 번 수행한다. 보관한 옛 계산 JSON은 수정하지 않는다. 새 코드가 만드는 계정은 회원이 없어도 경기 참가자가 될 수 있게 한다.
- [ ] TypeScript 디코더·Java DTO·JSON 스키마·시험 자료를 맞춘다. 수집기 전용 전달 계약은 `X-CW-Collector-Protocol: 2`로 식별한다. 원본 정규화의 `schemaVersion:1`과 별개라는 점을 계약에 적고, 이전 버전의 실제 차단은 T06 전환에서 수행한다.
- [ ] 위 전환 검사, `cw.contracts.Stage3ContractIntegrationTest`, `pnpm typecheck`를 실행해 성공을 확인한다. 커밋 제안: `refactor: 참가자와 게임 계정 식별 구조 분리`.

### Task 2: T02 — Riot ID만 입력하는 참가자 등록과 계정 연결

**파일:** 새 서버 `cw/accounts/AccountIdentityResolver.java`, `AccountLinkService.java`, `AccountLinkEntity.java`, `cw/riot/RiotGateway.java`, `HttpRiotGateway.java`, `cw/contracts/AccountContracts.java`; 수정 `members/MemberService.java`, `MemberController.java`, `MemberReferenceImporter.java`, `MemberReferenceController.java`, 수집기 `main/lcu-client.ts`, `server-api.ts`, 웹 `features/admin/Members.tsx`, `types.ts`; 새 서버 시험 `cw/accounts/AccountLinkIntegrationTest.java`와 `tests/web/member-registration.spec.ts`.

**접점:** `AccountContracts`에 `RiotId`, `OfficialAccount`, `IdentityEvidence`, `LinkResult`를 정의하고 `RiotGateway.resolveAccount(RiotId): OfficialAccount`, `AccountIdentityResolver.resolve(IdentityEvidence): LinkResult(verified|pending|conflict, playerId?)`, `AccountLinkService.link(memberId, evidence): Member`를 둔다. `IdentityEvidence`는 출처·관측 시각·전체 Riot ID·LCU PUUID·별도 공식 PUUID를 담는 비공개 자료다. 링크 실패를 이름 일치로 덮어쓰지 않는다. 관리자 생성 입력은 `{riotId, primaryRole?, secondaryRole?, allowedRoles?, active?}`만 받는다.

- [ ] 먼저 P01의 기술 확인을 수행해 현재 지원되는 LCU 읽기 경로 또는 기존 원본 근거, 이름 변경·타인 계정의 입출력을 기록한다. 확인되지 않은 URL·식별값 동등성을 코드에 넣지 않는다. 이 연결 경로가 확인되지 않으면 자동 연결 완료를 주장하지 않고 나머지 독립 작업을 진행한다. 모든 참가자 설치·PUUID 입력으로 목표를 바꾸지 않는다.
- [ ] `rejectsStaleNameOnlyLink`, `differentOfficialAndLcuKeysCanLinkWithEvidence`, `renameKeepsHistory`, `duplicateEvidenceIsIdempotent` 시험을 작성한다. 예외 입력의 결과는 `conflict` 또는 `pending`, 기존 연결과 집계는 유지돼야 한다. 요청자가 보낸 공식 PUUID는 서버의 공식 조회·보관 근거로 검증하고 그대로 신뢰하지 않는다.
- [ ] `./apps/server/gradlew -p apps/server test --tests 'cw.accounts.AccountLinkIntegrationTest'`로 실패를 확인한 뒤, 검증된 관측의 연결과 같은 계정의 고유 제약을 구현한다. 증거의 원문·PUUID를 공개 응답·일반 로그로 내보내지 않는다.
- [ ] 표시 이름은 P01 기본을 자동 생성하고 수동 이름·PUUID 입력을 제거한다. 일시 조회 장애 때는 저장된 ‘계정 연결 확인 중’ 프로필을 반환한다. 계정이 실제로 없다는 확정 응답은 오류로 알린다. 미연결 계정을 등록 인원으로 세지 않는다. 역할을 아직 고르지 않아도 프로필 생성은 가능하고 팀 추천에는 기존 역할 검증을 적용한다.
- [ ] 위 서버 시험과 `pnpm test:web -- tests/web/member-registration.spec.ts`에서 Riot ID 단일 입력, 오류·보류 표시, 비활성 의미 분리(P07)를 확인한다. 실제 Riot 호출은 가상 응답 검사와 구분해 기록한다. 커밋 제안: `feat: Riot ID로 참가자 등록과 계정 연결 지원`.

### Task 3: T03 — 게스트 경기 수집·소급 연결·평가

**파일:** 수정 서버 `matches/IngestService.java`, `MatchViews.java`, `CollectorMatchQuery.java`, `PublicMatchQuery.java`, `RegistrationService.java`, `MatchSpecifications.java`, `evaluation/EvaluationSnapshot.java`, `domain/ScoringService.java`, `MemberAggregator.java`, T02 `AccountLinkService.java`; 웹 `features/matches/Detail.tsx`, `List.tsx`, `features/members/Profile.tsx`; 추가 시험 `cw/matches/GuestMatchIntegrationTest.java`, `cw/members/GuestPromotionIntegrationTest.java`, 수정 `cw/domain/ScoringServiceTest.java`, `MemberAggregatorTest.java`, `tests/web/public-web.spec.ts`.

**접점:** 새 서버 `cw/matches/RegisteredParticipantPolicy.java`의 `countLinkedMembers(NormalizedMatch match): int`, `GuestPromotionService.promote(playerId, memberId): PromotionResult`를 새 `cw/members/GuestPromotionService.java`로 분리한다. 계산 상대·경기 순위 키는 `playerId`, 누적과 개인 링크 키는 null이 아닌 회원 ID다.

- [ ] `sixKnownFourGuestsCreatesPending`, `fiveKnownRejected`, `inactiveMemberStillCountsAsRegistered`, `promotionRacingConfirmationCountsOnce`, `canceledHistoryNeverReturns`, `guestDoesNotEnterCumulativeMean`을 추가한다. 6+4 경기의 원본 참가자·경기 점수는 각각 10개, 회원 누적 행은 6개여야 한다. 정식 전환을 두 번 호출해도 경기 행·경기 수·변경 작업은 한 번만 늘어야 한다.
- [ ] `./apps/server/gradlew -p apps/server test --tests 'cw.matches.GuestMatchIntegrationTest' --tests 'cw.members.GuestPromotionIntegrationTest'`로 현재 10명 등록 요구의 실패를 확인한다.
- [ ] 최초 수집 시 모든 계정 행과 등록 인원을 검사하고, 미등록자를 가짜 회원으로 생성하지 않는다. 게스트 전환은 고유 연결·소급 조회·변경 번호·재계산·감사 기록을 같은 트랜잭션에 반영한다. 새 임시 저장만으로 점수 재계산을 만들지 않는다.
- [ ] 경기별 점수의 상대 조회·동점 순위는 회원 null을 비교하지 않고 계정 키를 사용한다. 개인·랭킹·누적 평균은 P02의 회원 모집단으로 제한한다. 공개 게스트는 회원 링크가 없으며 개인 번호·계정 키를 PUUID 대용으로 노출하지 않는다. 등록 후 같은 사람의 기존 카드가 회원 정보로 연결돼야 한다.
- [ ] 이름 변경·정식 전환 후 공개 DTO의 `playerId`가 같은 계정을 가리키고 과거 개인 링크가 이어지는지도 확인한다. 위 시험과 기존 등록·동시성·재전송·정정·취소 검사, `pnpm test:web -- tests/web/public-web.spec.ts`를 통과시킨다. 커밋 제안: `feat: 게스트 내전 기록과 정식 참가자 소급 집계 지원`.

### Task 4: T04 — 자동 등급 시작값과 내전 보정

**파일:** 새 서버 `cw/riot/SoloRankSnapshot.java`, `SoloRankService.java`, `cw/domain/RankSeedPolicy.java`, `resources/policies/rank-seed-v1.json`, `resources/db/migrations/V6__solo_rank_snapshots.sql`; 수정 `RiotGateway.java`, `members/MemberService.java`, `contracts/MemberContracts.java`, `domain/RoleSkillCalculator.java`, `evaluation/EvaluationSnapshot.java`, 웹 `Members.tsx`, `components/Common.tsx`; 새 시험 `cw/domain/RankSeedPolicyTest.java`, `RoleSkillCalculatorTest.java`, `cw/members/SoloRankIntegrationTest.java`.

**접점:** `SoloRankLookup`과 `RankSeedSnapshot`은 `AccountContracts`에 추가한다. `RiotGateway.getSoloRank(officialPuuid): SoloRankLookup(ranked|unranked|unavailable, tier?, division?, observedAt)`, `SoloRankService.refresh(memberId): RankSeedSnapshot`, `RankSeedPolicy.toSeed(SoloRankLookup snapshot): double`를 쓴다. 정책 수치의 구현 후 정본은 `rank-seed-v1.json`으로 옮기고 P04에는 당시 제안과 실제 채택 정책 링크를 남긴다.

- [ ] P04 환산 제안을 기준으로 `unrankedStartsAtMidpoint`, `tierOrderIsMonotone`, `failedRefreshKeepsLastSuccess`, `fiveGamesMixesPriorAndHistory`, `manualLegacySeedDoesNotAffectNewCalculation`을 추가한다. 시작값만 다른 입력이 공개 경기 점수·누적 점수를 바꾸지 않는 검사도 둔다.
- [ ] `./apps/server/gradlew -p apps/server test --tests 'cw.domain.RankSeedPolicyTest' --tests 'cw.domain.RoleSkillCalculatorTest' --tests 'cw.members.SoloRankIntegrationTest'`로 실패를 확인한다.
- [ ] 서버의 공식 Account/League 조회 어댑터를 연결하고 승인된 키를 환경 비밀값으로 주입한다. 배포 키의 실제 조회 가능 여부는 별도 근거로 확인한다. 제한 응답의 재시도 시각을 존중하고 가상 등급을 실제 응답으로 저장하지 않는다.
- [ ] 정상 등급·등급 없음·실패·오래된 마지막 자료를 구분해 저장한다. 등급 갱신이 실제 계산 입력을 바꿀 때만 변경 번호와 계산 작업을 만든다. P04의 비차단 갱신과 기존 보정 강도를 적용하고 과거 `seed_skill`은 감사용 보존으로 전환한다. 관리자 입력과 화면의 수동 실력 안내를 제거한다.
- [ ] 위 검사·팀 추천 회귀·가상 404/429/5xx 검사를 통과시킨다. 공식 키 실연동이 없으면 그 부분을 미검증으로 기록한다. 커밋 제안: `feat: 솔로랭크 등급과 내전 기록으로 팀 편성 기준 산출`.

### Task 5: T05 — 숫자 관리자 코드·모임 코드·모든 수집기 해제

**파일:** 새 서버 `cw/auth/GroupCollectorCode.java`, `GroupCodeService.java`, `resources/db/migrations/V7__group_collector_auth.sql`; 수정 `auth/AuthService.java`, `AuthController.java`, `ApiSecurityFilter.java`, `AuthRateLimiter.java`, `CollectorCredential.java`, `cli/AdminCodeCommand.java`, 웹 `features/admin/Codes.tsx`, `Login.tsx`; 새 시험 `cw/auth/GroupCodeIntegrationTest.java`, 수정 기존 `AuthMembersIntegrationTest.java`, `LocalRecoveryIntegrationTest.java`.

**접점:** `GroupCodeService.issue(): IssuedGroupCode`, `rotate(): IssuedGroupCode`, `delete(): void`, `requireCurrentGeneration(CollectorPrincipal): void`. 관리자 경로는 `GET/POST/DELETE /api/admin/collector-code`와 `POST /api/admin/collector-code/rotate`; 기존 개인별 collector 코드 발급 요청은 제거한다. 공통 코드 행은 단일 모임·활성 하나·세대 번호를 가진다.

- [ ] `adminCodeHasSixDigitsIncludingLeadingZero`, `deviceTokensRemainLong`, `multipleDevicesUseSameGroupCode`, `rotationBeforeWriteRejectsOldGeneration`, `deleteRevokesAllDevices`, `guessLimitSurvivesRestart`를 추가한다. 서로 다른 참가자의 정상 연결이 같은 공통 코드를 소비하지 않아야 한다.
- [ ] `./apps/server/gradlew -p apps/server test --tests 'cw.auth.GroupCodeIntegrationTest' --tests 'cw.auth.LocalRecoveryIntegrationTest'`로 현재 개인 코드 방식의 실패를 확인한다.
- [ ] P03의 생성·반복 사용·해시·코드 세대와 해제를 구현한다. 코드 교체·삭제·동시 연결의 순서를 서비스 잠금과 DB 고유 제약으로 지킨다. 쓰기는 서비스 변경 잠금 후에 세대를 재검증한다. 인증 확인과 실제 저장 사이의 해제 경쟁을 시험에 넣는다.
- [ ] 관리자 짧은 코드의 입력 제한은 별도 지속 저장하고 복구 CLI도 새 형식을 쓰게 한다. 관리자 쿠키·요청 위조 방지·세션 만료와 로컬 복구는 유지한다. 6자리로 바꾸는 대상과 공통 코드·기기 토큰을 혼동하지 않는다.
- [ ] 코드 화면의 참가자 선택과 개인 코드 목록을 공통 코드 관리로 교체한다. 삭제·재발급 전에 모든 수집기가 해제된다는 영향을 안내한다. 위 검사와 `pnpm test:web -- tests/web/admin-web.spec.ts`를 통과시킨다. 커밋 제안: `feat: 모임 공통 연결 코드와 6자리 관리자 코드 지원`.

### Task 6: T06 — 새 수집 계약·인증 재연결·로컬 자료 보존

**파일:** 수정 수집기 `main/server-api.ts`, `credential-store.ts`, `history-sync.ts`, `outbox.ts`, `outbox-migrations.ts`, `ipc.ts`, `main.ts`, `preload/collector-api.ts`, `preload/index.ts`, 서버 `auth/ApiSecurityFilter.java`; 시험 `main/outbox.test.ts`, `history-sync.test.ts`, `server-api.test.ts`, `tests/web/cross-stage.spec.ts`.

**접점:** 새 연결은 `{protocolVersion:2, code, currentAccount:{puuid,riotId,observedAt}}`로 요청하고 기존 회원·계정·기기 토큰 및 `codeGeneration`을 반환한다. 공식 계정 식별자는 서버가 조회해 연결 증거를 완성한다. 로컬 DB는 순차 전환 방식으로 `user_version`을 올린다. `Outbox.resumeVerified(principal)`은 원래 회원·계정을 유지하고 기기 인증의 승인된 교체만 기록한다.

- [ ] 이전 로컬 DB와 암호화 저장소를 여는 `rotationKeepsQueuedPayloadAndDraft`, `resumeRequiresSameAccount`, `collectorProtocolOneGetsUpdateRequired`를 추가한다. 재연결 전후 원본 문자열·경기 키·등록 요청 식별자·초안이 같고 다른 계정의 전송은 거절돼야 한다.
- [ ] `pnpm exec vitest run apps/collector/src/main/outbox.test.ts apps/collector/src/main/history-sync.test.ts apps/collector/src/main/server-api.test.ts`로 실패를 확인한다.
- [ ] 저장소를 삭제·초기화하지 않고 새 선택 필드와 관측을 전환한다. 예전 인증은 연결 해제를 표시하고 새 코드 입력을 안내한다. 재연결 후 T05 세대와 T02 계정을 확인해 기존 명시적 요청만 이어 보낸다. 조회만 한 경기는 자동 확정하지 않는다.
- [ ] 서버는 새 계약을 지원한 뒤 구형 수집기의 쓰기에 426 `COLLECTOR_UPDATE_REQUIRED`를 응답한다. 새 수집기는 일반 오류 대신 업데이트 필요를 알린다. 구형 개인 코드를 계속 허용하는 제품 우회는 남기지 않는다. 관리자 기존 세션은 공통 코드 전환으로 해제하지 않는다.
- [ ] 위 검사·교차 단계 실제 HTTP 검사·토큰 렌더러 미노출 회귀를 통과시킨다. 이 자동 전환 검사는 제외된 실제 Windows 버전 업데이트 시험을 다시 요구하는 것이 아니다. 커밋 제안: `feat: 공통 코드 재연결 시 저장된 경기 요청 보존`.

### Task 7: T07 — 근거 있는 포지션 기본값과 수동 초안 우선

**파일:** 새 `packages/lcu/src/role-hints.ts`, `role-hints.test.ts`; 수정 서버 `cw/lcu/MatchNormalizer.java` 또는 새 `MatchRoleHints.java`, `matches/MatchViews.java`, 양쪽 계약·디코더, 수집기 `main/history-sync.ts`, `outbox.ts`, `renderer/MatchReview.tsx`; 시험 `cw/lcu/ContractCompatibilityTest.java`, `main/history-sync.test.ts`, `tests/e2e/collector.spec.ts`.

**접점:** `suggestMatchRoles(evidence: MatchRoleEvidence): RoleSuggestion[]`가 `{puuid, role:Role|null, source, reason}`을 반환한다. `MatchRoleEvidence`는 팀과 참가자별 선택적 경기 힌트, 과거 확정 역할·프로필 보조 자료다. 정규화 원본 필수 수치와 별개로 전달한다. 우선순위는 서버 확정값 → 저장된 사람 초안 → 새 제안이다.

- [ ] `clearLaneRolePrefills`, `ambiguousBottomRemainsUnselected`, `duplicateRoleCandidatesRemainUnselected`, `guestsUseSameEvidenceRules`, `manualDraftSurvivesRefreshAndRestart`를 작성한다. `null` 제안은 ‘직접 선택’이고 힌트가 없는 G1–G3 축소 자료도 유효 경기로 남아야 한다.
- [ ] `pnpm exec vitest run packages/lcu/src/role-hints.test.ts apps/collector/src/main/history-sync.test.ts`와 서버 호환 검사에서 실패를 확인한다.
- [ ] P05의 보수적인 근거 규칙을 구현한다. 수집·다시 불러오기 양쪽에서 같은 제안을 재현하고, 제안 출처와 수동 편집 여부를 보존한다. 추정하기 어려운 열 명에게 임의 역할을 강제로 채우지 않는다.
- [ ] Electron 화면에서 제안·직접 선택·수정·재실행·각 팀 역할 중복·최종 확인을 검사한다. 자동 제안만으로 등록됐다고 표시하지 않는다. 커밋 제안: `feat: 경기 포지션을 근거에 따라 미리 제안`.

### Task 8: T08 — 챔피언 이름·초상화와 간결한 참가자 행

**파일:** 새 `packages/game-assets/catalog.json`, `packages/game-assets/champions/`, 수집기 `renderer/ChampionPortrait.tsx`; 수정 기존 서버 `resources/assets/catalog.json`을 공유 원본에서 생성하는 빌드, `scripts/build-collector.mjs`, `apps/server/build.gradle`, 웹 `components/ChampionItemIcon.tsx`, 수집기 `renderer/MatchReview.tsx`, `styles.css`, `index.html`; 검증은 `tests/e2e/collector.spec.ts`와 빌드 자산 검사에 추가한다.

**접점:** `ChampionPortrait({championId:number})`와 `getChampionLabel(id):string`이 공유 한국어 자산을 사용한다. 패키지 의존성을 새로 도입하기보다 기존 정적 빌드 경로로 이름·초상화를 복사한다. 생성된 서버 자산과 원본의 책임을 문서·생성 스크립트로 구분한다.

- [ ] 기존 `main/history-sync.test.ts`에 `compactUiKeepsFullIngestPayload`를 추가해 모든 원본 통계·아이템이 전송 자료에 남는지 먼저 확인한다. 실제 Electron 화면에 챔피언 67의 한국어 이름, 참가자 옆 이미지, K/D/A·역할만 보이는 검사를 먼저 추가한다. `offlinePortraitFallbackKeepsNameAndConfirm`에서 이미지 오류를 주입해 이름·확인 버튼이 유지되고 ‘기록 보기’와 상세 수치가 없는지 검사한다.
- [ ] `pnpm build` 후 `pnpm test:e2e -- --grep 'champion|Portrait|compact'`로 기존 번호 표시의 실패를 확인한다. 새 검사 이름에 이 키워드를 사용한다.
- [ ] P06 로컬 자산 안을 적용하고 수집기의 원격 스크립트·일반 네트워크 접근을 넓히지 않는다. 알 수 없는 새 ID에는 명세의 예외 표시를 쓴다. 원본·전송 payload·서버 점수 입력은 그대로 보존한다.
- [ ] 빌드한 설치용 자산에도 이름·이미지가 포함되는지 확인한다. 공개 웹의 상세 기록과 기존 아이콘 동작 회귀도 검사하고 결과 화면을 남긴다. 커밋 제안: `feat: 수집기에 챔피언 이름과 초상화 표시`.

### Task 9: T09 — 전송 관측과 등록 후 계산 상태 조회

**파일:** 새 서버 `cw/evaluation/CollectorProgressController.java`, `CollectorProgressQuery.java`; 수정 `EvaluationRepository.java`, `GenerationPublisher.java`, `RecalculationWorker.java`(진행 관측이 필요한 범위), `matches/MatchViews.java`, 수집기 `main/uploader.ts`, `server-api.ts`, `history-sync.ts`, `outbox.ts`, `outbox-migrations.ts`, `preload/collector-api.ts`; 새 화면 `renderer/MatchProgress.tsx`; 새 시험 `cw/evaluation/CollectorProgressIntegrationTest.java`, `main/progress.test.ts`와 기존 Electron·교차 단계 시험.

**접점:** `POST /api/collector/progress` 입력 `{matchKeys:string[]}`는 한 번에 100개까지, 응답은 권한을 확인한 경기별 `{matchKey, registrationState, evaluation:{status:queued|running|ready|failed|unknown, targetRevision, scoringVersion, observedAt}, registeredRevision}`다. 다른 경기의 존재·관리자 오류 원문을 노출하지 않는다. 수집기 관측 `TransferProgress`는 `{phase:queued|sending|checking|retry_wait|action_required|done, attempt, lastAttemptAt?, nextRetryAt?, errorCode?}`이며 인증 비밀값이 없다.

- [ ] `olderSuccessIsNotCurrentReady`, `calculationFailureKeepsRegistered`, `offlineIsUnknownNotFailed`, `progressRequiresParticipant`, `workerDisappearedIsNotForeverRunning`을 작성한다. 등록 직후 최신 작업의 대기→실행→게시와 실패를 실제 DB에서 만들고, 더 오래된 성공 작업이 있어도 `ready`가 아니어야 한다.
- [ ] `./apps/server/gradlew -p apps/server test --tests 'cw.evaluation.CollectorProgressIntegrationTest'`와 `pnpm exec vitest run apps/collector/src/main/progress.test.ts`로 실패를 확인한다.
- [ ] 현재 입력 변경 번호·원하는 계산 버전·공개된 결과 세대를 함께 비교한다. 실행 작업은 작업자 생존 근거도 확인하며, 잠금 소유 작업자가 없으면 확인 불가로 처리한다. 계산이 끝난 입력이 낡았으면 최신 작업을 따라간다. 재시도는 기존 운영자 권한을 유지한다.
- [ ] 업로더의 실제 요청 앞뒤에 단계를 기록한다. 응답 유실은 서버 상태 재조회로 복구하고, 재시도 카운트다운은 저장한 다음 시각에서 계산한다. 가짜 진행률·완료 예상 시간을 만들지 않는다. 로컬 화면 조회와 배경 상태 조회를 분리해 서버가 느려도 UI가 먼저 나온다.
- [ ] 상태 조회는 실행 중 한 묶음만 보내고 기본 5초 간격으로 갱신한다. 오류 후에는 기존 재시도 상한을 재사용해 간격을 늘린다. 마지막 관측은 따로 보존한다. 서버 접근 해제 시 조회도 멈추고 재연결을 안내한다. 등록 완료 목록은 계산 실패 때문에 되돌리지 않는다.
- [ ] 실제 HTTP 응답 유실·느린 응답·429·5xx와 가상 연결 단절 화면을 구분해 확인한다. 계산 상태는 경기 단위 안내로 표시하며 참가자별 행에 점수 칸을 추가하지 않는다. 커밋 제안: `feat: 전송과 점수 반영 진행 상황 안내`.

### Task 10: T10 — 전체·상태별 목록과 쉬운 용어

**파일:** 새 수집기 `renderer/match-list-model.ts`, `match-list-model.test.ts`; 수정 `App.tsx`, `OutboxView.tsx`, `MatchList.tsx`, `AccountView.tsx`, `MatchReview.tsx`, `messages.ts`, `styles.css`, `preload/collector-api.ts`; 시험 `tests/e2e/collector.spec.ts`.

**접점:** 화면 상태를 내부 값 `upload_pending|review_pending|registering|registered|canceled|action_required`로 분리하고, 한국어 표시는 정본 R27 문구 표에서 구현한다. `selectMatches(matches, filter:'all'|DisplayState): MatchView[]`, `countMatchesByState(matches): Record<DisplayState,number>`를 쓴다. 계산 보조 상태는 주 필터 값을 바꾸지 않는다.

- [ ] `filtersAllSixStates`, `sortsByMatchStartNotLocalUpdate`, `statusChangeUpdatesCountWithoutChangingSelectedTab`, `emptyMessageMatchesSelectedFilter`를 작성한다. 오래된 경기의 최근 전송 갱신이 순서를 올리지 않아야 하며, 같은 시각의 순서는 경기 키로 고정돼야 한다.
- [ ] `pnpm exec vitest run apps/collector/src/renderer/match-list-model.test.ts`로 실패를 확인한다.
- [ ] 초기 선택 전체·선택 강조·상태별 건수·경기 시작 순서를 적용한다. 선택 목록에서 빠진 등록 성공 경기는 완료 안내로 알린다. 키보드로도 필터를 선택할 수 있게 한다.
- [ ] 정본의 일곱 문구를 버튼·도움말·오류에 반영한다. 두 불러오기 버튼의 자료 출처를 구분한다. ‘멈춘 전송 이어 보내기’는 인증 복구 후 같은 계정 요청을 이어 보낸다는 의미를 유지하고 모든 오류를 무조건 재전송하지 않는다. 개발용 상태·내부 식별자 노출도 점검한다.
- [ ] 여섯 상태·전체의 실제 화면, 상태 이동·0건·서버 단절·필터 선택 보존을 Electron에서 확인하고 결과 이미지를 남긴다. 커밋 제안: `feat: 수집기 상태별 목록과 쉬운 안내 문구 적용`.

### Task 11: T11 — 통합 검증·안전한 적용 절차·문서 일치

**파일:** 새 서버 `apps/server/src/main/resources/db/migrations/V8__require_player_links.sql`; 수정 `tests/web/cross-stage.spec.ts`, `public-web.spec.ts`, `admin-web.spec.ts`, `tests/e2e/collector.spec.ts`, `scripts/web-test-server.mjs`, 수집기 `main/fixture.ts`, `docs/contracts/api.md`, `docs/spec.md`, `docs/status.md`, `docs/runbooks/collector-install.md`, `collector-acceptance.md`, `home-server.md`, `docs/development/setup.md`, `docs/ssot.json`; 새 실행 보고서와 화면 이미지는 완료 시 등록한다.

- [ ] 전체 흐름 검사를 작성한다. 기존 회원·등록 경기·취소 경기·대기 요청을 가진 DB에서 전환 → 공통 코드로 두 기기 연결 → 6명+4게스트 수집 → 일부 역할 제안·수정 → 명시적 등록 → 계산 반영 → 게스트 정식 전환 → 소급 집계 → 코드 재발급으로 두 기기 해제 → 같은 계정 재연결·대기 보존을 검증한다.
- [ ] 시험은 격리 PostgreSQL과 실제 HTTP/Electron·브라우저를 사용한다. LCU·Riot 가상 응답은 실제 연동 성공으로 세지 않는다. P01 자동 연결과 등급 직접 조회의 실제 가능 여부는 각각 근거를 남긴다. 지원 근거가 없으면 전체 기능 검증 완료라고 쓰지 않는다.
- [ ] 다음 명령을 순서대로 실행한다. `pnpm typecheck`, `pnpm test`, `pnpm build`, 테스트 DB 준비 후 `./apps/server/gradlew -p apps/server clean build`, `pnpm test:web`, `pnpm test:e2e`, `pnpm test:probe`, `pnpm format:check`, `pnpm format:java:check`, `pnpm test:collector-release`. DB 준비·도구 환경은 [개발 안내](../../development/setup.md)를 따른다. 실패를 건너뛰거나 기존 Windows 제외 시험을 새 필수 단계로 추가하지 않는다.
- [ ] V8에서 남은 기존 행을 재대조해 계정 연결 누락이 없을 때만 회원·참가자의 새 외래키를 필수화한다. 여러 버전의 전환 파일을 함께 적용한 DB와 빈 DB 양쪽을 검사한다. 실제 적용 전에 서버 DB와 수집기 폴더를 각각 백업하고, 복사한 DB·로컬 자료에서 전환을 확인한다. 기존 코드를 운영 DB에 역실행하는 방식 대신 백업으로 되돌리는 절차를 문서화한다. 실행 버전·프로토콜·자료 버전을 함께 기록한다.
- [ ] 배포 전에는 진행 중 쓰기를 멈추고 새 서버→새 수집기 순으로 적용한다. 전환 시 기존 개인별 가입 코드와 구형 수집 자격을 폐기하고 운영자가 최초 모임 코드를 발급한다. 관리자 세션·등록 경기·소유자별 대기 자료는 보존한다. 운영 배포 자체는 사용자가 요청한 때 수행하며 이 계획 작성의 완료 조건에 포함하지 않는다.
- [ ] 정본·현재 계약·실제 변경 파일·보고서·설치 안내를 대조하고 과거 기록은 당시 근거로 남긴다. 화면 변화는 이미지로 연결한다. `pnpm docs:index`, `pnpm test:docs`, `pnpm docs:check`를 통과시킨다. 커밋 제안: `test: 새 참가자 등록과 수집 흐름의 통합 검증 추가`.

## 완료 판단과 남는 한계

제품 구현 완료는 추적표의 모든 요구사항이 코드·자료 전환·검증 근거에 연결될 때 판단한다. 단위 검사 통과만으로 계정 자동 연결·Riot 실연동·운영 적용까지 완료됐다고 하지 않는다. 필수 자동 검증, 기능별 실제 연동 근거, 현재 범위에서 남는 미확인을 실행 보고서에 분리한다.

이번 계획 작성의 산출물은 정본 요구사항 정리, 결정 출처·제안 분리, 이 실행 순서와 [문서 검토 보고서](../../validation/2026-10-28-ux-planning-report.md)다. 계획 작성 당시의 범위였다. 이후 코드·자동 검사 결과는 실행 보고서에 연결하며 새 설치판 배포·운영 자료 변경은 수행하지 않았다. P01의 기술 경로와 P04 환산 정책은 재승인할 기존 제품 결정이 아니라 실행 시 확인할 구현 제안이다.
