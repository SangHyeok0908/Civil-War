# LoL 내전 기록 서비스 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 등록된 친구들의 내전을 Windows에서 수집하여 공개 웹사이트에서 전적·활약 랭킹·팀 추천을 제공하고 집 서버에서 운영한다.

**Architecture:** Windows 수집기는 ‘과거 경기 조회’ 버튼으로 LCU 기록을 가져와 서버에 임시 저장하고, 수집자가 확인한 경기만 별도 등록 확정한다. 서버가 인증·중복 방지·등록 상태·통계·평가의 기준이 된다. 웹과 API는 같은 출처로 제공하며 PostgreSQL에 원본·확인된 포지션·평가 버전을 보관한다. 첫 단계인 실제 LCU 검증을 통과한 뒤 데이터 계약과 제품 구현을 시작한다.

**Tech Stack:** 사용자 확정 — 서버 Java 25 + Spring Boot 4.1.x의 최신 정식 패치 버전, 서버 DB PostgreSQL, DB 접근 Spring Data JPA + Specification, 서버 빌드 Gradle + Groovy DSL(`build.gradle`). 기존 운영 합의 — Docker, Cloudflare Tunnel. LCU 검증 도구는 후속 대화에서 Node.js 24로 확정했다. 웹·수집기와 세부 개발 도구는 아래 결정 상태에 따라 별도 논의한다.

**결정 상태 (2026-10-21):** 서버 Java 25 + Spring Boot 4.1.x의 최신 정식 패치 버전, DB PostgreSQL, DB 접근 방식 Spring Data JPA + Specification, 서버 빌드 Gradle + Groovy DSL(`build.gradle`)을 사용자와 확정했다. Gradle은 사용자의 기존 사용 경험을 반영한 선택이다. 이 문서는 기술 스택 논의 중인 개발 계획이며, 남은 기술 선택과 실행 명령을 확정하기 전에는 최종 실행 계획으로 취급하지 않는다. 기존 TypeScript 서버·Fastify·pg 제안은 위 Java 서버 구성으로 교체한다.

**Spec:** [확정 기획서](../specs/2026-10-21-lol-inhouse-design.md). 첫 단계는 [LCU 실기 검증 계획](2026-10-21-lcu-validation-plan.md)이다. 이 문서는 개발 계획이며 제품 코드나 실기 검증 결과가 아니다.

**기술 선택 기록:** 대안별 장단점과 선택 근거는 [기술 스택 선택 근거](../decisions/2026-10-21-tech-stack-decisions.md)에 정리한다.

**2026-10-22 실행 ruling:** [야간 결정 D01–D04](../decisions/2026-10-22-overnight-decisions.md)가 최신 사용자 승인에 따른 한정적 진행 조건이다. 아래의 V2 PASS 전 구현 금지는 단계 1–3 provisional draft에 한해 대체한다. 운영 데이터 계약 확정과 단계 0 종료 기준은 그대로다. C01/C02/C07/C10은 HOLD이며 후속 자동 테스트를 Windows 실측 또는 운영 준비 완료로 취급하지 않는다. 남은 기술 선택은 최신 위임 범위에서 권고안·근거·검증·되돌리기 비용을 기록한 뒤 결정할 수 있다.

## Global Constraints

- 개발 환경은 macOS, 수집 프로그램은 Windows만 지원하며 실제 Windows PC에서 검증한다.
- 약 30명의 등록된 친구 중 10명이 참가하는 소환사의 협곡 5대5 내전만 대상으로 한다. 게스트·복수 계정·시즌은 없다.
- 한 참가자의 수집으로 등록한다. 수집기 실행 시점은 경기 전후와 무관하며, ‘과거 경기 조회’ 버튼을 눌렀을 때 새 기록 조회를 시작한다.
- 조회한 적격 경기는 즉시 서버 임시 저장을 요청하고, 신규 자료는 확인 대기로 보관한다. 동일 경기 자료 재전송은 기존 상태만 응답하고 덮어쓰기·집계·재계산을 하지 않는다.
- 명시적으로 등록한 내전만 집계한다. 참가자별 실제 포지션은 팀당 탑·정글·미드·원딜·서포터 한 명씩 확인한다.
- 공개 조회와 팀 추천은 로그인 없이 제공한다. 온라인 공개 동의 절차는 만들지 않는다.
- 수집자는 최초 개인별 코드로 등록한 기기 인증을 사용한다. LCU 계정 자동 인식 자체를 서버의 로그인 증명으로 취급하지 않는다.
- 등록 후 포지션 수정·등록 취소는 운영자만 가능하다. 원본 경기 수치 수동 편집·취소 복원 UI는 만들지 않는다.
- 전송 대기와 등록 대기는 재시작 후에도 유지하고 연결 복구 또는 다음 실행 시 재시도한다. 서버 임시 저장은 공개·집계하지 않고 명시적 등록 확정 성공 후에만 반영한다.
- 경기별 활약은 확정한 포지션별 가중치를 사용한다. 누적 랭킹은 3경기부터, 그전은 ‘평가 중’, 평균 보정은 k=5다.
- 솔로랭크는 초기 포지션 참고 자료로만, 운영자 초기 실력은 팀 편성에만 사용한다.
- 평가 기준 변경 시 과거 유효 경기·누적 랭킹을 동일 기준으로 재계산한다. 취소 경기는 모든 집계와 실력 보정에서 제외한다.
- 팀 추천은 가능한 포지션을 지키고 실력 균형을 우선하며 서로 다른 선수 구성 최대 3개를 제공한다.
- 운영자 한 명의 코드 인증, 집 Windows의 Docker와 Cloudflare Tunnel, PC 밖 백업·복원을 포함한다.

## Review Focus

1. 서버 저장 후 응답 유실 및 취소 경기의 재전송: 한 경기만 유지하고 취소 상태·기존 포지션을 보존한다 — T02·T06.
2. 등록 대기가 있는 상태에서 LCU 계정 또는 등록 코드 변경: 대기 건의 원래 수집자 권한을 다른 사람에게 이전하지 않는다 — T06·T07.
3. 재계산 도중 등록·취소·포지션 수정 및 프로세스 종료: 오래된 계산을 공개하지 않고 재시작 후 최신 자료로 복구한다 — T09.
4. 팀 킬·피해량이 0, 동일 기록만 있는 초기 표본, 지표 누락: 유한한 보수적 점수와 명시적 결측 상태를 제공한다 — T01·T08.
5. 과거 패치 또는 신규 챔피언·아이템 이미지 부재: 숫자 기록은 표시하고 이미지 실패가 페이지를 막지 않는다 — T11.

---

## 1. 단계와 진행 조건

| 단계 | 작업 | 종료 기준 |
| --- | --- | --- |
| 0. LCU 실기 검증 | 별도 계획 V1–V2 | 실제 Windows 경기 G1–G3의 JSON 구조 확인, 대표 경기 G1의 10명 기록·결과 화면 대조, 필드 맵과 조정된 범위의 PASS 판정. G2·G3 추가 화면·재시작 후 같은 경기 재조회·다른 PC 경기 키 대조는 사용자 결정으로 제외 |
| 1. 기록의 기준 마련 | T01–T04 | 계약·DB·권한·등록·조회·운영자 수정이 통합 테스트로 검증됨 |
| 2. Windows 수집 흐름 | T05–T07 | 조회 버튼 → 서버 임시 저장 → 내전·포지션 확인 → 등록 확정 및 오프라인 순차 재시도 작동 |
| 3. 평가·추천·웹 완성 | T08–T12 | 전 경기 재계산, 3경기 랭킹, 팀 추천, 공개/관리 화면 작동 |
| 4. 설치·배포 | T13–T14 | Windows 설치/업데이트, 외부 HTTPS, 서버 재부팅, 외부 백업 복원 확인 |
| 5. 실제 시범 운영 | T15 | 실제 내전 3–5경기 대조, 평가 보정 및 운영 절차 확인 |

기존에는 단계 0 PASS 전 서비스 스캐폴딩·프레임워크 설치·DB 구현을 금지했다. 최신 사용자 승인/D01로 단계 1–3 provisional draft 개발만 예외 허용한다. 핵심 수집 요구가 실패하면 대안과 범위 변경점을 먼저 정리한다. 경기 전 상시 실행이나 수동 전적 입력으로 조용히 대체하지 않는다. 실제 내전 일정이 필요하므로 실측의 달력상 완료일을 약속하지 않는다.

## 2. 기술 결정과 파일 책임

| 영역 | 결정 상태 |
| --- | --- |
| 서버 프레임워크·언어 | **사용자 확정: Java 25 + Spring Boot 4.1.x의 최신 정식 패치 버전** |
| 서버 DB | **사용자 확정: PostgreSQL** |
| DB 접근·동적 조회 | **사용자 확정: Spring Data JPA + Specification** |
| 서버 빌드 | **사용자 확정: Gradle + Groovy DSL(`build.gradle`)** |
| 운영 환경 | 기존 합의: 집 Windows의 Docker, Cloudflare Tunnel |
| JDK 배포판·PostgreSQL·Gradle 세부 버전 | 별도 논의; Gradle은 Java 25 실행을 지원하는 9.1.0 이상의 9.x 범위에서 선택. 이전 PostgreSQL 17 제안을 확정으로 간주하지 않음 |
| 서버 마이그레이션·테스트 도구 | 별도 논의; 이번 빌드 도구 결정에 포함하지 않음 |
| 웹 | 기존 제안: React/Vite + TypeScript; 사용자와 별도 결정 |
| Windows 수집기·로컬 저장 | 기존 제안: Electron/TypeScript + SQLite/better-sqlite3; 사용자와 별도 결정 |
| 클라이언트 프로젝트 관리·테스트 | 기존 제안: pnpm workspace, Vitest/Playwright; 사용자와 별도 결정 |
| LCU 검증 도구 | **사용자 확정: Node.js 24**. JavaScript ESM·내장 HTTPS/파일 API·node:test로 구현. Windows 실측은 추후 진행 |

Java 주 버전은 25, Spring Boot 계열은 4.1.x로 확정했다. T01의 서버 프로젝트 생성 시 공식 릴리스를 확인하여 당시 최신 정식 4.1.x 패치의 정확한 버전을 `build.gradle`에 고정한다. `4.1.+` 같은 동적 버전, Milestone·RC·SNAPSHOT은 사용하지 않는다. JDK 배포판과 사용할 Java 25 업데이트 버전도 빌드·배포 환경에 기록한다. Gradle Java toolchain은 25로 맞추고 서버 실행 환경도 Java 25를 사용한다. 이후 패치 갱신은 버전 변경과 검증을 통해 적용하며, Spring Boot 4.2 이상으로 계열을 바꾸는 선택은 별도 논의한다.

서버의 입력 검증·정규화·평가·누적 통계·팀 추천은 Java에서 수행한다. 웹·수집기와는 HTTP/JSON 계약 및 검증된 fixture로 연결하며, 서버와 클라이언트가 TypeScript 소스나 평가 함수를 직접 공유한다는 전제는 제거한다. API 계약 표현·클라이언트 타입 생성 방식은 별도 결정한다. 클라이언트의 사전 검사와 별개로 서버가 입력을 최종 검증한다.

일반적인 저장·변경과 조회는 Spring Data JPA를 사용하고, 선수·챔피언·포지션·승패처럼 선택적으로 조합하는 조회 조건은 Specification으로 구성한다. 형태가 고정된 조회는 쿼리 메서드나 JPQL을 사용한다. PostgreSQL 전용 처리를 위한 제한적 Native SQL은 필요 시 검토할 보완 제안이며, 이번 사용자 결정은 JPA + Specification이다. 평가·팀 추천 계산은 Java 도메인 로직에 둔다.

웹·수집기 작업에 남아 있는 TypeScript, React, Electron 경로와 명령은 기존 후보를 유지했을 때의 초안이다. 해당 선택이 확정된 뒤 경로·의존성·실행 명령을 확정한다. Electron/네이티브 SQLite 후보를 채택하면 Windows 설치 파일과 네이티브 모듈을 실제 Windows에서 빌드·시험한다. 첫 배포 대상 아키텍처는 V2에서 확인한 PC에 맞춘다.

서버 한 컨테이너가 API와 빌드된 웹을 제공하고, 별도 Redis·메시지 브로커 없이 PostgreSQL 작업 테이블과 서버 내부 작업자로 재계산하는 구성은 기존 설계 제안으로 유지한다. PostgreSQL은 이름 있는 볼륨을 사용한다. 세부 버전을 결정한 뒤 Gradle Wrapper 버전, Java 의존성과 컨테이너 이미지를 재현 가능하게 고정하며, 클라이언트 의존성도 선택한 도구에 맞춰 고정한다.

아래 Java 경로·클래스 이름은 책임을 구분하기 위한 계획 작성자의 제안이며, 사용자 확정 기술 선택과 구분한다. `apps/server/`를 독립 Gradle 프로젝트로 두고 `build.gradle`, `settings.gradle`과 Gradle Wrapper를 관리한다. `apps/server/src/main/java/cw/`를 서버 소스, `apps/server/src/test/java/cw/`를 서버 테스트 루트로 제안한다. 서버 검증 명령은 아래 Gradle Wrapper 기준을 사용하고, 테스트 프레임워크와 의존성은 별도 결정한다.

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

T01에서 아래 언어 중립 데이터 계약을 Java 모델과 입력 검증으로 구현한다. 웹·수집기 모델과는 동일한 JSON 필드·오류·fixture를 기준으로 일치시킨다. ID는 서버 Java와 API 모두 문자열로 보존하며 시간은 UTC ISO 8601로 교환하고 웹에서 한국 시간으로 표시한다.

| 이름 | 필수 계약 |
| --- | --- |
| `Role` | `TOP / JUNGLE / MIDDLE / BOTTOM / UTILITY` |
| `Member` | id, puuid, riotId, displayName, active, primaryRole/secondaryRole(nullable), allowedRoles, seedSkill(0–100), profileRevision |
| `NormalizedMatch` | schemaVersion, platformId, gameId, startedAtUtc, durationSeconds, mapId, gameType, patch, participants |
| `ParticipantRecord` | puuid, teamId, win, championId, kills/deaths/assists, championDamage, damageTaken, laneCs/neutralCs, goldEarned, visionScore, objectiveDamage/turretDamage, items |
| `IngestMatchInput` | rawMatch(검증 전 JSON), clientSubmissionId, schemaVersion. 서버가 재정규화하여 적격 신규 경기를 pending으로 저장; 확정 포지션은 요구하지 않음 |
| `IngestMatchAck` | matchKey, state(`pending / registered / canceled`), disposition(`created_pending / already_pending / already_registered / already_canceled`) |
| `ConfirmationInput` | matchKey, rolesByPuuid, clientSubmissionId. 이미 저장된 경기의 내전 여부를 명시적으로 확인하고 실제 포지션을 확정하는 요청 |
| `CollectorMatch` | matchKey, state, match(NormalizedMatch), confirmedRoles(nullable); 해당 경기 참가자 자격의 수집기와 운영자에게만 제공 |
| `CollectorPrincipal` | memberId, credentialId, puuid. 서버가 기기 인증에서 도출하고 요청 본문 값을 신뢰하지 않음 |
| `RegistrationAck` | matchKey, disposition(`created / already_registered`), sourceRevision |
| `PublicMatch` | 표시용 회원 ID/이름·10명 기록·확인 포지션·평가 상태·기준 버전; PUUID·원본·인증 정보 제외 |
| `RoleReferenceSample` | puuid, source(`solo420 / inhouse`), gameId, playedAt, role(nullable), evidence; 평가 점수·실력 입력에 사용하지 않음 |
| `EvaluableMatch` | NormalizedMatch의 참가자마다 memberId와 최종 role을 연결한 경기. 현재 등록 상태가 유효한 경기만 포함 |
| `ScoringRuleSet` | id, algorithmVersion, weightsByRole, metricMix, normalization, cumulativePrior(초기 5). 항목 내부 비율·표준화 상수까지 버전별로 보관 |
| `EvaluationInput` | sourceRevision, scoringVersion(규칙 ID), rules(ScoringRuleSet), matches(EvaluableMatch[]), members(Member[]) |
| `EvaluationGeneration` | id, sourceRevision, scoringVersion, gameScores, memberStats, roleSkills |
| `TeamRecommendation` | candidates(최대 3개), reason(nullable), sourceRevision; 후보는 두 팀의 memberId/role과 실력 차이를 포함 |

`MatchKey = platformId + ':' + gameId`. gameId는 문자열로 교환하며, TypeScript 클라이언트를 선택하더라도 JavaScript Number로 바꾸지 않는다. `NormalizedMatch`의 원본 JSON 경로와 필수 여부는 V2 필드 맵이 결정한다. 누락은 `null/validation issue`로 남기고 0으로 채우지 않는다. 현재 가중치에 필요한 필드가 확보되지 않으면 평가 기준 변경을 먼저 확인한다.

에러 응답은 `{code, message, retryable, details?}`로 통일한다. 최소 코드는 `INVALID_MATCH`, `UNREGISTERED_PARTICIPANT`, `ACCOUNT_MISMATCH`, `MATCH_CANCELED`, `AUTH_REVOKED`, `UNSUPPORTED_SCHEMA`, `RECALCULATING`이다. 수집기는 HTTP 상태만으로 모든 실패를 재전송하지 않는다.

### 인증 기본값

- 코드: 32바이트 난수의 base64url, 서버에는 해시만 저장, 원자적으로 1회 소비. 운영자 코드는 30분, 수집자 코드는 24시간 유효.
- 운영자: `__Host-cw-admin` 쿠키, Secure/HttpOnly/SameSite=Strict/Path=/, 비활동 7일·절대 30일 만료. 로그아웃·개별/전체 인증 폐기 지원.
- 운영자 쓰기 요청: 같은 출처 확인과 CSRF 토큰 검증. 코드 입력 실패는 IP 기준 10분 내 5회 이후 제한하며 정상 인증 후 재설정한다. 신뢰 프록시 범위를 배포에서 고정한다.
- 수집기: 코드와 교환한 별도 기기 토큰을 Windows 보호 저장소에 보관. 활성 상태에서는 반복 로그인을 요구하지 않으며 운영자가 폐기할 수 있다. 토큰 회전 시 기존 기기 소유자는 바뀌지 않는다.
- 서버 로컬 관리 명령은 Java 애플리케이션으로 제공한다. `admin:code` 발급 및 `admin:code --revoke-all` 복구 동작을 유지하고, 실제 실행 구문은 T03의 CLI 진입점과 인자 전달 방식을 구체화할 때 기록한다. 새 운영자를 만들지 않고 한 운영자의 브라우저 인증만 추가한다.
- 운영자가 LCU 계정을 인식했다고 웹 운영자 권한을 주지 않는다. 클라이언트가 전달하는 경기 자료는 친구 모임 수집기를 신뢰하는 모델이며 Riot의 서명된 전적 증명은 아니다.

### 저장과 일관성

`members`, `enrollment_codes`, `admin_sessions`, `collector_credentials`, `matches`, `match_participants`, `role_reference_samples`, `audit_log`, `scoring_versions`, `service_state`, `recalculation_jobs`, `evaluation_generations`와 세대별 점수/통계 테이블을 둔다. 경기 상태는 `pending / registered / canceled`이며 pending의 확정 포지션은 null이다. 경기 원본과 확인된 포지션을 분리한다. `(platform_id, game_id)`는 모든 상태에 걸쳐 DB UNIQUE이며 취소 행도 유지한다.

임시 저장은 원본·정규화 자료·수집자 감사 정보만 기록하고 평가용 `source_revision`을 올리지 않는다. 같은 키의 자료 재전송은 원본·상태·포지션을 변경하지 않고 현재 상태를 응답한다. 실제 포지션과 내전 여부를 명시적으로 확인하는 별도 요청만 pending을 registered로 한 번 전환한다. 참가자 중 인증된 수집자라면 임시 저장한 사람과 달라도 확인할 수 있고, 동시 확정 요청에서는 첫 확정만 적용한다.

등록 확정/운영자 수정/취소/평가 기준/팀 실력 입력 변경은 트랜잭션 안에서 `source_revision`을 올리고 재계산 작업을 기록한다. 중복 자료 전송이나 중복 확정 요청은 revision/job을 추가하지 않는다. 새 세대 완성 전 공개 점수·누적 통계·팀 추천은 ‘계산 중’으로 응답한다. 공개 전적과 모든 집계 입력은 `state=registered`만 선택한다. pending은 해당 경기의 인증된 참가자·운영자만 조회하며, 취소 경기는 즉시 공개에서 제외한다.

## 4. 작업별 구현 계획

각 작업의 테스트 이름은 Java 서버에서는 테스트 메서드명, TypeScript 후보에서는 테스트 케이스명으로 사용한다. 테스트용 fixture/팩토리는 같은 테스트 디렉터리에 둔다. T01에서 명시한 공통 설정은 이후 작업의 파일 목록에 반복하지 않는다. 각 커밋은 해당 작업 파일만 stage하고 `git diff --cached --check`를 통과시킨다.

Java 서버는 pnpm workspace에 포함하지 않는다. 클라이언트에 pnpm을 채택할 경우 `@cw/contracts`, `@cw/lcu`, `@cw/web`, `@cw/collector`를 후보 이름으로 사용한다. 아래 pnpm 명령은 해당 클라이언트 후보에만 적용한다. 현재 문서의 미정 항목은 후속 대화 대상이며 구현자가 기술 제품을 임의로 확정하는 위임이 아니다.

서버 명령은 저장소 루트에서 Gradle Wrapper로 실행한다. 아래는 macOS 기준이며 Windows PowerShell에서는 실행 파일을 `.\apps\server\gradlew.bat`로 바꾸고 같은 인자를 전달한다. T01에서 Wrapper·Java 플러그인·선택한 테스트 프레임워크를 설정한 뒤 사용한다.

| 목적 | 명령 |
| --- | --- |
| 서버·테스트 소스 컴파일 | `./apps/server/gradlew -p apps/server classes testClasses` |
| 특정 테스트 클래스 실행 예시 | `./apps/server/gradlew -p apps/server test --tests 'cw.lcu.MatchNormalizerTest'` |
| 서버 단위·통합 테스트 전체 | `./apps/server/gradlew -p apps/server test` |
| 실행 JAR 패키징 | `./apps/server/gradlew -p apps/server bootJar` |
| 서버 전체 검증·패키징 | `./apps/server/gradlew -p apps/server build` |

각 작업에서 Java 테스트 클래스 실행을 지시하면 `test --tests '패키지를 포함한 클래스명'`을 사용한다. 여러 클래스는 `--tests`를 반복한다. 현재 계획의 단위·통합 테스트는 모두 `src/test/java`에 두고 `test` 작업으로 실행하며, 통합 테스트에는 T02의 전용 PostgreSQL 환경이 필요하다. `bootJar`와 전체 `build`는 Spring Boot 플러그인 설정 및 T03의 애플리케이션 진입점 구현 후 사용한다. 이 명령들은 후속 구현용이며 현재 실행 가능한 서버 프로젝트가 생성된 상태는 아니다.

### T01. 검증된 경기 계약과 정규화

**Files:** Create `apps/server/build.gradle`, `apps/server/settings.gradle`, `apps/server/gradlew`, `apps/server/gradlew.bat`, `apps/server/gradle/wrapper/gradle-wrapper.jar`, `apps/server/gradle/wrapper/gradle-wrapper.properties`, `apps/server/src/main/java/cw/contracts/`의 경기·회원·인증·평가·팀 모델, `apps/server/src/main/java/cw/lcu/MatchNormalizer.java`, `apps/server/src/main/java/cw/matches/MatchInputValidator.java`; Test `apps/server/src/test/java/cw/lcu/MatchNormalizerTest.java`. Wrapper 파일은 선택한 Gradle 버전의 공식 Wrapper 작업으로 생성한다. Modify `.gitignore`.

**Interfaces:** 운영 확정 시 V2 `fixtures/lcu/verified/*`와 필드 맵을 소비한다. HOLD 중 draft는 `fixtures/lcu/candidates/h2-20261021/*`와 [후보 계약](../../validation/lcu-candidate-contract.md)을 사용하며 합성 metadata와 미확정 의미를 유지한다. Produces `normalizeMatch(rawJson) -> NormalizedMatch`, `validateIngest(input) -> ValidationResult`, `validateConfirmation(input, match) -> ValidationResult`의 Java 구현과 위 JSON 계약. `ValidationResult={ok,issues:[{path,code}]}`. 정규화 실패는 같은 issues 구조를 가진 `MatchValidationError`로 반환하고 validator는 이를 결과로 변환한다. rawJson의 Java 자료형은 JSON 처리 도구 결정 시 확정한다.

- [ ] **1. 정규화 테스트를 작성한다.** `completeTenPlayers`, `rejectNineOrDuplicatePlayers`, `missingIsNotZero`, `preserveStringGameId`: 참가자 수 10, 경기 ID 원문 문자열과 동일, 시야 점수 누락 시 `participants.0.visionScore/REQUIRED` 오류를 검증한다. 숫자 범위·팀당 5명·양 팀 승패 일치·양의 경기 시간을 포함한다.
- [ ] **2. Gradle 설정 후 테스트 실패를 확인한다.** `./apps/server/gradlew -p apps/server test --tests 'cw.lcu.MatchNormalizerTest'` → 미구현 정규화로 실패. 테스트 환경 오류를 기능 실패로 간주하지 않는다. 이 단계 이전에 확정된 Java 25·Spring Boot 4.1.x 정책에 따라 정확한 패치 버전을 기록하고, JDK 배포판·Gradle 세부 버전과 JSON 처리·검증·테스트 도구를 확정한다.
- [ ] **3. 필드 맵으로 Java 정규화와 입력 검증을 구현한다.** 사용자 설정/SR 구분값은 V2에서 확인한 값을 사용한다. 아이템 빈 슬롯과 없는 필드를 구별한다. 원본과 UI 수치는 자동 수집값만 사용한다. 이후 어댑터를 변경해도 저장된 과거 원본과 미전송 대기를 읽을 수 있도록 schemaVersion별 디코더를 유지한다. 클라이언트 사전 검사와 서버 최종 검증은 같은 fixture와 기대 결과를 사용한다.
- [ ] **4. 서버 컴파일·단위 테스트를 통과한다.** `./apps/server/gradlew -p apps/server classes testClasses`와 위 `MatchNormalizerTest` 실행 → PASS. 실행 JAR 패키징은 T03에서 애플리케이션 진입점을 구현한 뒤 검증한다. 클라이언트 타입 검사·테스트·빌드 명령은 해당 도구를 확정한 뒤 기록한다.
- [ ] **5. 커밋한다.** `feat: define verified match contracts and normalization`.

### T02. PostgreSQL 임시 저장·등록 확정과 중복 무반영

**Files:** Create `infra/compose.test.yml`, `apps/server/src/main/java/cw/db/DatabaseConfiguration.java`, `apps/server/src/main/resources/db/migrations/001-core.sql`, `apps/server/src/main/java/cw/matches/{MatchEntity,MatchParticipantEntity,IngestService,RegistrationService,CollectorMatchQuery,MatchRepository}.java`, `apps/server/src/test/java/cw/matches/RegistrationIntegrationTest.java`, `apps/server/src/test/java/cw/support/DatabaseTestSupport.java`.

**Interfaces:** Consumes T01 계약/정규화. Produces `ingestMatch(input, actor) -> IngestMatchAck`, `registerMatch(input, actor) -> RegistrationAck`, `getCollectorMatch(key, actor) -> CollectorMatch`의 Java 서비스, `JpaRepository` 기반 `MatchRepository`. T04의 동적 조회를 위해 `JpaSpecificationExecutor<MatchEntity>`를 함께 지원한다. 테스트 DB 설정은 `DatabaseTestSupport`에서 로드하며 OS별 쉘 환경변수 문법에 의존하지 않는다.

- [ ] **1. 실제 DB 트랜잭션 테스트를 작성한다.** `pendingExcludedUntilConfirmed`, `concurrentDuplicateIngest`, `concurrentConfirmation`, `retryAfterLostReply`, `duplicateDoesNotRecalculate`, `retryCannotChangeRoles`, `canceledCannotReturn`, `allTenMustBeMembers`: 경기 수 1, pending 수신 전후 revision 동일, 중복 확정 후 revision 불변, 최초 확정 포지션 보존, 취소 경기 재수신 후 canceled 유지. 비참가자의 조회·확정 거절과 다른 인증된 참가자의 확정 허용도 검사한다.
- [ ] **2. 실패를 확인한다.** `docker compose -f infra/compose.test.yml up -d --wait`, Java `RegistrationIntegrationTest` 실행 → 등록 함수 미구현으로 실패. 테스트 DB는 운영 DB와 다른 이름·포트·볼륨을 사용한다.
- [ ] **3. JPA 매핑·DB UNIQUE·서비스 트랜잭션으로 두 단계를 구현한다.** 신규 ingest는 원본+정규화 자료+pending 상태+감사 이력을 저장하고, 등록 확정은 역할 검증 후 상태 전환+확정 포지션+감사 이력+revision/job을 함께 기록한다. ingest 충돌 시 상태를 읽어 응답하고 UPDATE하지 않는다. registered의 재확정은 already_registered, canceled의 ingest는 already_canceled, canceled의 확정은 409/MATCH_CANCELED다. 서버는 ingest 원본을 검증하며 확정 요청에서는 저장된 원본을 사용한다.
- [ ] **4. 동시 요청과 롤백을 검증한다.** 동일 명령 → PASS; 중간 저장 오류 시 참가자 일부나 재계산 작업만 남지 않아야 한다.
- [ ] **5. 커밋한다.** `feat: persist idempotent inhouse registrations`.

### T03. 코드 인증·회원 관리 API와 로컬 복구

**Files:** Create `apps/server/src/main/java/cw/CivilWarApplication.java`, `apps/server/src/main/java/cw/auth/{EnrollmentCodeService,AdminSessionService,CollectorCredentialService,AuthController}.java`, `apps/server/src/main/java/cw/cli/AdminCodeCommand.java`, `apps/server/src/main/java/cw/members/{MemberRepository,MemberController}.java`; Test `apps/server/src/test/java/cw/auth/AuthMembersIntegrationTest.java`.

**Interfaces:** Consumes T02 DB. Produces `POST /api/admin/session`, `POST /api/collector/enroll`, `POST /api/admin/codes`, `DELETE /api/admin/sessions/:id`, `DELETE /api/admin/collector-credentials/:id`, `GET/POST/PATCH /api/admin/members[/:id]`, `GET /api/collector/members`, `POST /api/collector/matches/ingest`, `GET /api/collector/matches?state=pending`, `GET /api/collector/matches/:key`, `POST /api/collector/matches/:key/confirm`, `POST /api/admin/logout`. 경기 API는 T02를 사용한다. `requireAdmin()`/`requireCollector()`가 검증한 principal을 반환한다. 수집기 enroll은 `{code,currentPuuid}`를 받아 `{token,memberId,credentialId,puuid}`를 반환한다. 수집기 경기 조회는 본인이 참가한 경기로 제한하고, 인증된 회원 명단 조회만 매칭용 PUUID를 제공한다.

- [ ] **1. 인증·등록 테스트를 작성한다.** `oneUseAtomic`, `codeScopeIsolation`, `expiredAndRevoked`, `csrfAndOrigin`, `localRecovery`, `memberIdentityStable`: 동시 코드 소비 성공 1회, 수집자 자격의 관리자 접근 403, 이름 변경 전후 회원 ID 동일. 비밀값 로그 부재와 seedSkill 범위를 확인한다.
- [ ] **2. 실패를 확인한다.** Java `AuthMembersIntegrationTest` 실행 → 라우트/인증 미구현으로 실패.
- [ ] **3. 인증 기본값과 API를 구현한다.** 가입 시 코드 소유 회원과 현재 LCU PUUID를 대조한다. seedSkill은 운영자가 입력하며 자동 티어 추정은 하지 않는다. 회원 비활성화로 과거 기록을 삭제하지 않는다. rate limit·요청 본문 상한·로그 비밀값 제거를 Spring Boot 서버의 공통 요청 처리 설정에 넣는다. 개발 HTTP 쿠키 예외는 개발 모드에서만 허용한다.
- [ ] **4. 복구 CLI까지 검증한다.** 테스트 → PASS; 테스트 DB를 대상으로 Java 관리 명령의 `admin:code --revoke-all` 복구 동작 실행 후 이전 운영자 세션·미소비 운영자 코드는 거절되어야 한다. 새 코드는 명령 실행자의 터미널에 한 번만 표시하고 일반 로그에 저장하지 않는다.
- [ ] **5. 커밋한다.** `feat: add scoped enrollment and owner administration`.

### T04. 전적 조회·운영자 포지션 정정·등록 취소

**Files:** Create `apps/server/src/main/java/cw/matches/{PublicMatchQuery,MatchSpecifications,AdminMatchService,MatchController}.java`; Test `apps/server/src/test/java/cw/matches/MatchAccessIntegrationTest.java`.

**Interfaces:** Consumes T02 저장/T03 인증. Produces `GET /api/matches`, `GET /api/matches/:key`, `GET /api/members`, `GET /api/members/:id/matches`, `PATCH /api/admin/matches/:key/roles`, `POST /api/admin/matches/:key/cancel`. 목록은 cursor/limit(기본 20, 최대 100), memberId·championId·role·win 필터를 지원한다.

- [ ] **1. 권한·공개 범위·동적 조회 테스트를 작성한다.** `publicSafeDto`, `pendingNotPublic`, `onlyOwnerEdits`, `cancelHidesImmediately`, `profileRoleDoesNotRewriteHistory`: 공개 JSON의 PUUID 부재, pending/canceled 공개 조회 404, 수집자의 수정 요청 403 응답을 확인한다. `optionalFiltersCompose`와 `filteredMatchesAppearOnce`는 조건 없음·단일 조건·복합 조건, 같은 참가자에 대한 선수/챔피언/포지션/승패 조건 적용, 참가자 조인 후 경기 중복 및 페이지 누락 방지를 검증한다.
- [ ] **2. 실패를 확인한다.** Java `MatchAccessIntegrationTest` 실행 → 미구현 라우트로 실패.
- [ ] **3. Specification 기반 조회 DTO와 JPA 운영자 변경을 구현한다.** `MatchSpecifications`에서 선택된 필터를 조합한다. 공개 목록의 registered 조건은 모든 필터 조합에 적용하고, 운영자는 확인 대기·취소 자료와 변경 이력도 조회한다. 등록 완료 경기의 포지션 정정은 양 팀 각 역할 1명 검증 후 감사 이력과 revision/job을 함께 기록한다. 수치 수정·취소 복원 엔드포인트는 만들지 않는다.
- [ ] **4. 검증한다.** 테스트 → PASS; 등록 수치·포지션·취소 상태·감사 이력이 트랜잭션 단위로 일치하고 공개에 원본/인증값이 나오지 않아야 한다.
- [ ] **5. 커밋한다.** `feat: expose match records and owner corrections`.

### T05. Windows LCU 연결·계정 인식·기기 인증 보호

**Files:** TypeScript/Electron 후보 채택 시 Create `apps/collector/src/main/{main,lcu-client,credential-store,reference-export}.ts`, `apps/collector/src/preload/index.ts`, `packages/contracts/src/`의 클라이언트 계약 모델, `packages/lcu/src/{normalize-match,role-reference}.ts`; Test `apps/collector/src/main/lcu-bridge.test.ts`, `packages/lcu/src/{normalize-match,role-reference}.test.ts`. 클라이언트 workspace·빌드·테스트 설정 파일은 도구 선택 후 이 작업에 포함한다.

**Interfaces:** Consumes V1 연결 원칙/T01 JSON 계약·fixture/T03 enroll. 수집기 사전 검사와 오프라인 표시는 V2 필드 맵에 따라 별도 구현하며 Java 서버 코드를 직접 호출하지 않는다. Produces main 내부 조회 함수 `getAccount()`, `listPastMatches()`, `getMatch(gameId)`와 제한된 IPC `getAccount()`, `enroll(code)`, `exportMemberReferences(selection)`. T07의 버튼 IPC가 main 조회 함수를 조합한다. `CredentialStore.load(): Promise<{token,memberId,credentialId,puuid}|null>`. 참고 자료 내보내기는 회원 식별 정보와 `RoleReferenceSample[]`만 담으며 관리자 웹에서 가져온다.

- [ ] **1. 연결·인증 분리 테스트를 작성한다.** `clientStopped`, `portChanged`, `noTokenInRenderer`, `accountMismatch`, `soloReferenceOnly`, `noHistoryFetchOnLaunch`: `expect(rendererAccount).not.toHaveProperty('token')`, `expect(mismatch.code).toBe('ACCOUNT_MISMATCH')`, `expect(reference.source).toBe('solo420')`, `expect(historyRequestsOnLaunch).toBe(0)`. 토큰 복호화 실패는 재등록 안내이며 평문 저장으로 우회하지 않는다.
- [ ] **2. 실패를 확인한다.** pnpm/Vitest 후보 채택 시 `pnpm exec vitest run apps/collector/src/main/lcu-bridge.test.ts packages/lcu/src/normalize-match.test.ts packages/lcu/src/role-reference.test.ts` → 미구현으로 실패. 클라이언트 정규화는 T01과 동일한 fixture에서 참가자 10명·문자열 경기 ID·0과 누락 구분이 일치하는지 검증한다.
- [ ] **3. main 전용 LCU·인증 저장과 읽기 IPC를 구현한다.** Electron contextIsolation/sandbox를 켜고 nodeIntegration은 끈다. Windows safeStorage로 보호한 토큰만 로컬에 보관한다. 솔로랭크 조회는 V2에서 검증된 범위만 사용하고, 자료가 없으면 이유를 반환한다. 친구 목록 조회는 구현 범위에서 제외하며 참가자 식별에는 경기 상세의 식별 정보를 사용한다. 온라인 서버 없이도 LCU 조회는 가능해야 한다. 앱 실행 시 계정 인식만 수행하고 새로운 경기 기록 조회는 버튼 요청 때만 시작한다.
- [ ] **4. fixture 테스트와 Windows 연결 확인을 수행한다.** 테스트 → PASS. 실제 Windows에서 클라이언트 꺼짐·로그아웃·재시작을 확인하고 renderer 개발자 도구에 토큰이 노출되지 않는지 점검한다.
- [ ] **5. 커밋한다.** `feat: connect Windows collector to verified LCU data`.

### T06. 재시작에 견디는 임시 저장·등록 확정 요청 큐

**Files:** Create `apps/collector/src/main/{outbox,outbox-migrations,uploader}.ts`; Test `apps/collector/src/main/outbox.test.ts`.

**Interfaces:** Consumes T05 credential/T03 ingest·confirm API. Produces `enqueueCollected(input: IngestMatchInput, actor: CollectorPrincipal): Promise<OutboxItem>`, `enqueueConfirmation(input: ConfirmationInput, actor: CollectorPrincipal): Promise<OutboxItem>`, `drainOutbox(): Promise<void>`, `listOutbox(): OutboxItem[]`. OutboxItem은 kind(`ingest / confirm`), state(`pending / sending / succeeded / needs_attention`), 원래 memberId·credentialId·matchKey·요청 자료·선행 ingest 작업 ID를 가진다. 같은 회원·경기·kind의 미완료 요청은 합치며, 이미 확정 대기 중인 포지션을 재조회로 덮어쓰지 않는다.

- [ ] **1. 파일 기반 SQLite 테스트를 작성한다.** `survivesRestart`, `lostIngestAndConfirmAck`, `confirmWaitsForIngest`, `ingestDoesNotAutoConfirm`, `repeatedQueryCoalesces`, `switchedAccountCannotAdopt`, `canceledStopsRetry`, `restartFlushDoesNotFetchLCU`: `expect(reopened.roles).toEqual(confirmedRoles)`, `expect(serverCount).toBe(1)`, `expect(sentKinds).toEqual(['ingest','confirm'])`, `expect(confirmWithoutUserAction).toBe(false)`, `expect(sentWithOtherCredential).toBe(false)`, `expect(canceled.retryScheduled).toBe(false)`. 강제 종료된 sending 작업도 다음 실행에 회복되며, 재전송 때문에 새로운 LCU 경기 조회를 시작하지 않아야 한다.
- [ ] **2. 실패를 확인한다.** `pnpm exec vitest run apps/collector/src/main/outbox.test.ts` → 저장/전송 미구현으로 실패.
- [ ] **3. SQLite 트랜잭션과 단일 전송 작업자를 구현한다.** 조회 버튼으로 가져온 적격 자료는 즉시 durable ingest 작업으로 저장하고 서버 전송을 시도한다. 명시적 내전 등록 클릭만 confirm 작업을 추가한다. 서버 상태 pending 확인 후 confirm을 전송하고, 이미 registered이면 완료로 처리하며 canceled이면 표시 후 전송을 종료한다. 네트워크/5xx는 5초→15초→1분→5분→15분 상한 및 jitter, 429는 Retry-After로 재시도한다. 인증/자료 오류는 확인 필요로 전환한다. 같은 회원의 새 자격으로만 명시적 재개를 허용하며 확보한 자료의 전송은 LCU가 꺼져 있어도 가능하다.
- [ ] **4. 저장·복구를 검증한다.** 테스트 → PASS. ingest 성공은 UI의 ‘확인 대기’, confirm 성공 또는 서버의 already_registered 응답만 ‘등록 완료’로 표시한다. 이미 canceled라는 응답은 ‘등록 취소’로 표시하며 자동 복원하지 않는다. 등록 완료 건의 큰 원본은 30일 뒤 정리하고 승인 키/상태는 남긴다. 미등록 자료는 자동 삭제하지 않는다. 로컬 디스크 저장 실패 시 ‘전송 대기 저장 실패’를 표시하고 저장 성공으로 안내하지 않는다.
- [ ] **5. 커밋한다.** `feat: persist confirmed matches and retry safely`.

### T07. 수집기 확인·등록 화면과 실제 Windows 흐름

**Files:** Create `apps/collector/src/renderer/{App,AccountView,MatchList,MatchReview,OutboxView}.tsx`, `apps/collector/src/preload/collector-api.ts`, `apps/collector/src/main/history-sync.ts`; Test `tests/e2e/collector.spec.ts`.

**Interfaces:** Consumes T05 main 조회 함수/T06 요청 큐/T03 회원·확인 대기 API. Produces `queryPastMatches(): Promise<HistorySyncResult>`, `loadPendingMatches(): Promise<CollectorMatch[]>`, `confirmRegistration(matchKey, rolesByPuuid)` IPC. HistorySyncResult는 경기별 matchKey·전송 상태·실패 이유를 담는다. 조회 후 적격 자료는 enqueueCollected, 등록 확인 후에는 enqueueConfirmation을 호출한다. 계정·참가 여부를 main에서 검사하고 회원 명단의 마지막 정상 응답을 캐시한다. UI에는 rawMatch 편집 기능을 노출하지 않는다.

- [ ] **1. 사용자 흐름 테스트를 작성한다.** `buttonFetchesAndStages`, `noAutoRegistration`, `allRolesConfirmed`, `offlineThenResume`, `queryFailureIsNotPending`, `duplicateShowsExistingState`: `expect(historyRequestsBeforeClick).toBe(0)`, `expect(afterQuery.serverState).toBe('pending')`, `expect(afterQuery.publicMatchCount).toBe(0)`, `expect(afterConfirmAck).toContain('등록 완료')`. 미등록 회원·다른 LCU 계정·클라이언트 종료, 서버에 이미 저장된 pending 재표시와 registered/canceled 안내도 포함한다.
- [ ] **2. 실패를 확인한다.** `pnpm test:e2e -- tests/e2e/collector.spec.ts` → 화면/IPC 미구현으로 실패. 자동 테스트는 고정 fixture IPC를 사용하며 실제 LCU 검증과 구분한다.
- [ ] **3. 최초 코드 입력→자동 계정 인식→‘과거 경기 조회’→서버 임시 저장→5+5 비교→내전·실제 역할 확인→‘내전 등록’ 흐름을 구현한다.** 전송 대기/확인 대기/등록 대기/등록 완료/등록 취소를 구분한다. 모임 내전이 아닌 경기나 재경기는 확정하지 않으면 집계되지 않는다. 확인 대기 목록은 서버에서 다시 불러올 수 있어 LCU의 과거 경기 목록에서 사라진 뒤에도 확인할 수 있다. 인터넷이 없을 때 회원 명단 캐시로 미리 검사하고 서버에서 최종 검증한다. 최초 기기 인증은 온라인에서 수행한다.
- [ ] **4. 자동 테스트와 Windows 통합 흐름을 확인한다.** 테스트 → PASS. 실제 Windows에서 서버 차단→조회 버튼→전송 대기→수집자 확인→등록 대기→프로그램 종료→재실행→연결 복구 후 임시 저장·등록 확정 순차 성공을 확인한다. 수집자가 확인하지 않은 자료는 복구 후에도 확인 대기로 남아야 한다. 반복 조회·다른 참가자의 전송으로 기존 점수와 역할이 바뀌지 않아야 한다.
- [ ] **5. 커밋한다.** `feat: add collector review and registration workflow`.

### T08. 포지션별 평가·누적 통계 순수 함수

**현재 draft 정책:** [D04](../decisions/2026-10-22-overnight-decisions.md)의 `objective-provisional-v1`을 적용한다. TOP은 turretDamage, 나머지는 objectiveDamage만 사용하며 MIDDLE/BOTTOM의 이전 50:50 혼합은 보류한다. 바깥 가중치는 유지한다. 테스트는 선택하지 않은 피해 필드 변경이 해당 항목 점수에 영향을 주지 않는지 포함한다. C07 HOLD와 운영 평가 승인은 별도로 유지한다.

**Files:** Create `apps/server/src/main/java/cw/domain/{MatchFeatures,ScoringService,MemberAggregator,ScoringRulesV1}.java`; Test `apps/server/src/test/java/cw/domain/{ScoringServiceTest,MemberAggregatorTest}.java`.

**Interfaces:** Consumes `EvaluationInput`. Produces `scoreMatches(input) -> GameScore 목록`, `aggregateMembers(scores, matches) -> MemberStats 목록`의 Java 계산; `GameScore={matchKey,memberId,role,scoringVersion,score,rank,breakdown}`, `MemberStats`는 경기 수/승패/승률/합계 KDA/포지션·챔피언별 집계/보정 점수/공식 순위/평가 상태를 포함한다. 아래 §5의 v1 계산을 그대로 사용한다.

- [ ] **1. 핵심 평가 테스트를 작성한다.** `loserCanRankFirst`, `zeroDenominatorsFinite`, `sameRoleOnly`, `seedAndSoloCannotAffectRank`, `threeGameThreshold`, `cancelReturnsToProvisional`: 잘한 패배자 순위 1 가능, 모든 점수 유한, 2경기 provisional/3경기 ranked, 보정 점수 `(sum+5*groupMean)/(n+5)`와 허용 오차 내 일치를 검증한다. 동일 표본·극단값·0데스 KDA도 포함한다.
- [ ] **2. 실패를 확인한다.** Java `ScoringServiceTest`, `MemberAggregatorTest` 실행 → 평가 함수 미구현으로 실패.
- [ ] **3. 지표·역할 표준화·가중치·누적을 구현한다.** 솔로랭크/seedSkill을 공개 점수 함수 입력으로 사용하지 않는다. EvaluationInput은 registered 경기만 사용하여 pending·canceled를 제외하며 도메인에서도 확정 역할이 있는 입력인지 검사한다. KDA는 표시만 하고 직접 가산하지 않는다.
- [ ] **4. 검증한다.** 테스트 → PASS. 수작업 계산 가능한 작은 예시와 정확히 일치하고, 평가 점수는 0–100, 0경기는 점수/순위 null이어야 한다.
- [ ] **5. 커밋한다.** `feat: calculate role-aware performance and cumulative statistics`.

### T09. 평가 버전·전체 재계산·일괄 공개

**Files:** Create `apps/server/src/main/resources/db/migrations/002-evaluation.sql`, `apps/server/src/main/java/cw/evaluation/{EvaluationRepository,RecalculationWorker,GenerationPublisher,EvaluationController}.java`; Test `apps/server/src/test/java/cw/evaluation/RecalculationIntegrationTest.java`. Modify T02/T04 mutation handlers, T03 member updates.

**Interfaces:** Consumes T08 함수와 DB source revision/jobs. Produces Java 작업자 `recalculate(sourceRevision) -> GenerationResult`, `readCurrentGeneration() -> CurrentGenerationResult`, `POST /api/admin/scoring-versions`, `GET /api/rankings`, `GET /api/members/:id/stats`. `CurrentGenerationResult`는 ready generation 또는 `{status:'recalculating',sourceRevision}`다.

- [ ] **1. 일관성·복구 테스트를 작성한다.** `singleVersionEverywhere`, `cancelDuringCalculation`, `workerRestart`, `staleGenerationNeverPublishes`: 공개 세대 revision과 최신 revision 일치, 공개 점수 전체의 평가 버전 동일, 취소 후 해당 회원 경기 수 2. 실패한 세대가 공개되지 않는지도 확인한다.
- [ ] **2. 실패를 확인한다.** Java `RecalculationIntegrationTest` 실행 → 작업자/세대 조회 미구현으로 실패.
- [ ] **3. 스냅샷 계산과 조건부 공개를 구현한다.** REPEATABLE READ로 입력을 확보하고 작업자를 한 개씩 실행한다. 완료 시 revision과 desired scoring version이 동일할 때만 active generation 포인터를 트랜잭션으로 교체한다. 변경되었으면 폐기 후 최신 job을 처리한다. 계산 중 공개 집계는 202/RECALCULATING이며 DB의 이전 점수를 혼합하지 않는다. 실패 job은 보존하고 재시작/운영자 재시도로 회복한다.
- [ ] **4. 장애 주입 테스트를 통과한다.** 테스트 → PASS. 기준 변경·역할 수정·등록 취소·새 경기 추가가 과거 점수와 누적 결과를 같은 세대로 갱신한다. seedSkill 변경은 공개 랭킹 값을 바꾸지 않는다. T10의 roleSkills도 같은 세대에 추가한다.
- [ ] **5. 커밋한다.** `feat: publish consistent versioned evaluation generations`.

### T10. 역할별 실력 보정과 팀 후보 3개

**Files:** Create `apps/server/src/main/java/cw/domain/{RoleSkillCalculator,TeamRecommender}.java`, `apps/server/src/main/java/cw/teams/TeamController.java`; Test `apps/server/src/test/java/cw/domain/TeamRecommenderTest.java`, `apps/server/src/test/java/cw/teams/TeamApiIntegrationTest.java`. Modify T09 generation builder.

**Interfaces:** Consumes `Member[]`, `GameScore[]`와 유효 세대. Produces `calculateRoleSkills(members, scores) -> RoleSkill 목록`, `recommendTeams(members, skills) -> TeamRecommendation`의 Java 계산, `POST /api/teams/recommend` with `{memberIds:string[10]}`. `RoleSkill={memberId,role,value,n}`. 아래 §5 공식을 사용한다.

- [ ] **1. 배정 테스트를 작성한다.** `allowedRolesOnly`, `balanceBeforePreference`, `atMostThreeDistinctRosters`, `oneOrTwoOnly`, `impossibleMatching`, `anonymousAllowed`: 후보 수 최대 3, 선수 구성 키가 모두 고유함, 구성 불가 시 이유 존재. 특정 역할 가능 인원이 있어도 조합 전체가 불가능한 경우, 중복 10명/비활성 회원도 검사한다.
- [ ] **2. 실패를 확인한다.** Java `TeamRecommenderTest`, `TeamApiIntegrationTest` 실행 → 미구현으로 실패.
- [ ] **3. 가능한 배정을 열거하고 후보를 정렬한다.** 소규모 10명에 대해 같은 선수 집합의 진영 반전·역할 순열을 제거한다. 부족한 역할 또는 서로 겹치는 역할 제약을 설명하고 임의 강제 배정하지 않는다. 현재 revision+정렬한 10명 ID로 결과를 캐시하고 공개 호출 속도를 제한한다.
- [ ] **4. 테스트와 비용을 확인한다.** 테스트 → PASS. 10명 전원이 5역할 가능한 입력의 실행 시간·후보 수를 기록한다. 목표 서버에서 2초 이내 응답을 목표로 하고 초과 시 결과를 바꾸지 않는 조합 탐색 최적화를 수행한다.
- [ ] **5. 커밋한다.** `feat: recommend balanced teams within playable roles`.

### T11. 공개 전적·통계·랭킹·팀 추천 웹

**Files:** Create `apps/web/src/App.tsx`, `apps/web/src/api.ts`, `apps/web/src/features/matches/{List,Detail}.tsx`, `apps/web/src/features/members/Profile.tsx`, `apps/web/src/features/rankings/Ranking.tsx`, `apps/web/src/features/teams/Recommendation.tsx`, `apps/web/src/components/ChampionItemIcon.tsx`, `apps/server/src/main/java/cw/assets/AssetCatalog.java`; Test `tests/e2e/public-web.spec.ts`.

**Interfaces:** Consumes T04/T09/T10 public APIs. Produces routes `/matches`, `/matches/:key`, `/members/:id`, `/rankings`, `/teams`; 아이콘은 확인된 정적 데이터 버전과 fallback을 사용하며 통계 계산에 이미지 메타데이터를 사용하지 않는다.

- [ ] **1. 사용자 화면 테스트를 작성한다.** `tenPlayerComparison`, `aggregateKdaFromTotals`, `provisionalVisible`, `anonymousTeamChoices`, `missingAssetFallback`: `expect(playerRows).toHaveCount(10)`, `expect(page.getByText('평가 중')).toBeVisible()`, `expect(recordAfterImage404).toBeVisible()`. 로그인 없이 모든 조회/추천을 수행한다.
- [ ] **2. 실패를 확인한다.** `pnpm test:e2e -- tests/e2e/public-web.spec.ts` → 페이지 미구현으로 실패.
- [ ] **3. 화면을 구현한다.** 경기 상세에 팀별 5명, 시간·승패·챔피언·K/D/A·피해량·CS·골드·시야·아이템·역할·활약 순위를 표시한다. 개인별 포지션/챔피언 기록과 경기 필터, 랭킹의 경기 수·기준 설명·평가 중 구분을 제공한다. 누적 KDA는 합계에서 계산한다. 추천은 선수/역할과 균형 차이를 보여주며 선수 교환·선택 추적 UI는 만들지 않는다.
- [ ] **4. 접근과 실패 상태를 검증한다.** 테스트 → PASS. 좁은 화면은 전적 표 가로 스크롤을 제공한다. 키보드 조작·loading/빈 자료/계산 중/서버 오류 상태를 확인한다. 오래된/새로운 아이템 ID는 대체 아이콘과 ID를 표시한다.
- [ ] **5. 커밋한다.** `feat: add public match statistics rankings and team pages`.

### T12. 운영자 웹과 초기 포지션 참고 자료

**Files:** Create `apps/web/src/features/admin/{Login,Members,Codes,MatchCorrections,Scoring,Jobs}.tsx`, `apps/server/src/main/java/cw/domain/RoleSuggester.java`, `apps/server/src/main/java/cw/members/MemberReferenceImporter.java`; Test `apps/server/src/test/java/cw/domain/RoleSuggesterTest.java`, `tests/e2e/admin-web.spec.ts`.

**Interfaces:** Consumes T03/T04/T09 admin APIs와 T05 참고 파일. Produces `/admin/*`, `POST /api/admin/member-references`, Java `suggestRoles(samples) -> RoleSuggestion`, `POST /api/admin/recalculation/retry`; RoleSuggestion은 primary/secondary nullable, 표본 수·출처·권고 이유를 포함한다.

- [ ] **1. 관리 흐름 테스트를 작성한다.** `codeOnlyLogin`, `referenceDoesNotOverwriteManual`, `soloNeverEntersRanking`, `ownerCorrectsAndCancels`, `weightsCreateNewVersion`: `expect(afterImport.allowedRoles).toEqual(manualRoles)`, `expect(afterSoloImport.matchCount).toBe(beforeCount)`, `expect(oldScoringVersion.immutable).toBe(true)`. 새 브라우저 코드 발급과 기존 기기 인증 폐기도 포함한다.
- [ ] **2. 실패를 확인한다.** Java `RoleSuggesterTest` 실행, `pnpm test:e2e -- tests/e2e/admin-web.spec.ts` → 미구현으로 실패.
- [ ] **3. 관리 화면과 제안 함수를 구현한다.** 참고 자료는 검증된 솔로랭크와 등록 내전의 최근 최대 20경기에서 확인된 역할 빈도로 상위 2개를 제안한다. 동률은 최근 플레이→고정 역할 순서, 알 수 없는 역할은 제외한다. 제안 적용은 운영자가 명시적으로 수행하며 주/부·가능 역할·0–100 초기 실력을 수정한다. 계정 ID 변경을 전적 통합 기능으로 만들지 않는다. 가중치는 역할별 합계 100·음수 없음·승패 최대 5를 검증해 새 불변 버전으로 저장한다.
- [ ] **4. 외부 관리 사용자 흐름을 확인한다.** 테스트 → PASS. 포지션 수정/취소 후 재계산 상태, 코드 만료/로그아웃/인증 폐기, 원본 수치 읽기 전용, 취소 자료의 내부 보관을 확인한다.
- [ ] **5. 커밋한다.** `feat: add owner controls and reviewed role suggestions`.

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

### T15. 실제 시범 운영과 평가 보정

**Files:** Create `docs/validation/pilot-report.md`, `docs/runbooks/operator-checklist.md`; 필요 시 Modify `apps/server/src/main/java/cw/domain/ScoringRulesV1.java` 대신 새 버전 규칙 파일과 변경 관련 테스트.

**Interfaces:** Consumes 설치된 수집기·외부 웹·관리 기능. Produces 3–5경기의 실제 비교 결과, 확정된 평가 버전, 알려진 한계와 사용자 운영 절차.

- [ ] **1. 실제 내전 3–5경기를 등록한다.** 운영자가 참가하지 않은 경기, 프로그램 실행 시점과 무관한 조회 버튼, 임시 저장만 하고 미확정인 경기의 집계 제외, 다른 참가자의 중복 전송, 오프라인 전송·확정 순서를 포함한다. 잘못된 게임은 운영 데이터에 일부러 넣지 않고 별도 테스트 DB에서 재현한다.
- [ ] **2. 전적과 평가를 대조한다.** 결과 화면의 10명 수치, 포지션, 게임 시간, 합계 KDA, 1–2경기 평가 중/3경기 정식 랭킹을 확인한다. 잘한 패배자·탱커·서포터·낮은 킬 경기 등의 점수 근거를 운영자와 검토한다. 점수의 한계와 자료 부족을 기록한다.
- [ ] **3. 조정이 필요하면 새 평가 기준으로 전체 재계산한다.** 확정한 가중치를 출발점으로 사용하며 개별 경기 결과에 맞추려고 원본을 바꾸지 않는다. 변경 전후 버전·이유·과거 경기/누적 순위 변화를 보고서에 남긴다.
- [ ] **4. 출시 수용 기준을 확인한다.** 전용 테스트 DB를 준비하고 `./apps/server/gradlew -p apps/server build`로 Java 서버 컴파일·단위/통합 테스트·패키징, 확정한 클라이언트 도구로 타입 검사·단위/E2E 테스트·빌드를 모두 실행 → PASS. T13 Windows 기록과 T14 외부 백업 복원 증거가 있어야 한다. 실패·미확인 항목이 남으면 완료로 표시하지 않는다.
- [ ] **5. 운영 문서와 검증 결과를 커밋한다.** `docs: record pilot acceptance and operating procedures`. 수집기 설치/재인증, 신규 회원, 포지션 정정, 취소, 기준 변경, 서버 장애, 백업 복원의 실제 절차를 안내한다.

## 5. 초기 계산 규칙

다음은 기획이 위임한 기술 세부사항의 실행 기본값이다. 실제 수집 필드가 V2에서 확인되어야 적용하며, 경기별·누적 순위는 모두 동일한 규칙 버전을 사용한다. 모임의 사후 활약 점수이며 Riot 공식 등급이나 랭크 추정치로 표시하지 않는다.

### 지표와 가중치

| 포지션 | 피해량 | 성장 | 교전 | 시야 | 오브젝트 | 사망 | 승패 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| TOP | 20 | 25 | 15 | 10 | 20 | 5 | 5 |
| JUNGLE | 10 | 15 | 35 | 10 | 20 | 5 | 5 |
| MIDDLE | 30 | 25 | 20 | 5 | 10 | 5 | 5 |
| BOTTOM | 40 | 25 | 15 | 5 | 5 | 5 | 5 |
| UTILITY | 5 | 0 | 40 | 40 | 5 | 5 | 5 |

각 원시 지표를 아래 방식으로 같은 역할끼리 0–100 척도로 환산한 다음 항목 내부 비율로 합성한다.

- 피해량: 분당 챔피언 피해량 70%, 팀 내 챔피언 피해량 비중 30%.
- 성장: 분당 총 CS(laneCs+neutralCs) 50%, 분당 골드 50%.
- 교전: 기본 킬 관여율. 서포터만 킬 관여율 70% + 분당 어시스트 30%.
- 시야: 분당 시야 점수. 와드 제거 수가 확보되면 표시용 보조 자료로만 사용한다.
- 오브젝트: 원래 안은 탑=분당 포탑 피해량, 정글/서포터=분당 오브젝트 피해량, 미드/원딜=두 지표 50%씩이었다. C07 HOLD 중 draft `objective-provisional-v1`은 D04에 따라 탑=포탑, 나머지 네 역할=오브젝트 단일 지표를 선택한다. 바깥 역할별 가중치는 유지하고 합산/차감 파생값은 만들지 않는다. 운영 전 의미 확인 후 평가 규칙 버전을 확정한다. 팀 용·바론 획득을 정글 개인 공로로 배분하지 않는다.
- 사망: 10분당 사망을 환산한 뒤 `100 - 환산값`으로 방향을 뒤집는다. 받은 피해량이나 KDA는 직접 가산하지 않는다.
- 승패: 승리 100, 패배 0에 5% 가중치. 다른 성적이 같으면 최대 5점 차이다.

### 같은 역할 표준화

현재 참가자의 지표를 x, 같은 경기 상대 역할의 지표를 y로 둔다. 모두 음수가 아닌 유효 값이다.

1. 경기 내 비교 P: x+y=0이면 50. 아니면 `P = 50 + 0.5 × (100x/(x+y) - 50)`로 25–75 범위를 사용한다.
2. 과거 비교 H: 현재 경기 양쪽을 제외한 모든 유효 내전의 같은 역할 표본 N개에서 `H = 100 × (x보다 작은 수 + 0.5×같은 수 + 5)/(N+10)`.
3. 역사 표본 비중 a=`N/(N+20)`, 최종 지표=`clamp((1-a)×P+a×H, 5, 95)`.
4. 팀 킬/피해량 분모가 실제로 0이면 해당 비율을 0으로 정의한다. 누락된 분모는 계산 오류이며 0과 혼동하지 않는다. 모든 값이 같으면 중립 50을 유지한다.

새 경기가 내전으로 등록 확정되면 비교 표본도 달라지므로 모든 유효 경기 점수를 함께 재계산한다. 임시 저장이나 중복 자료 수신은 재계산을 일으키지 않는다. 미래 경기의 추가로 과거의 상대적 점수가 변할 수 있음을 기준 설명에 명시한다. 같은 역할 안의 챔피언 성향 차이는 v1에서 완전히 보정하지 않는다.

### 누적·동점·표시

- 모임 평균 G는 현재 세대의 유효 경기 참가자 점수 전체 평균이다. 개인 점수는 `(개인 점수 합 + 5G)/(n+5)`.
- n=0은 점수/순위 없음, n=1–2는 평가 중, n≥3은 공식 순위. 취소로 n이 줄면 다시 평가 중이다.
- 누적 KDA는 `(총 킬+총 어시스트)/총 데스`. 총 데스가 0이면 숫자 무한대를 내보내지 않고 ‘Perfect’와 원래 K/D/A를 표시한다.
- 점수는 표시용 소수 둘째 자리로 반올림하고, 같은 표시 점수는 공동 순위 `1, 1, 3`을 적용한다. 같은 순위의 화면 정렬만 회원 ID로 안정화한다.

### 팀 편성용 실력과 후보

- 회원의 역할 r 실력=`(5×운영자 초기 실력 + r에서의 유효 경기 점수 합)/(5+r 경기 수)`. 기록이 없으면 초기값이다. 이 값과 초기값을 공개 누적 점수에 섞지 않는다.
- 가능한 역할은 운영자 지정 allowedRoles만. 선호 비용은 주 역할 0, 부 역할 1, 추가 가능한 역할 2다.
- 첫 회원을 A팀에 고정하면 10명 분할은 126개다. 각 팀의 가능한 역할 순열을 구해 실력 합 차이가 최소인 배정을 선택하고 동률이면 선호 비용·안정적 ID 순으로 정한다.
- 선수 구성이 같은 역할 순열은 한 후보로 합친다. 전체 최선의 팀 합 차이를 d라 하면 `차이≤d+5`인 구성에서 차이→선호 비용→안정적 ID 순으로 최대 3개를 제공한다. 실력은 개인 0–100, 팀 합 0–500 척도다.
- 가능한 구성이 없으면 제약의 이유를 반환한다. 역할 미지정 회원은 운영자 확인 대상으로 표시하고 임의 역할을 넣지 않는다.

## 6. 계획 점검과 인계

기획 대응: 계정/권한 §3–6·16→T03/T05/T12, 수집/재시도/중복 §7–9→V1–V2/T01/T02/T06/T07, 조회/평가 §10–13→T04/T08/T09/T11, 팀 §5·14→T10/T12, 정정/취소 §15→T04/T09, 운영 §17→T13/T14, 실제 수용 §18–19→V2/T15. 제외 범위 §20은 Global Constraints와 각 작업에 반영했다.

문서 작성 단계에서는 기획 범위·인터페이스 이름·검증 조건·Review Focus의 테스트 연결을 자체 점검한다. 실제 제품 테스트는 각 작업 실행 시 수행하며, 아직 통과했다고 주장하지 않는다. 검증 도구의 기술과 실행 명령을 확정한 뒤 첫 구현은 **V1 도구 제작과 Windows 실기 검증**이다. 이후 서비스 작업은 해당 기술 선택의 확정, V2 PASS와 확보한 필드 맵을 근거로 진행한다.

## 기술 선택 근거

- 사용자 결정 (2026-10-21): 서버는 Java 25 + Spring Boot 4.1.x의 최신 정식 패치 버전, DB는 PostgreSQL, DB 접근과 동적 조회는 Spring Data JPA + Specification, 서버 빌드는 기존 사용 경험에 따라 Gradle + Groovy DSL(`build.gradle`). [Spring Boot 요구사항](https://docs.spring.io/spring-boot/4.1/system-requirements.html), [Spring Data JPA Specification](https://docs.spring.io/spring-data/jpa/reference/jpa/specifications.html), [Gradle Java 호환성 표](https://docs.gradle.org/current/userguide/compatibility.html)를 참고한다. Java 25에서 Gradle을 실행하려면 Gradle 9.1.0 이상이 필요하며, Spring Boot가 지원하는 9.x 범위에서 세부 버전을 정한다. 정확한 패치 버전 고정 절차와 남은 선택은 §2를 따른다.
- [PostgreSQL 버전 정책](https://www.postgresql.org/support/versioning/): 제품 선택은 확정했으며 메이저·패치 버전은 지원 기간과 호환성을 검토한 뒤 함께 결정한다.
- [Electron 보안 안내](https://www.electronjs.org/docs/latest/tutorial/security), [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage): renderer 격리와 Windows 인증 정보 보호. Windows 보호는 같은 OS 사용자 권한의 모든 프로그램으로부터의 격리를 뜻하지 않는다.
- [electron-builder 플랫폼 빌드 안내](https://www.electron.build/v26/docs/features/multi-platform-build/), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3): Windows 네이티브 의존성을 포함한 빌드·실기 테스트 계획의 근거.
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/): 집 서버 외부 접속 방식. Tunnel이 집 PC 정전·절전·회선 중단을 대신 해결하지는 않는다.
