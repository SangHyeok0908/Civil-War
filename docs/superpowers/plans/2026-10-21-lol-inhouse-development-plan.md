# LoL 내전 기록 서비스 Implementation Plan

> 기록일 2026-10-21. 현재: [제품 명세](../../spec.md).

> 2026-10-25: 반복 설명을 정본 링크로 정리했다. 날짜별 사실·근거는 보존하며, 현재 링크의 값은 당시와 다를 수 있다.

**작성 목적 (2026-10-21):** 승인 기획을 작업 T01–T15와 검사 이름에 연결한 당시 계획이다. 본문의 체크박스는 당시 수행 기록이며 현재 출시·실환경 검증을 보장하지 않는다. 현재 제품 기준은 [명세](../../spec.md), 완료 범위와 남은 순서는 [진행 상태](../../status.md)에 있다.

| 기록일·분류 | 결정 주체·상태 | 당시 계획에 미친 영향 |
| --- | --- | --- |
| 2026-10-21 사용자 확정 | 사용자 · 서버 Java 25/Spring Boot 4.1.x, PostgreSQL, JPA/Specification, Gradle Groovy DSL과 후속 Node.js 24 | 기존 TypeScript 서버/Fastify/pg 제안을 교체. Gradle은 기존 사용 경험을 반영 |
| 2026-10-21 미확정 제안 | 작성자 · React/Vite, Electron/SQLite, pnpm/Vitest/Playwright 및 세부 도구 | 아래 후보 경로·명령은 승인된 기술 제품이 아니었음 |
| 2026-10-22 실행 승인 | 사용자 · D01–D04에 따른 단계 1–3 임시 개발 | 단계 0 PASS와 운영 준비 완료는 승인하지 않음 |
| 2026-10-23 범위 변경 | 사용자 · D22 | C01/C02/C10과 T15를 작업·완료 조건에서 제외 |
| 2026-10-24 조사·선택 | 조사 담당자의 C07 완료, 사용자의 D24 확정 | 새 계산 버전 반영·전 경기 재계산·검증은 당시 미완료 |

최초 승인 범위는 [기획서](../specs/2026-10-21-lol-inhouse-design.md), 기술 대안·미확정 제안은 [기술 결정 기록](../decisions/2026-10-21-tech-stack-decisions.md), 순차 변경은 [야간 결정 기록](../decisions/2026-10-22-overnight-decisions.md)에서 확인한다. 첫 실기 단계는 [LCU 계획](2026-10-21-lcu-validation-plan.md)이었다.

## Global Constraints

당시 작업은 승인된 제품 범위를 바꾸지 않는 조건으로 나눴다. 공통 제품 설명을 다시 복사하지 않으며 [현재 제품 명세](../../spec.md), 권한·오류·데이터 형식은 [현재 API 계약](../../contracts/api.md)을 사용한다. 사용자 제외 조건은 [진행 상태의 범위 제외](../../status.md#범위-제외와-미확인-사실)에서 확인한다.

## Review Focus

1. 서버 저장 후 응답 유실 및 취소 경기의 재전송: 한 경기만 유지하고 취소 상태·기존 포지션을 보존한다 — T02·T06.
2. 등록 대기가 있는 상태에서 LCU 계정 또는 등록 코드 변경: 대기 건의 원래 수집자 권한을 다른 사람에게 이전하지 않는다 — T06·T07.
3. 재계산 도중 등록·취소·포지션 수정 및 프로세스 종료: 오래된 계산을 공개하지 않고 재시작 후 최신 자료로 복구한다 — T09.
4. 팀 킬·피해량이 0, 동일 기록만 있는 초기 표본, 지표 누락: 유한한 보수적 점수와 명시적 결측 상태를 제공한다 — T01·T08.
5. 과거 패치 또는 신규 챔피언·아이템 이미지 부재: 숫자 기록은 표시하고 이미지 실패가 페이지를 막지 않는다 — T11.

---

## 1. 단계와 진행 조건

단계 0(V1–V2 실측) → 단계 1(T01–T04 기록) → 단계 2(T05–T07 수집 흐름) → 단계 3(T08–T12 평가·웹) → 단계 4(T13–T14 설치·운영)로 나눴다.

초기에는 0단계 PASS 이전 스캐폴딩·프레임워크·DB 구현을 막았으나, 2026-10-22 사용자와 [D01](../decisions/2026-10-22-overnight-decisions.md#d01--hold-중-단계-13의-조건부-draft-개발)로 1–3단계 임시 개발만 허용했다. 2026-10-23 [D22](../decisions/2026-10-22-overnight-decisions.md#d22--2026-10-23-사용자-요청에-따른-검증-작업-제외) 이후 새 내전 일정과 T15 경기 수는 진행 조건이 아니다. 각 단계의 실제 증거·남은 조건은 [진행 상태](../../status.md#단계별-확인-범위)에 있다.

## 2. 기술 결정과 파일 책임

2026-10-21 확정 기술과 당시 미정 제안은 첫 표 및 [기술 결정 기록](../decisions/2026-10-21-tech-stack-decisions.md)으로 구분한다. Java 계산을 TypeScript에서 직접 공유한다는 이전 전제는 제거했고 언어 중립 JSON과 fixture를 연결점으로 삼았다. PostgreSQL 전용 Native SQL, 단일 서버 컨테이너·DB 작업자는 당시 보완 제안이었다.

Java 25에서 Gradle 9.1.0 이상의 9.x, 정확한 Spring Boot 4.1.x 정식 패치를 T01에서 고정하는 계획이었다. 이후 선택·실제 고정값은 [개발 안내의 원본 설정 링크](../../development/setup.md#서버-빌드와-테스트)를 따른다. 동적/시험판 버전으로 대체하거나 이 기록을 최신 패치 주장으로 쓰지 않는다.

아래 파일명과 책임은 작성자의 구조 제안이며 사용자 기술 확정과 구분한다. Electron/SQLite 후보를 채택하면 실제 Windows 네이티브 모듈 빌드·시험이 필요하고 첫 아키텍처는 V2 PC에 맞추기로 했다.

| 경로 | 책임 |
| --- | --- |
| `apps/server/build.gradle`, `apps/server/settings.gradle` | Groovy DSL 기반 서버 의존성·플러그인·빌드 설정과 프로젝트 이름 |
| `apps/server/gradlew`, `apps/server/gradlew.bat`, `apps/server/gradle/wrapper/` | macOS·Windows에서 동일한 Gradle 버전으로 실행하는 Wrapper |
| `apps/server/src/main/java/cw/contracts/` | Java 요청/응답 모델, 경기·회원·포지션 타입, 오류 코드 |
| `apps/server/src/main/java/cw/lcu/` | 실기로 확정된 경기 응답의 서버 정규화·식별 |
| `apps/server/src/main/java/cw/domain/` | 순수 계산: 지표, 점수, 누적, 역할별 실력, 팀 추천·포지션 제안 |
| `apps/server/src/main/java/cw/auth/` | 코드·세션·수집기 권한과 인증 폐기 |
| `apps/server/src/main/java/cw/members/` | 참가자와 운영자 지정값, 참고 자료 |
| `apps/server/src/main/java/cw/matches/` | 중복 없는 임시 저장·등록 확정, 원본 보존, 역할 정정·취소·권한별 조회 |
| `apps/server/src/main/java/cw/evaluation/` | 버전·재계산 작업·계산 결과의 일괄 공개 |
| `apps/server/src/main/resources/db/migrations/` | 버전 관리되는 SQL; 실행 도구는 별도 결정 |
| `apps/server/src/test/java/cw/` | Java 도메인 단위 테스트와 실제 PostgreSQL/API 통합 테스트 |
| `packages/contracts/src/`, `packages/lcu/src/` | TypeScript 후보 채택 시 클라이언트 모델·LCU 응답 사전 검사; Java 서버와 fixture로 일치 검증 |
| `apps/web/src/features/` | React 후보 채택 시 matches, members, rankings, teams, admin 화면 |
| `apps/collector/src/main/` | Electron 후보 채택 시 LCU, 인증 보호, 전송·등록 요청 큐, 서버 전송 |
| `apps/collector/src/preload/`, `apps/collector/src/renderer/` | Electron 후보 채택 시 제한된 IPC와 등록 화면 |
| `tests/e2e/` | 클라이언트 도구 확정 후 브라우저·수집기 사용자 흐름 |
| `infra/`, `docs/runbooks/` | 컨테이너 구성, 백업/복원, 설치·장애·운영 절차 |

## 3. 공통 계약

T01에서 Java 모델을 만들고 웹·수집기는 같은 JSON 필드·오류와 fixture 기대값에 맞추는 계획이었다. 당시 계약 이름은 [1단계 고정 스키마](../../contracts/stage1.schema.json)에, 이후 평가 모델은 [3단계 스키마](../../contracts/stage3.schema.json)에 남아 있다. 현재 필드 표·오류·경로는 [API 계약](../../contracts/api.md)을 따른다.

초기 계획의 `ConfirmationInput`은 matchKey를 함께 기술했으나 구현 계약은 URL 경로에서 받는다. `RoleReferenceSample`의 inhouse 입력도 외부 가져오기와 DB 내전 표본을 후속 계약에서 분리했다. 계획 초안을 현재 요청 형식으로 복사하지 않는다.

### 인증 기본값

기획에서 위임받은 만료·쿠키·코드·시도 제한 수치를 구현 기본값으로 제안했다. 현재 값과 동작은 [인증과 권한](../../contracts/api.md#인증과-권한), 당시 작은 규모의 제한과 이유는 [D10](../decisions/2026-10-22-overnight-decisions.md#d10--인증과-http-기본값의-명시적-운영-한계)을 따른다. 로컬 발급·전체 폐기 명령의 실제 구문은 [최초 관리자와 복구](../../development/setup.md#최초-관리자와-복구)에 있다.

### 저장과 일관성

경기 상태와 원본/확정 역할을 분리하고 변경 번호·영속 작업을 함께 저장하는 구조를 제안했다. 현재 트랜잭션 기준은 [변경·재계산·일관성](../../spec.md#변경재계산일관성), API 처리와 작업자 경계는 [재계산 계약](../../contracts/api.md#계산-규칙-검증게시복구)에 둔다. 초기 직렬화·마이그레이션 선택 이유는 [D08](../decisions/2026-10-22-overnight-decisions.md#d08--단계-1의-작은-규모-트랜잭션-직렬화)·[D09](../decisions/2026-10-22-overnight-decisions.md#d09--보존마이그레이션후속-평가-경계)를 참조한다.

## 4. 작업별 구현 계획

테스트 이름·파일 책임·체크박스는 당시 작업 추적 근거로 보존한다. 명령을 다시 실행하려면 [서버 빌드·테스트](../../development/setup.md#서버-빌드와-테스트), [수집기](../../development/setup.md#수집기-개발실행), [웹 통합 검증](../../development/setup.md#웹과-전체-통합-검증)을 사용한다. 아래 후보 명령과 커밋 문구는 당시 계획 문법이며 최신 실행 안내가 아니다.

**단계 1 실행 기록 (2026-10-22):** T01–T04는 provisional 구현 및 실제 PostgreSQL 검증 완료. [63개 서버 테스트·복구 CLI·제한 사항](../../validation/stage1-report.md)을 참조한다. 단계 0 HOLD와 운영 계약 미확정은 유지한다. 클래스/SQL 파일명은 구현 책임에 맞게 분리했으며 migration은 Flyway 표준 `V1__core.sql`이다. 단계 2 이후 체크박스는 변경하지 않았다.

### T01. 검증된 경기 계약과 정규화

**Files:** Create `apps/server/build.gradle`, `apps/server/settings.gradle`, `apps/server/gradlew`, `apps/server/gradlew.bat`, `apps/server/gradle/wrapper/gradle-wrapper.jar`, `apps/server/gradle/wrapper/gradle-wrapper.properties`, `apps/server/src/main/java/cw/contracts/`의 경기·회원·인증·평가·팀 모델, `apps/server/src/main/java/cw/lcu/MatchNormalizer.java`, `apps/server/src/main/java/cw/matches/MatchInputValidator.java`; Test `apps/server/src/test/java/cw/lcu/MatchNormalizerTest.java`. Wrapper 파일은 선택한 Gradle 버전의 공식 Wrapper 작업으로 생성한다. Modify `.gitignore`.

**Interfaces:** 운영 확정 시 V2 `fixtures/lcu/verified/*`와 필드 맵을 소비한다. HOLD 중 draft는 `fixtures/lcu/candidates/h2-20261021/*`와 [후보 계약](../../validation/lcu-candidate-contract.md)을 사용하며 합성 metadata와 미확정 의미를 유지한다. Produces `normalizeMatch(rawJson) -> NormalizedMatch`, `validateIngest(input) -> ValidationResult`, `validateConfirmation(input, match) -> ValidationResult`의 Java 구현과 위 JSON 계약. `ValidationResult={ok,issues:[{path,code}]}`. 정규화 실패는 같은 issues 구조를 가진 `MatchValidationError`로 반환하고 validator는 이를 결과로 변환한다. rawJson의 Java 자료형은 JSON 처리 도구 결정 시 확정한다.

- [x] **1. 정규화 테스트를 작성한다.** `completeTenPlayers`, `rejectNineOrDuplicatePlayers`, `missingIsNotZero`, `preserveStringGameId`: 참가자 수 10, 경기 ID 원문 문자열과 동일, 시야 점수 누락 시 `participants.0.visionScore/REQUIRED` 오류를 검증한다. 숫자 범위·팀당 5명·양 팀 승패 일치·양의 경기 시간을 포함한다.
- [x] **2. Gradle 설정 후 테스트 실패를 확인한다.** `./apps/server/gradlew -p apps/server test --tests 'cw.lcu.MatchNormalizerTest'` → 미구현 정규화로 실패. 테스트 환경 오류를 기능 실패로 간주하지 않는다. 이 단계 이전에 확정된 Java 25·Spring Boot 4.1.x 정책에 따라 정확한 패치 버전을 기록하고, JDK 배포판·Gradle 세부 버전과 JSON 처리·검증·테스트 도구를 확정한다.
- [x] **3. 필드 맵으로 Java 정규화와 입력 검증을 구현한다.** 필드 맵에 따라 Java 정규화·입력 검증과 버전별 디코더를 작성한다. 수집기와 서버가 같은 fixture 기대값을 쓰도록 연결한다. 필수 조건은 [원본 정규화](../../contracts/api.md#lcu-원본을-정규화하는-규칙)를 따른다.
- [x] **4. 서버 컴파일·단위 테스트를 통과한다.** `./apps/server/gradlew -p apps/server classes testClasses`와 위 `MatchNormalizerTest` 실행 → PASS. 실행 JAR 패키징은 T03에서 애플리케이션 진입점을 구현한 뒤 검증한다. 클라이언트 타입 검사·테스트·빌드 명령은 해당 도구를 확정한 뒤 기록한다.
- [x] **5. 커밋한다.** `feat: define provisional match contracts and normalization`.

### T02. PostgreSQL 임시 저장·등록 확정과 중복 무반영

**Files:** Create `infra/compose.test.yml`, `apps/server/src/main/java/cw/db/DatabaseConfiguration.java`, `apps/server/src/main/resources/db/migrations/001-core.sql`, `apps/server/src/main/java/cw/matches/{MatchEntity,MatchParticipantEntity,IngestService,RegistrationService,CollectorMatchQuery,MatchRepository}.java`, `apps/server/src/test/java/cw/matches/RegistrationIntegrationTest.java`, `apps/server/src/test/java/cw/support/DatabaseTestSupport.java`.

**Interfaces:** Consumes T01 계약/정규화. Produces `ingestMatch(input, actor) -> IngestMatchAck`, `registerMatch(input, actor) -> RegistrationAck`, `getCollectorMatch(key, actor) -> CollectorMatch`의 Java 서비스, `JpaRepository` 기반 `MatchRepository`. T04의 동적 조회를 위해 `JpaSpecificationExecutor<MatchEntity>`를 함께 지원한다. 테스트 DB 설정은 `DatabaseTestSupport`에서 로드하며 OS별 쉘 환경변수 문법에 의존하지 않는다.

- [x] **1. 실제 DB 트랜잭션 테스트를 작성한다.** `pendingExcludedUntilConfirmed`, `concurrentDuplicateIngest`, `concurrentConfirmation`, `retryAfterLostReply`, `duplicateDoesNotRecalculate`, `retryCannotChangeRoles`, `canceledCannotReturn`, `allTenMustBeMembers`: 경기 수 1, pending 수신 전후 revision 동일, 중복 확정 후 revision 불변, 최초 확정 포지션 보존, 취소 경기 재수신 후 canceled 유지. 비참가자의 조회·확정 거절과 다른 인증된 참가자의 확정 허용도 검사한다.
- [x] **2. 실패를 확인한다.** `docker compose -f infra/compose.test.yml up -d --wait`, Java `RegistrationIntegrationTest` 실행 → 등록 함수 미구현으로 실패. 테스트 DB는 운영 DB와 다른 이름·포트·볼륨을 사용한다.
- [x] **3. JPA 매핑·DB UNIQUE·서비스 트랜잭션으로 두 단계를 구현한다.** JPA 매핑·DB UNIQUE·트랜잭션으로 ingest와 confirm 서비스를 나눈다. 저장 단위·중복·취소 응답은 [수집·등록 계약](../../contracts/api.md#경기-수집등록과-중복-처리)에 맞춘다.
- [x] **4. 동시 요청과 롤백을 검증한다.** 동일 명령 → PASS; 중간 저장 오류 시 참가자 일부나 재계산 작업만 남지 않아야 한다.
- [x] **5. 커밋한다.** `feat: persist idempotent inhouse registrations`.

### T03. 코드 인증·회원 관리 API와 로컬 복구

**Files:** Create `apps/server/src/main/java/cw/CivilWarApplication.java`, `apps/server/src/main/java/cw/auth/{EnrollmentCodeService,AdminSessionService,CollectorCredentialService,AuthController}.java`, `apps/server/src/main/java/cw/cli/AdminCodeCommand.java`, `apps/server/src/main/java/cw/members/{MemberRepository,MemberController}.java`; Test `apps/server/src/test/java/cw/auth/AuthMembersIntegrationTest.java`.

**Interfaces:** T02 저장소 위에 `requireAdmin()`/`requireCollector()`가 검증한 principal을 반환하고 T02 경기 서비스를 API에 연결한다. 당시 enroll·회원·코드·세션 경로의 상세 표는 [인증](../../contracts/api.md#인증과-권한)과 [회원 계약](../../contracts/api.md#회원), 로컬 CLI는 [복구 안내](../../development/setup.md#최초-관리자와-복구)를 따른다.

- [x] **1. 인증·등록 테스트를 작성한다.** `oneUseAtomic`, `codeScopeIsolation`, `expiredAndRevoked`, `csrfAndOrigin`, `localRecovery`, `memberIdentityStable`: 동시 코드 소비 성공 1회, 수집자 자격의 관리자 접근 403, 이름 변경 전후 회원 ID 동일. 비밀값 로그 부재와 seedSkill 범위를 확인한다.
- [x] **2. 실패를 확인한다.** Java `AuthMembersIntegrationTest` 실행 → 라우트/인증 미구현으로 실패.
- [x] **3. 인증 기본값과 API를 구현한다.** 인증·회원 서비스를 만들고 Spring 공통 요청 처리에 입력 상한·시도 제한·로그 정제를 연결한다. 세부 권한과 쿠키는 [인증 계약](../../contracts/api.md#인증과-권한)을 따른다.
- [x] **4. 복구 CLI까지 검증한다.** 테스트 → PASS; 테스트 DB를 대상으로 Java 관리 명령의 `admin:code --revoke-all` 복구 동작 실행 후 이전 운영자 세션·미소비 운영자 코드는 거절되어야 한다. 새 코드는 명령 실행자의 터미널에 한 번만 표시하고 일반 로그에 저장하지 않는다.
- [x] **5. 커밋한다.** `feat: add scoped enrollment and owner administration`.

### T04. 전적 조회·운영자 포지션 정정·등록 취소

**Files:** Create `apps/server/src/main/java/cw/matches/{PublicMatchQuery,MatchSpecifications,AdminMatchService,MatchController}.java`; Test `apps/server/src/test/java/cw/matches/MatchAccessIntegrationTest.java`.

**Interfaces:** T02 저장/T03 인증을 사용해 공개 조회와 운영자 정정·취소를 연결한다. 당시 동적 조건은 `MatchSpecifications` 책임이었다. 경로·페이지·필터 형식은 [공개 기록과 관리자 정정](../../contracts/api.md#공개-기록과-관리자-정정)에 둔다.

- [x] **1. 권한·공개 범위·동적 조회 테스트를 작성한다.** `publicSafeDto`, `pendingNotPublic`, `onlyOwnerEdits`, `cancelHidesImmediately`, `profileRoleDoesNotRewriteHistory`: 공개 JSON의 PUUID 부재, pending/canceled 공개 조회 404, 수집자의 수정 요청 403 응답을 확인한다. `optionalFiltersCompose`와 `filteredMatchesAppearOnce`는 조건 없음·단일 조건·복합 조건, 같은 참가자에 대한 선수/챔피언/포지션/승패 조건 적용, 참가자 조인 후 경기 중복 및 페이지 누락 방지를 검증한다.
- [x] **2. 실패를 확인한다.** Java `MatchAccessIntegrationTest` 실행 → 미구현 라우트로 실패.
- [x] **3. Specification 기반 조회 DTO와 JPA 운영자 변경을 구현한다.** `MatchSpecifications`로 선택된 필터를 조합하고 JPA 변경을 감사·revision/job에 연결한다. 공개 범위와 수정 예외는 [공개 기록 계약](../../contracts/api.md#공개-기록과-관리자-정정)을 따른다.
- [x] **4. 검증한다.** 테스트 → PASS; 등록 수치·포지션·취소 상태·감사 이력이 트랜잭션 단위로 일치하고 공개에 원본/인증값이 나오지 않아야 한다.
- [x] **5. 커밋한다.** `feat: expose match records and owner corrections`.

**2026-10-22 단계 2 자동 검증:** T05–T07 구현과 자동 검증은 [stage2-report](../../validation/stage2-report.md)에 기록했다. 아래 실제 Windows 확인을 포함하는 4번 단계는 HOLD이며 macOS Electron fixture/서버 회귀 결과로 대체하지 않는다. D14–D18이 위임된 클라이언트 선택과 동작을 설명한다.

단계 2의 세 커밋 단계는 `feat: add durable Windows collector workflow` 통합 커밋으로 수행한다. 실제 Windows 검증은 별도 HOLD이며 성공한 실측을 의미하지 않는다.

### T05. Windows LCU 연결·계정 인식·기기 인증 보호

**Files:** TypeScript/Electron 후보 채택 시 Create `apps/collector/src/main/{main,lcu-client,credential-store,reference-export}.ts`, `apps/collector/src/preload/index.ts`, `packages/contracts/src/`의 클라이언트 계약 모델, `packages/lcu/src/{normalize-match,role-reference}.ts`; Test `apps/collector/src/main/lcu-bridge.test.ts`, `packages/lcu/src/{normalize-match,role-reference}.test.ts`. 클라이언트 workspace·빌드·테스트 설정 파일은 도구 선택 후 이 작업에 포함한다.

**Interfaces:** Consumes V1 연결 원칙/T01 JSON 계약·fixture/T03 enroll. 수집기 사전 검사와 오프라인 표시는 V2 필드 맵에 따라 별도 구현하며 Java 서버 코드를 직접 호출하지 않는다. Produces main 내부 조회 함수 `getAccount()`, `listPastMatches()`, `getMatch(gameId)`와 제한된 IPC `getAccount()`, `enroll(code)`, `exportMemberReferences(selection)`. T07의 버튼 IPC가 main 조회 함수를 조합한다. `CredentialStore.load(): Promise<{token,memberId,credentialId,puuid}|null>`. 참고 자료 내보내기는 회원 식별 정보와 `RoleReferenceSample[]`만 담으며 관리자 웹에서 가져온다.

- [x] **1. 연결·인증 분리 테스트를 작성한다.** `clientStopped`, `portChanged`, `noTokenInRenderer`, `accountMismatch`, `soloReferenceOnly`, `noHistoryFetchOnLaunch`: `expect(rendererAccount).not.toHaveProperty('token')`, `expect(mismatch.code).toBe('ACCOUNT_MISMATCH')`, `expect(reference.source).toBe('solo420')`, `expect(historyRequestsOnLaunch).toBe(0)`. 토큰 복호화 실패는 재등록 안내이며 평문 저장으로 우회하지 않는다.
- [x] **2. 실패를 확인한다.** pnpm/Vitest 후보 채택 시 `pnpm exec vitest run apps/collector/src/main/lcu-bridge.test.ts packages/lcu/src/normalize-match.test.ts packages/lcu/src/role-reference.test.ts` → 미구현으로 실패. 클라이언트 정규화는 T01과 동일한 fixture에서 참가자 10명·문자열 경기 ID·0과 누락 구분이 일치하는지 검증한다.
- [x] **3. main 전용 LCU·인증 저장과 읽기 IPC를 구현한다.** main 전용 LCU·보호 저장·읽기 IPC를 구현한다. 당시 Electron 격리 선택은 [D15](../decisions/2026-10-22-overnight-decisions.md#d15--인증lcu렌더러-경계)에, 현재 경계는 [기기 인증](../../spec.md#수집자-기기-인증)과 [수집 흐름](../../spec.md#경기-수집확인등록)에 있다.
- [ ] **4. fixture 테스트와 Windows 연결 확인을 수행한다.** 테스트 → PASS. 실제 Windows에서 클라이언트 꺼짐·로그아웃·재시작을 확인하고 renderer 개발자 도구에 토큰이 노출되지 않는지 점검한다.
- [x] **5. 커밋한다.** `feat: connect Windows collector to verified LCU data`.

### T06. 재시작에 견디는 임시 저장·등록 확정 요청 큐

**Files:** Create `apps/collector/src/main/{outbox,outbox-migrations,uploader}.ts`; Test `apps/collector/src/main/outbox.test.ts`.

**Interfaces:** Consumes T05 credential/T03 ingest·confirm API. Produces `enqueueCollected(input: IngestMatchInput, actor: CollectorPrincipal): Promise<OutboxItem>`, `enqueueConfirmation(input: ConfirmationInput, actor: CollectorPrincipal): Promise<OutboxItem>`, `drainOutbox(): Promise<void>`, `listOutbox(): OutboxItem[]`. OutboxItem은 kind(`ingest / confirm`), state(`pending / sending / succeeded / needs_attention`), 원래 memberId·credentialId·matchKey·요청 자료·선행 ingest 작업 ID를 가진다. 같은 회원·경기·kind의 미완료 요청은 합치며, 이미 확정 대기 중인 포지션을 재조회로 덮어쓰지 않는다.

- [x] **1. 파일 기반 SQLite 테스트를 작성한다.** `survivesRestart`, `lostIngestAndConfirmAck`, `confirmWaitsForIngest`, `ingestDoesNotAutoConfirm`, `repeatedQueryCoalesces`, `switchedAccountCannotAdopt`, `canceledStopsRetry`, `restartFlushDoesNotFetchLCU`: `expect(reopened.roles).toEqual(confirmedRoles)`, `expect(serverCount).toBe(1)`, `expect(sentKinds).toEqual(['ingest','confirm'])`, `expect(confirmWithoutUserAction).toBe(false)`, `expect(sentWithOtherCredential).toBe(false)`, `expect(canceled.retryScheduled).toBe(false)`. 강제 종료된 sending 작업도 다음 실행에 회복되며, 재전송 때문에 새로운 LCU 경기 조회를 시작하지 않아야 한다.
- [x] **2. 실패를 확인한다.** `pnpm exec vitest run apps/collector/src/main/outbox.test.ts` → 저장/전송 미구현으로 실패.
- [x] **3. SQLite 트랜잭션과 단일 전송 작업자를 구현한다.** SQLite 트랜잭션과 단일 전송 작업자를 구현한다. 선행 ingest 의존성·재시도·재개·보관 규칙은 [오프라인 대기](../../spec.md#오프라인-대기와-재시도)를 적용한다. 초기 선택 이유는 [D16](../decisions/2026-10-22-overnight-decisions.md#d16--로컬-원본소유자순서-보존)에 남긴다.
- [x] **4. 저장·복구를 검증한다.** 테스트 → PASS. ingest 성공은 UI의 ‘확인 대기’, confirm 성공 또는 서버의 already_registered 응답만 ‘등록 완료’로 표시한다. 이미 canceled라는 응답은 ‘등록 취소’로 표시하며 자동 복원하지 않는다. 등록 완료 건의 큰 원본은 30일 뒤 정리하고 승인 키/상태는 남긴다. 미등록 자료는 자동 삭제하지 않는다. 로컬 디스크 저장 실패 시 ‘전송 대기 저장 실패’를 표시하고 저장 성공으로 안내하지 않는다.
- [x] **5. 커밋한다.** `feat: persist confirmed matches and retry safely`.

### T07. 수집기 확인·등록 화면과 실제 Windows 흐름

**Files:** Create `apps/collector/src/renderer/{App,AccountView,MatchList,MatchReview,OutboxView}.tsx`, `apps/collector/src/preload/collector-api.ts`, `apps/collector/src/main/history-sync.ts`; Test `tests/e2e/collector.spec.ts`.

**Interfaces:** Consumes T05 main 조회 함수/T06 요청 큐/T03 회원·확인 대기 API. Produces `queryPastMatches(): Promise<HistorySyncResult>`, `loadPendingMatches(): Promise<CollectorMatch[]>`, `confirmRegistration(matchKey, rolesByPuuid)` IPC. HistorySyncResult는 경기별 matchKey·전송 상태·실패 이유를 담는다. 조회 후 적격 자료는 enqueueCollected, 등록 확인 후에는 enqueueConfirmation을 호출한다. 계정·참가 여부를 main에서 검사하고 회원 명단의 마지막 정상 응답을 캐시한다. UI에는 rawMatch 편집 기능을 노출하지 않는다.

- [x] **1. 사용자 흐름 테스트를 작성한다.** `buttonFetchesAndStages`, `noAutoRegistration`, `allRolesConfirmed`, `offlineThenResume`, `queryFailureIsNotPending`, `duplicateShowsExistingState`: `expect(historyRequestsBeforeClick).toBe(0)`, `expect(afterQuery.serverState).toBe('pending')`, `expect(afterQuery.publicMatchCount).toBe(0)`, `expect(afterConfirmAck).toContain('등록 완료')`. 미등록 회원·다른 LCU 계정·클라이언트 종료, 서버에 이미 저장된 pending 재표시와 registered/canceled 안내도 포함한다.
- [x] **2. 실패를 확인한다.** `pnpm test:e2e -- tests/e2e/collector.spec.ts`. 이번 최초 실행은 Electron binary 미설치/샌드박스 다운로드 오류로 실패했고, 설치 후 UI 실행에서 중복 오류 표시를 검출해 수정했다. 원래 예상한 ‘화면/IPC 미구현’ 메시지를 관측했다고 주장하지 않는다. 자동 테스트는 실제 Electron main/preload와 고정 fixture IPC를 사용하며 실제 LCU 검증과 구분한다.
- [x] **3. 최초 코드 입력→자동 계정 인식→‘과거 경기 조회’→서버 임시 저장→5+5 비교→내전·실제 역할 확인→‘내전 등록’ 흐름을 구현한다.** main 조회→enqueueCollected, 확인→enqueueConfirmation을 화면에 연결하고 회원 명단 마지막 정상 응답을 캐시한다. 현재 상태별 안내와 명시적 등록은 [수집 흐름](../../spec.md#사용-흐름)과 [오프라인 대기](../../spec.md#오프라인-대기와-재시도)를 따른다.
- [ ] **4. 자동 테스트와 Windows 통합 흐름을 확인한다.** 테스트 → PASS. 실제 Windows에서 서버 차단→조회 버튼→전송 대기→수집자 확인→등록 대기→프로그램 종료→재실행→연결 복구 후 임시 저장·등록 확정 순차 성공을 확인한다. 수집자가 확인하지 않은 자료는 복구 후에도 확인 대기로 남아야 한다. 반복 조회·다른 참가자의 전송으로 기존 점수와 역할이 바뀌지 않아야 한다.
- [x] **5. 커밋한다.** `feat: add collector review and registration workflow`.

### T08. 포지션별 평가·누적 통계 순수 함수

> **2026-10-22 단계 3 구현·검증:** [보고서](../../validation/stage3-report.md). T08–T12 구현은 통합 커밋으로 묶었다. 웹 검증 명령은 `pnpm test:web`이며 실제 서버 시나리오와 fixture UI 시나리오를 구분한다. T11/T12 단계 2의 정확한 선행 RED 절차와 T12 외부 네트워크 수용은 완료로 주장하지 않는다. 당시 C07 보류 및 T13–T14 미완료를 기록했다. 2026-10-24의 C07 조사 완료와 후속 미완료는 다음 문단을 따른다. C01/C02/C10과 T15는 사용자 결정으로 제외했다.

**확정 지표와 현재 구현 (2026-10-24):** [D24](../decisions/2026-10-22-overnight-decisions.md#d24--2026-10-24-목표물-공격-평가-기준-사용자-확정)에서 사용자가 목표물 공격에 탑=분당 포탑 피해, 나머지 네 역할=분당 목표물 피해를 쓰는 단일 지표 구성을 확정했다. 바깥 가중치는 유지하고 MIDDLE/BOTTOM의 이전 50:50 혼합은 적용하지 않는다. 현재 구현은 `objective-provisional-v1`이며, 새 계산 버전 확정·반영, 계약·화면 설명 갱신, 모든 유효 경기의 재계산·검증이 남아 있다. 테스트는 선택하지 않은 피해 필드 변경이 해당 항목 점수에 영향을 주지 않는지 포함한다. C07의 의미 조사는 완료했으며 단계 0 전체는 후속 반영·검증 전까지 보류한다.

**Files:** Create `apps/server/src/main/java/cw/domain/{MatchFeatures,ScoringService,MemberAggregator,ScoringRulesV1}.java`; Test `apps/server/src/test/java/cw/domain/{ScoringServiceTest,MemberAggregatorTest}.java`.

**Interfaces:** `EvaluationInput`을 받아 `scoreMatches(input)`과 `aggregateMembers(scores, matches)`의 Java 계산 결과를 만든다. GameScore/MemberStats 필드는 [현재 계산 계약](../../contracts/api.md#점수순위와-팀-추천), 계산식은 아래 §5의 정본 링크를 따른다.

- [x] **1. 핵심 평가 테스트를 작성한다.** `loserCanRankFirst`, `zeroDenominatorsFinite`, `sameRoleOnly`, `seedAndSoloCannotAffectRank`, `threeGameThreshold`, `cancelReturnsToProvisional`: 잘한 패배자 순위 1 가능, 모든 점수 유한, 2경기 provisional/3경기 ranked, 보정 점수 `(sum+5*groupMean)/(n+5)`와 허용 오차 내 일치를 검증한다. 동일 표본·극단값·0데스 KDA도 포함한다.
- [x] **2. 실패를 확인한다.** Java `ScoringServiceTest`, `MemberAggregatorTest` 실행 → 평가 함수 미구현으로 실패.
- [x] **3. 지표·역할 표준화·가중치·누적을 구현한다.** 지표·표준화·가중치·누적을 Java 도메인 함수로 구현한다. 입력에서 참고용 솔로/초기 실력을 분리하고 §5의 정본 규칙을 적용한다.
- [x] **4. 검증한다.** 테스트 → PASS. 수작업 계산 가능한 작은 예시와 정확히 일치하고, 평가 점수는 0–100, 0경기는 점수/순위 null이어야 한다.
- [x] **5. 커밋한다.** `feat: calculate role-aware performance and cumulative statistics`.

### T09. 평가 버전·전체 재계산·일괄 공개

**Files:** Create `apps/server/src/main/resources/db/migrations/002-evaluation.sql`, `apps/server/src/main/java/cw/evaluation/{EvaluationRepository,RecalculationWorker,GenerationPublisher,EvaluationController}.java`; Test `apps/server/src/test/java/cw/evaluation/RecalculationIntegrationTest.java`. Modify T02/T04 mutation handlers, T03 member updates.

**Interfaces:** T08과 DB source revision/jobs를 사용해 `recalculate(sourceRevision)` 및 `readCurrentGeneration()`을 구현한다. 버전 게시·조회 응답은 [계산 규칙 검증·게시·복구](../../contracts/api.md#계산-규칙-검증게시복구)를 따른다.

- [x] **1. 일관성·복구 테스트를 작성한다.** `singleVersionEverywhere`, `cancelDuringCalculation`, `workerRestart`, `staleGenerationNeverPublishes`: 공개 세대 revision과 최신 revision 일치, 공개 점수 전체의 평가 버전 동일, 취소 후 해당 회원 경기 수 2. 실패한 세대가 공개되지 않는지도 확인한다.
- [x] **2. 실패를 확인한다.** Java `RecalculationIntegrationTest` 실행 → 작업자/세대 조회 미구현으로 실패.
- [x] **3. 스냅샷 계산과 조건부 공개를 구현한다.** 스냅샷 계산·조건부 게시와 실패 복구 작업자를 구현한다. 입력 revision/버전이 바뀌었을 때 오래된 결과를 게시하지 않는 기준은 [계산 세대 계약](../../contracts/api.md#계산-규칙-검증게시복구)을 따른다.
- [x] **4. 장애 주입 테스트를 통과한다.** 테스트 → PASS. 기준 변경·역할 수정·등록 취소·새 경기 추가가 과거 점수와 누적 결과를 같은 세대로 갱신한다. seedSkill 변경은 공개 랭킹 값을 바꾸지 않는다. T10의 roleSkills도 같은 세대에 추가한다.
- [x] **5. 커밋한다.** `feat: publish consistent versioned evaluation generations`.

### T10. 역할별 실력 보정과 팀 후보 3개

**Files:** Create `apps/server/src/main/java/cw/domain/{RoleSkillCalculator,TeamRecommender}.java`, `apps/server/src/main/java/cw/teams/TeamController.java`; Test `apps/server/src/test/java/cw/domain/TeamRecommenderTest.java`, `apps/server/src/test/java/cw/teams/TeamApiIntegrationTest.java`. Modify T09 generation builder.

**Interfaces:** Member·GameScore와 유효 세대로 `calculateRoleSkills(members, scores)`, `recommendTeams(members, skills)`를 계산한다. RoleSkill은 memberId·role·value·n을 가진다. 요청과 응답은 [팀 추천 계약](../../contracts/api.md#점수순위와-팀-추천), 실력식은 §5 링크를 따른다.

- [x] **1. 배정 테스트를 작성한다.** `allowedRolesOnly`, `balanceBeforePreference`, `atMostThreeDistinctRosters`, `oneOrTwoOnly`, `impossibleMatching`, `anonymousAllowed`: 후보 수 최대 3, 선수 구성 키가 모두 고유함, 구성 불가 시 이유 존재. 특정 역할 가능 인원이 있어도 조합 전체가 불가능한 경우, 중복 10명/비활성 회원도 검사한다.
- [x] **2. 실패를 확인한다.** Java `TeamRecommenderTest`, `TeamApiIntegrationTest` 실행 → 미구현으로 실패.
- [x] **3. 가능한 배정을 열거하고 후보를 정렬한다.** 가능한 배정을 열거하고 같은 선수 집합의 반전·순열을 합쳐 후보를 정렬한다. 캐시·입력 오류·호출 제한은 [팀 추천 계약](../../contracts/api.md#점수순위와-팀-추천), 후보 기준은 §5 링크를 따른다.
- [x] **4. 테스트와 비용을 확인한다.** 테스트 → PASS. 10명 전원이 5역할 가능한 입력의 실행 시간·후보 수를 기록한다. 목표 서버에서 2초 이내 응답을 목표로 하고 초과 시 결과를 바꾸지 않는 조합 탐색 최적화를 수행한다.
- [x] **5. 커밋한다.** `feat: recommend balanced teams within playable roles`.

### T11. 공개 전적·통계·랭킹·팀 추천 웹

**Files:** Create `apps/web/src/App.tsx`, `apps/web/src/api.ts`, `apps/web/src/features/matches/{List,Detail}.tsx`, `apps/web/src/features/members/Profile.tsx`, `apps/web/src/features/rankings/Ranking.tsx`, `apps/web/src/features/teams/Recommendation.tsx`, `apps/web/src/components/ChampionItemIcon.tsx`, `apps/server/src/main/java/cw/assets/AssetCatalog.java`; Test `tests/e2e/public-web.spec.ts`.

**Interfaces:** Consumes T04/T09/T10 public APIs. Produces routes `/matches`, `/matches/:key`, `/members/:id`, `/rankings`, `/teams`; 아이콘은 확인된 정적 데이터 버전과 fallback을 사용하며 통계 계산에 이미지 메타데이터를 사용하지 않는다.

- [x] **1. 사용자 화면 테스트를 작성한다.** `tenPlayerComparison`, `aggregateKdaFromTotals`, `provisionalVisible`, `anonymousTeamChoices`, `missingAssetFallback`: `expect(playerRows).toHaveCount(10)`, `expect(page.getByText('평가 중')).toBeVisible()`, `expect(recordAfterImage404).toBeVisible()`. 로그인 없이 모든 조회/추천을 수행한다.
- [ ] **2. 실패를 확인한다.** `pnpm test:e2e -- tests/e2e/public-web.spec.ts` → 페이지 미구현으로 실패.
- [x] **3. 화면을 구현한다.** 경기·개인·랭킹·팀 추천 화면과 이미지 실패 표시를 연결한다. 표시 항목은 [공개 전적](../../spec.md#공개-전적과-통계), 점수 표시는 [누적 기준](../../spec.md#누적-랭킹과-점수-표시), 추천 화면은 [팀 추천](../../spec.md#팀-편성용-실력과-팀-추천)을 따른다.
- [x] **4. 접근과 실패 상태를 검증한다.** 테스트 → PASS. 좁은 화면은 전적 표 가로 스크롤을 제공한다. 키보드 조작·loading/빈 자료/계산 중/서버 오류 상태를 확인한다. 오래된/새로운 아이템 ID는 대체 아이콘과 ID를 표시한다.
- [x] **5. 커밋한다.** `feat: add public match statistics rankings and team pages`.

### T12. 운영자 웹과 초기 포지션 참고 자료

**Files:** Create `apps/web/src/features/admin/{Login,Members,Codes,MatchCorrections,Scoring,Jobs}.tsx`, `apps/server/src/main/java/cw/domain/RoleSuggester.java`, `apps/server/src/main/java/cw/members/MemberReferenceImporter.java`; Test `apps/server/src/test/java/cw/domain/RoleSuggesterTest.java`, `tests/e2e/admin-web.spec.ts`.

**Interfaces:** T03/T04/T09와 T05 참고 파일을 관리 화면에 연결하고 `suggestRoles(samples)`를 구현한다. 제안의 primary/secondary nullable·표본 수·출처·이유는 [참고 자료 계약](../../contracts/api.md#공식-기록-참고-자료-가져오기), 재계산 재시도는 [작업 계약](../../contracts/api.md#계산-규칙-검증게시복구)에 둔다.

- [x] **1. 관리 흐름 테스트를 작성한다.** `codeOnlyLogin`, `referenceDoesNotOverwriteManual`, `soloNeverEntersRanking`, `ownerCorrectsAndCancels`, `weightsCreateNewVersion`: `expect(afterImport.allowedRoles).toEqual(manualRoles)`, `expect(afterSoloImport.matchCount).toBe(beforeCount)`, `expect(oldScoringVersion.immutable).toBe(true)`. 새 브라우저 코드 발급과 기존 기기 인증 폐기도 포함한다.
- [ ] **2. 실패를 확인한다.** Java `RoleSuggesterTest` 실행, `pnpm test:e2e -- tests/e2e/admin-web.spec.ts` → 미구현으로 실패.
- [x] **3. 관리 화면과 제안 함수를 구현한다.** 관리 화면과 역할 제안 함수를 구현한다. 참고 표본·정렬·명시적 저장은 [초기 포지션 참고](../../spec.md#초기-포지션-참고-자료), 새 불변 규칙 입력은 [규칙 검증 계약](../../contracts/api.md#계산-규칙-검증게시복구)을 따른다.
- [ ] **4. 외부 관리 사용자 흐름을 확인한다.** 테스트 → PASS. 포지션 수정/취소 후 재계산 상태, 코드 만료/로그아웃/인증 폐기, 원본 수치 읽기 전용, 취소 자료의 내부 보관을 확인한다.
- [x] **5. 커밋한다.** `feat: add owner controls and reviewed role suggestions`.

### T13. Windows 설치·업데이트·진단

**Files:** Create `apps/collector/electron-builder.yml`, `scripts/build-collector.ps1`, `docs/runbooks/collector-install.md`, `docs/validation/windows-release.md`; Test `apps/collector/src/main/outbox-migration.test.ts`.

**Interfaces:** Consumes T05–T07. Produces Windows 설치 파일·SHA256·앱 버전, 호환 가능한 outbox schema migration. `userData` 경로는 버전 변경에도 유지한다.

- [ ] **1. 업데이트 회귀 테스트를 작성한다.** `upgradePreservesPendingAndCredential`: `expect(afterUpgrade.pending).toEqual(beforeUpgrade.pending)`, `expect(afterUpgrade.memberId).toBe(beforeUpgrade.memberId)`. 읽을 수 없는 저장소를 빈 DB로 자동 교체하지 않는다.
- [ ] **2. 실패를 확인한다.** `pnpm exec vitest run apps/collector/src/main/outbox-migration.test.ts` → migration 미구현으로 실패.
- [ ] **3. Windows 빌드와 저장소 마이그레이션을 구현한다.** SQLite 네이티브 모듈을 Electron ABI에 맞춰 빌드하고 main/preload만 Node 기능을 사용한다. Node 테스트용 의존성과 Electron 배포용 rebuild 결과를 별도 빌드 디렉터리로 분리하여 ABI 충돌을 막는다. 초기 업데이트는 수동 설치이며 자동 업데이트 서버는 만들지 않는다. LCU/토큰/원본을 빼고 오류 코드·버전·상태만 담는 진단 내보내기를 제공한다.
- [ ] **4. 실제 Windows에서 설치·재설치·업데이트한다.** `pwsh -File scripts/build-collector.ps1` 및 위 테스트 → PASS, 결과 설치 파일 실행 성공. 기존 등록 대기와 인증 유지, 앱 재시작 전송, 클라이언트 미실행을 확인한다. 서명되지 않은 배포의 OS 경고 여부를 기록하고 유료 인증서 구매는 임의로 진행하지 않는다.
- [ ] **5. 커밋한다.** `build: package and verify Windows collector upgrades`.

### T14. 집 Windows 배포·백업·복원

**Files:** Create `infra/{Dockerfile,compose.yml,.env.example}`, `infra/scripts/{backup,restore,verify-backup}.ps1`, `docs/runbooks/{deployment,backup-restore,incident-recovery}.md`, `apps/server/src/test/java/cw/health/HealthIntegrationTest.java`.

**Interfaces:** Consumes 완성된 서버/웹·CLI. Produces `GET /health/live`, `GET /health/ready`, Windows Compose 운영 절차. 컨테이너는 app/postgres/cloudflared이며 외부에 DB 포트나 관리 CLI를 노출하지 않는다.

- [ ] **1. readiness 테스트를 작성한다.** `readyRequiresDbAndMigrations`: DB 연결 실패 시 readiness 503, 마이그레이션 완료 시 readiness 200. 버전·건강 상태에 비밀값을 넣지 않는다.
- [ ] **2. 실패를 확인한다.** Java `HealthIntegrationTest` 실행 → readiness 미구현으로 실패.
- [ ] **3. Compose·HTTPS·운영 스크립트를 구현한다.** Gradle Wrapper의 `bootJar`로 패키징한 서버와 빌드된 웹을 app 이미지에 포함하여 웹과 API를 제공하고 Tunnel은 app에만 연결한다. 서버 실행 이미지는 Java 25를 사용하며 Node.js를 요구하지 않는다. T01에서 고정한 Spring Boot 4.1.x·JDK·Gradle 버전을 사용하고, 클라이언트 빌드 도구 확정 후 Docker 빌드 절차를 기록한다. 설정은 SERVER_ORIGIN, DATABASE_URL, Tunnel 자격을 분리하고 저장소에 비밀값을 넣지 않는다. Windows 시작 시 Docker/서비스 자동 시작·절전으로 인한 중단·재시작 정책을 실제 환경에 맞게 문서화한다. 외부 도메인은 사용자가 보유한 도메인을 우선 사용하고 필요 비용은 배포 전에 확인한다.
- [ ] **4. 배포와 복원을 실제 확인한다.** `docker compose -f infra/compose.yml up -d --build --wait` → 서비스 healthy. 외부 네트워크로 공개 조회/운영자 코드 인증/경기 등록, PC 재부팅 후 복구를 확인한다. 매일 및 버전 변경 전 `pg_dump -Fc` 백업을 수행하고 일간 14개·주간 8개 보관한다. `BACKUP_TARGET`으로 지정한 PC 밖 저장소에 백업·체크섬을 복사한 뒤 별도 DB로 `restore.ps1 -TestRestore`하여 경기 수·취소 이력·재계산 결과를 대조한다. 저장소 경로와 접근 권한은 실제 배포 환경에서 설정하며 미설정이면 백업 성공으로 표시하지 않는다.
- [ ] **5. 복구 절차를 확정하고 커밋한다.** 운영 DB 복원은 별도 명시적 실행으로 제한하고 복원 시 기존 코드·인증을 폐기한 뒤 로컬 운영자 코드로 회복한다. 가장 최근 백업 이후 손실 가능 구간을 표시한다. 완료된 외부 복원 증거를 문서에 남기고 `ops: deploy home server with verified backup recovery`로 커밋한다.

### T15. 사용자 결정으로 제외

2026-10-23에 실제 3–5경기 시범 운영과 이를 전제로 한 평가 보정·별도 시범 운영 보고서 작성을 제거했다. 실행할 체크리스트나 출시 조건으로 사용하지 않는다. 2026-10-24에 완료한 피해량 의미 조사·지표 확정에 따른 새 계산 버전 반영·재계산·검증은 단계 0·T08 범위에, 설치·서버 운영 절차와 검증은 T13–T14 범위에 남긴다.

## 5. 초기 계산 규칙

기획이 위임한 수치 설계를 작업 T08–T10에 연결한 절이다. 제품 기준 전체를 계획서에 복제하지 않으며 현재 [경기별 활약 점수](../../spec.md#경기별-활약-점수)와 연결한 하위 절을 사용한다. 당시 V2 필드 확인이 적용 조건이었고, 이후 임시 구현 허용이 실측 완료로 바뀌지는 않았다.

### 지표와 가중치

초기 전체 가중치·항목 내부 혼합 비율은 [현재 가중치](../../spec.md#포지션별-전체-가중치)와 [내부 지표](../../spec.md#항목-내부-지표)에 모았다.

**변경 이력:** 원래 목표물 설계는 탑=포탑, 정글/서포터=목표물, 미드/원딜=포탑·목표물 50:50이었다. D04는 포함 관계가 미확인인 동안 중복 가중을 피하는 임시 단일 지표였다. 2026-10-24 C07 조사 후 사용자가 D24에서 탑=분당 포탑, 나머지=분당 목표물을 최종 채택하고 바깥 가중치는 유지했다. 원안·임시 선택·최종 사용자 선택의 순서를 구분한다. 당시 구현 식별자는 `objective-provisional-v1`이었고 새 버전 반영·재계산·검증은 남았다([D24](../decisions/2026-10-22-overnight-decisions.md#d24--2026-10-24-목표물-공격-평가-기준-사용자-확정)).

### 같은 역할 표준화

경기 상대와 과거 같은 역할 표본을 섞는 보수적 계산은 작성자가 기술 위임 범위에서 정한 기본값이었다. 현재 P·H·표본 혼합 공식과 0/누락 처리는 [같은 포지션의 지표 환산](../../spec.md#같은-포지션의-지표-환산)에 있다. 새 내전 추가 때 과거 상대 점수도 바뀔 수 있다는 한계를 T09 재계산 검증에 연결했다.

### 누적·동점·표시

누적 k=5와 3경기 기준은 사용자 승인 기획에서 왔고 반올림·공동 순위·0데스 표시는 기술 설계였다. 현재 공식과 수치·출력은 [누적 랭킹과 점수 표시](../../spec.md#누적-랭킹과-점수-표시)에 둔다. T08의 합계 KDA·표본 경계 테스트로 이 절을 검증하도록 계획했다.

### 팀 편성용 실력과 후보

초기 실력과 역할별 기록 혼합, 선호 비용, 최선 차이+5, 126개 분할은 작성자의 세부 탐색 설계다. 현재 실력식은 [포지션별 실력 보정](../../spec.md#포지션별-실력-보정), 후보 선택 수치는 [후보 선택 규칙](../../spec.md#후보-선택-규칙), 선택 이유는 [D20](../decisions/2026-10-22-overnight-decisions.md#d20--팀-열거공개-웹관리-경계)을 따른다.

## 6. 계획 점검과 인계

기획과 작업 연결은 권한/계정→T03·T05·T12, 수집/재시도/중복→V1–V2·T01·T02·T06·T07, 전적/계산→T04·T08·T09·T11, 팀→T10·T12, 정정/취소→T04·T09, 운영→T13·T14로 점검했다. T15는 D22 뒤 제외됐다.

계획 작성 시에는 범위·인터페이스·검증 연결만 자체 점검했으며 제품 실행 성공을 주장하지 않았다. 이후 실행 증거는 아래 날짜 기록과 단계별 보고서에 남긴다. 2026-10-24 C07 조사와 D24 선택 뒤 새 버전 구현·전 경기 검증은 여전히 남았고, 최신 작업 순서는 [진행 상태](../../status.md#남은-작업-순서)에서 관리한다.

## 기술 선택 근거

- 사용자 결정 (2026-10-21): 서버는 Java 25 + Spring Boot 4.1.x의 최신 정식 패치 버전, DB는 PostgreSQL, DB 접근과 동적 조회는 Spring Data JPA + Specification, 서버 빌드는 기존 사용 경험에 따라 Gradle + Groovy DSL(`build.gradle`). [Spring Boot 요구사항](https://docs.spring.io/spring-boot/4.1/system-requirements.html), [Spring Data JPA Specification](https://docs.spring.io/spring-data/jpa/reference/jpa/specifications.html), [Gradle Java 호환성 표](https://docs.gradle.org/current/userguide/compatibility.html)를 참고한다. Java 25에서 Gradle을 실행하려면 Gradle 9.1.0 이상이 필요하며, Spring Boot가 지원하는 9.x 범위에서 세부 버전을 정한다. 정확한 패치 버전 고정 절차와 남은 선택은 §2를 따른다.
- [PostgreSQL 버전 정책](https://www.postgresql.org/support/versioning/): 제품 선택은 확정했으며 메이저·패치 버전은 지원 기간과 호환성을 검토한 뒤 함께 결정한다.
- [Electron 보안 안내](https://www.electronjs.org/docs/latest/tutorial/security), [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage): renderer 격리와 Windows 인증 정보 보호. Windows 보호는 같은 OS 사용자 권한의 모든 프로그램으로부터의 격리를 뜻하지 않는다.
- [electron-builder 플랫폼 빌드 안내](https://www.electron.build/v26/docs/features/multi-platform-build/), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3): Windows 네이티브 의존성을 포함한 빌드·실기 테스트 계획의 근거.
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/): 집 서버 외부 접속 방식. Tunnel이 집 PC 정전·절전·회선 중단을 대신 해결하지는 않는다.
