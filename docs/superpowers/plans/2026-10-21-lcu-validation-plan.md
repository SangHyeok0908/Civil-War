# LCU 실기 검증 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 Windows에서 수집한 사용자 설정 5대5 경기의 검증 결과를 유지하고, 남은 포탑·오브젝트 피해량의 의미와 점수 기준을 정리해 데이터 계약을 확정한다. 새 경기의 조회 시점 비교와 반영 시간·과거 조회 범위 측정은 2026-10-23 사용자 결정으로 제외했다.

**Architecture:** 본 서비스와 분리된 읽기 전용 검증 도구를 먼저 만든다. 검증 도구는 사용자와 확정한 Node.js 24로 구현한다. CLI의 명시적 조회 명령을 제품의 ‘과거 경기 조회’ 버튼에 대응시킨다. 실제 LCU 응답과 게임 결과 화면을 대조하여 판정하며, 문서의 API 목록이나 가상 응답만으로 통과시키지 않는다. 서버 임시 저장·등록 확정·중복 무반영은 이후 서비스 T02/T06/T07에서 검증한다.

**Tech Stack:** 사용자 확정 — Node.js 24 LTS. 구현은 JavaScript ESM, `node:test`, Node 내장 HTTPS·파일 API를 사용하며 외부 패키지 의존성은 없다. 실제 Windows PC와 LoL 클라이언트에서 검증한다는 조건은 확정되어 있다.

**서버 기술 결정 (2026-10-21):** 본 서비스 서버는 **Java 25 + Spring Boot 4.1.x의 최신 정식 패치 버전**, 서버 DB는 **PostgreSQL**, DB 접근과 동적 조회는 **Spring Data JPA + Specification**, 서버 빌드는 **Gradle + Groovy DSL(`build.gradle`)**로 사용자와 확정했다. Spring Boot의 정확한 패치 버전은 본 서비스 T01에서 공식 릴리스를 확인한 뒤 고정한다. 서버 선택과 독립적으로 검증 도구는 후속 대화에서 Node.js 24로 확정했다. 아래 `.mjs` 파일·Node 명령·테스트 절차를 사용한다. Windows PC 실측은 사용자가 나중에 진행한다. 검증 산출물인 원본 JSON·필드 맵·가명화 fixture·PASS/HOLD 기준은 서버 언어와 무관하다.

**기술 선택 기록:** 대안별 장단점과 LCU 원본 보존 이유는 [기술 스택 선택 근거](../decisions/2026-10-21-tech-stack-decisions.md)에 정리한다.

**현재 단계 0 상태 (2026-10-23):** [보고서](../../validation/lcu-report.md)와 [결정 D22](../decisions/2026-10-22-overnight-decisions.md#d22--2026-10-23-사용자-요청에-따른-검증-작업-제외)를 따른다. C01/C02/C10은 `범위 제외`이며 남은 보류 항목은 C07이다. 실제 3–5경기 시범 운영(T15)도 후속 작업에서 제외했다. 단계 1–3의 임시 구현 허용과 기존 실측·자료 감사 결과는 유지하며 제외 항목을 실측 성공으로 바꾸지 않는다.

**Spec:** [확정 기획서](../specs/2026-10-21-lol-inhouse-design.md), 특히 §7·10·11·18. 이후 작업은 [서비스 개발 계획](2026-10-21-lol-inhouse-development-plan.md)을 따른다.

## Global Constraints

- 개발 환경은 macOS, 수집 프로그램 지원 환경은 Windows만 지원한다.
- 새 경기 조회는 ‘과거 경기 조회’ 버튼을 눌렀을 때 시작하며, 프로그램의 경기 전후 실행 시점이나 경기 중 선행 수집에 의존하지 않는다.
- 제품은 조회한 적격 경기를 서버에 임시 저장하고 확인한 경기만 집계한다. 이 단계에서는 그 자료를 조회할 수 있는지 검증한다.
- 참가자 한 명의 수집으로 양 팀 10명의 기록을 얻어야 한다.
- 화면 수치 검증은 G1을 대표 경기로 삼는다. G1의 일치 결과를 근거로 G2·G3 추가 검증을 생략한다는 사용자 결정을 반영하며, 두 경기의 화면 증거를 추가로 요구하거나 gate 보류 조건에 넣지 않는다. 이미 완료한 G1–G3 JSON 구조·수치 보존 검사는 유지한다.
- 사용자 결정으로 클라이언트 재시작 후 같은 경기 재조회와 다른 참가자 PC의 경기 식별자 대조를 생략한다. 두 항목은 `범위 제외`로 기록하고 gate 보류 조건에서 제외한다. 참가자 간 동일 경기 키는 사용자 결정에 따른 전제로 두며 실측 PASS로 표현하지 않는다.
- 친구 목록 조회는 수집·검증 범위에서 제외한다. 참가자 식별은 경기 상세를 기준으로 검증하며, 친구 목록 조회 성공을 회원 등록이나 전체 gate의 전제로 두지 않는다.
- 솔로랭크 기록은 초기 포지션 참고 자료로만 사용한다. 2026-10-22 후속 경로는 [Riot 공식 Account-v1·Match-v5](../../validation/riot-solo-reference.md)다. LCU를 통한 다른 참가자 솔로랭크 조회 성공은 필수 조건에서 제외하며, 공식 API의 실제 접근·큐 구분·포지션 확인은 유지한다.
- 경기 중 실시간 수집이나 수동 수치 입력으로 요구사항을 대체하지 않는다.
- 경기 종료 후 첫 조회(C01), 미리 실행한 도구와의 조회 비교(C02), 반영 시간·과거 조회 범위 측정(C10)은 실행 작업·보류 사유·완료 조건에서 제외한다. 이 항목에 대한 새 경기나 관측 자료를 요구하지 않는다.
- 이 문서는 검증 계획이다. 현재 실측 결과와 범위별 판정은 [검증 보고서](../../validation/lcu-report.md)를 따른다.

## Review Focus

1. 포탑·오브젝트 피해량의 대상과 포함 관계: 기존 수치 일치를 의미 확정으로 확대하지 않고, 점수에 같은 기여가 중복 반영되지 않도록 정책을 확정한다 — V2·C07.
2. 포트·인증 정보 변경: 이전 연결을 재사용하지 않고 현재 lockfile을 다시 읽는다 — V1 구현·합성 테스트. V2의 재시작 후 같은 경기 재조회는 사용자 결정으로 생략한다.
3. 0과 누락·알 수 없는 스키마가 섞임: 원본을 보존하고 필드별로 판정하며 임의로 0을 채우지 않는다 — V1·V2.
4. 표시 이름과 계정·경기 키를 분리한다. 같은 자료의 목록·상세 식별자와 참가자 연결을 확인하며, 다른 수집자 PC의 경기 키 대조는 사용자 결정으로 생략한다 — V2.
5. 진단 파일에 인증 정보가 섞임: lockfile·토큰·Authorization 헤더를 출력하지 않고 공개 fixture에서 실제 식별자도 제거한다 — V1.

---

## 파일 구조와 인터페이스

V1 도구와 V2 기록 양식을 준비한다. 실제 Windows 측정과 본 서비스·수집 프로그램 구현은 아직 수행하지 않는다.

| 파일 | 책임 |
| --- | --- |
| `tools/lcu-probe/probe.mjs` | Windows CLI와 실행 순서, 제한된 GET 요청 |
| `tools/lcu-probe/client.mjs` | lockfile 읽기, 루프백 연결, 연결 정보 갱신 |
| `tools/lcu-probe/redact.mjs` | 인증 정보 제거와 일관된 가명화 |
| `tools/lcu-probe/probe.test.mjs` | 연결 범위·누락 보존·로그/fixture 검증 |
| `tools/lcu-probe/README.md` | PowerShell 실행 방법, 사전 조건, 오류 해석 |
| `.gitignore` | `.private/`, 환경 파일, lockfile 사본 제외 |
| `.private/lcu/<run-id>/` | 실제 원본·검증 메모, Git에 넣지 않음 |
| `fixtures/lcu/verified/` | V2 통과 후 만든 가명화 fixture와 manifest |
| `docs/validation/lcu-report.md` | 실행 환경·관찰 결과·통과/보류 판정 |
| `docs/validation/lcu-field-map.md` | 실제 JSON 경로, 단위, 필수/선택, 누락 처리 |

주요 함수는 `readConnection(lockfilePath) -> {port, password, protocol}`, `lcuGet(connection, path) -> {status, body}`, `redactCapture(capture, aliases) -> sanitizedCapture`다. `aliases`는 여러 응답에서 동일 계정·경기 식별자를 동일한 가명으로 치환한다. 실명 매핑은 `.private/` 안에만 둔다.

LCU 연결은 `127.0.0.1`로 제한하고, lockfile에 외부 주소나 임의 프로토콜을 지정할 수 없게 한다. 인증·인증서 처리 예외가 필요하면 해당 루프백 HTTPS 요청에만 한정한다. `NODE_TLS_REJECT_UNAUTHORIZED=0` 같은 프로세스 전체 설정은 사용하지 않는다. 실제 서비스 서버의 HTTPS 검증에는 영향을 주지 않아야 한다.

## V1. 읽기 전용 검증 도구

**진행 기록 (2026-10-21):** Node.js 24.22.1 / macOS arm64에서 실제 루프백 HTTPS 가상 서버 테스트 수행. Windows LCU 실측 결과가 아니며 V2 gate는 HOLD다. 실행 방법은 [도구 README](../../../tools/lcu-probe/README.md)를 따른다.

**Files:** Create 위 표의 `tools/lcu-probe/*`; Modify/Create `.gitignore`; Test `tools/lcu-probe/probe.test.mjs`.

**Interfaces:** Consumes 사용자가 지정한 LoL lockfile 경로와 읽기 전용 조회 옵션. Produces 원본 JSON·HTTP 상태·수집 시각·클라이언트 버전 manifest; 네트워크 실패와 정상 빈 응답을 별도 상태로 반환한다.

- [x] **1. 연결과 기록 보호 테스트를 작성한다.** `rejectNonLoopback`, `reloadChangedLockfile`, `preserveMissingVersusZero`, `redactSecretsAndStableIdentifiers`, `historyOnlyOnExplicitCommand`를 검증한다. 핵심 assertion은 `assert.equal(output.stats.visionScore, 0)`, `assert.equal('objectiveDamage' in output.stats, false)`, `assert.equal(log.includes(testPassword), false)`, `assert.equal(historyRequestsBeforeCommand, 0)`이며, 실제 계정 가명이 서로 다른 경기에서도 유지되어야 한다.
- [x] **2. 실패를 확인한다.** `node --test tools/lcu-probe/probe.test.mjs` → 구현 모듈 부재 또는 assertion으로 실패. 문법·테스트 환경 오류를 기능 실패로 간주하지 않는다.
- [x] **3. 명시적으로 지정한 경로에서 연결 정보를 읽는 CLI를 구현한다.** 기본 명령은 `node tools/lcu-probe/probe.mjs --lockfile "C:\Riot Games\League of Legends\lockfile" --out .private/lcu/run-01`이다. 이 명령은 1회 조회한다. `--out`은 프로젝트 루트의 `.private/lcu/` 아래 새 실행 폴더여야 하며 기존 실행을 덮어쓰지 않는다. 여기에 `--interactive`를 붙이면 Node 내장 readline으로 `history` 입력 때만 조회하는 대기 모드를 제공한다. 경로는 사용자 설치 위치에 맞게 바꾼다. POST/게임 조작·채팅 조회는 구현하지 않는다. 종료된 클라이언트와 응답 없는 LCU를 구분한다.
- [x] **4. 테스트와 가상 서버 실행을 확인한다.** 위 테스트 명령 → 전부 PASS. 테스트 암호·실제 lockfile 내용이 stdout, 오류 스택, 저장된 HTTP 메타데이터 어디에도 나오지 않아야 한다. fixture에 실제 자료를 넣기 전 이 테스트를 통과한다.
- [x] **5. 검증 도구만 커밋한다.** `git add .gitignore tools/lcu-probe` 후 `git diff --cached --check`, `git commit -m "test: add read-only Windows LCU probe"`. 실제 응답은 커밋하지 않는다.

### 조회 후보

아래 경로의 존재는 현재 클라이언트와 실제 게임에서 다시 확인한다. HTTP 200만으로 데이터 충족을 판정하지 않는다.

| 목적 | GET 경로 후보 | 확인 내용 |
| --- | --- | --- |
| 현재 계정 | `/lol-summoner/v1/current-summoner` | PUUID, Riot ID에 해당하는 표시값 |
| 최근 경기 | `/lol-match-history/v1/products/lol/current-summoner/matches` | 기존 사용자 설정 경기의 목록·상세 연결. 페이지 범위·반영 지연 추가 측정은 제외 |
| 경기 상세 | `/lol-match-history/v1/games/{gameId}` | 참가자 10명과 실제 통계 |
| 다른 참가자 과거 기록 — 선택 진단 | `/lol-match-history/v1/products/lol/{puuid}/matches` | LCU 접근 범위만 확인. 솔로랭크 초기 포지션의 필수 경로는 공식 API로 분리 |
| 선택적 타임라인 | `/lol-match-history/v1/game-timelines/{gameId}` | 이벤트의 존재·누락; 기본 수집 통과 조건에는 넣지 않음 |

경기 상세의 `participantIdentities[].player.puuid`로 참가자 식별자를 확인한다. LCU의 다른 참가자 기록 조회는 선택 진단이다. 솔로랭크는 해당 참가자의 Riot ID를 공식 Account-v1로 해석해 얻은 PUUID로 조회하며, LCU 식별자와의 연결과 실제 기록 접근 가능 여부를 별도로 확인한다. 참가자 사전 등록 요구와 10명 전원이 수집 프로그램을 설치할 필요가 없다는 원칙은 유지한다. 친구 목록을 회원 등록 수단으로 요구하지 않으며, 회원 등록 절차 자체가 검증됐다고 간주하지 않는다.

## V2. 실제 경기 검증과 진행 판정

**Files:** Create `docs/validation/lcu-report.md`, `docs/validation/lcu-field-map.md`, `fixtures/lcu/verified/manifest.json`, `fixtures/lcu/verified/custom-complete.json`, `fixtures/lcu/verified/solo-reference.json`; 필요 시 Modify V1 도구. Test V1 테스트 + 아래 실제 검증표.

**Interfaces:** Consumes V1 CLI, 실제 Windows PC, 완료된 사용자 설정 5대5 경기. Produces `gate: PASS | HOLD`, 실제 지원 필드 목록·단위·누락 정책, 검증한 환경/조회 조건, 서비스 T01에서 사용할 가명화 fixture.

기존 환경·수집 시각과 G1–G3의 구조 검사는 보고서에 보존한다. 미수집 환경값을 추정하거나 합성 테스트로 실측 결과를 대체하지 않는다. 종전 2·3번의 새 경기 조회 시점 비교·반영 시간·과거 조회 범위 측정은 사용자 결정으로 제거했다.

- [x] **4. 최소 두 실제 경기의 핵심 구조를 비교한다.** G1–G3의 구조 일치를 확인했다(C09). 클라이언트 재시작 후 같은 경기 재조회(C08)와 다른 참가자 PC의 경기 키 대조(C04)는 사용자 결정으로 생략하며 gate 조건에서 제외한다.
- [ ] **5. 피해량의 의미와 점수 기준을 확정한다.** 기존 G1의 숫자 통계·CS·챔피언·아이템·팀·승패·경기 시간 대조 결과(C03/C06 PASS)를 사용한다. 남은 것은 두 피해 지표의 대상·포함 관계(C07)와 이를 반영한 계산 정책·버전 확정이다. 신뢰 가능한 정의와 기존 자료의 근거를 검토하며 새 내전이나 G2·G3 추가 화면 대조는 요구하지 않는다.
- [x] **6a. HOLD 상태의 가명화 후보를 감사한다.** `fixtures/lcu/candidates/h2-20261021/`의 통계 660개·원본 식별자 잔존·해시·0 보존을 `tools/lcu-probe/audit-candidates.mjs`로 확인했다. 합성 gameId/시각을 명시하고 엄격한 draft 계약과 Windows 재현 명령을 작성했다. Node 24 probe 26/26·감사 5/5 PASS. 전체 실기 PASS가 아니다.
- [ ] **6b. V2 통과 후 검증 완료 fixture로 승격한다.** `node --test tools/lcu-probe/probe.test.mjs` → PASS, `git diff --check` → 출력 없음. `git add docs/validation fixtures/lcu/verified` 후 `git diff --cached`를 검토하고 `git commit -m "docs: record measured LCU capabilities and fixtures"`. 원본·토큰·실제 PUUID가 포함되면 커밋하지 않는다.

### 실기 체크리스트와 완료 기준

| 검증 항목 | 통과 증거 | 실패·누락 시 처리 |
| --- | --- | --- |
| 종료 후 첫 조회·도구 실행 시점 비교(C01/C02) | 2026-10-23 사용자 결정으로 검증 작업 제외 | 범위 제외; 보류 사유·완료 조건으로 사용하지 않으며 실측 PASS로 기록하지 않음 |
| 10명 식별·팀·승패·경기 시간 | 대표 경기 G1의 10개 고유 계정, 5+5 팀, 결과 화면 대조 | 본 개발 보류; G2·G3 추가 화면은 범위 제외 |
| 두 수집자의 경기 키 일치 | 사용자 결정으로 실측 생략; 동일 `platformId:gameId`를 전제로 둠 | 범위 제외; 실측 PASS로 기록하지 않고 gate 보류 사유로 삼지 않음 |
| 챔피언·K/D/A·가한/받은 피해량·CS·골드·시야·아이템 | 대표 경기 G1의 10명 전원 실제 JSON 값과 화면상 확인 가능한 값 대조 | 누락 필드를 정확히 제시하고 요구/대안 재검토; G2·G3 추가 화면은 범위 제외 |
| 오브젝트·포탑 피해량 | 필드 존재, 원본의 0·양수 사례, 대표 경기 G1 화면과 단위·의미 확인 | 추가 경기의 0 사례 화면은 요구하지 않음. 확정 가중치를 조용히 변경하지 않으며 해당 평가 구현 전에 미확인 의미를 정리 |
| 반영 시간·과거 조회 범위(C10) | 2026-10-23 사용자 결정으로 측정 작업 제외 | 범위 제외; 보류 사유·완료 조건으로 사용하지 않으며 보관 기간·반영 시간을 보장하지 않음 |
| 재시작 후 같은 경기 재조회 | 사용자 결정으로 실측 생략 | 범위 제외; gate 보류 사유로 삼지 않음 |
| 솔로랭크 초기 포지션 | 공식 API의 queue=420, 대상 참가자의 teamPosition 등 포지션 힌트, 다른 참가자 조회 범위 | 기록 부족은 ‘자료 부족’과 수동 지정. 공식 API 실측은 별도이며 LCU --player 성공을 요구하지 않음 |
| 타임라인 | 응답 유무와 이벤트 항목만 기록 | 없어도 통과 가능, 초기 평가에 의존하지 않음 |

`gate: PASS`는 사용자가 조정한 검증 범위의 핵심 수집·식별 요구가 충족되고 평가/초기 포지션 참고 기능의 구현 경로가 확정되었을 때 쓴다. 필수 지표에 변경이 필요하면 변경 승인을 기획서에 반영한 다음 PASS로 전환한다. 선택적 확장 지표의 누락은 이를 막지 않는다. 확보한 실제 Windows 경기 자료와 게임 결과 화면을 활용하며, 같은 경기 참가자의 다른 PC 협조는 요구하지 않는다.

친구 목록 기반 식별 검증은 사용자 요청으로 제외했다. 친구 응답 차단이나 친구 자료 미확보는 HOLD 사유가 아니다. 솔로랭크 초기 포지션 검증과 다른 참가자 기록의 접근 범위 확인은 그대로 유지한다.

**C06·C11 실측 완료 (2026-10-22):** 공식 개발자 포털에서 다른 참가자 1명의 계정·솔로랭크 목록 2페이지·상세 6건이 모두 HTTP 200이었다. queueId=420, 참가자 연결, 포지션 필드와 페이지 중복 없음을 확인했다. 짧은 조기 종료 2건을 제외한 참고 표본은 4건이며 주·부 포지션을 확정하지 않는다. [솔로랭크 실측 기록](../../validation/riot-solo-reference.md). 보관된 G1 화면과 공식 리소스 대조로 아이템 65개·빈 슬롯 5개·챔피언 10명도 일치했다. C06·C11은 PASS다. 2026-10-23 범위 조정 후 전체 V2의 남은 보류 사유는 피해량 의미(C07)다.

## 실기 검증 후 인계

보고서 첫 화면에 `PASS/HOLD`, 검증일·패치, 가능/불가능/미확인 항목, 알려진 조회 제약을 적는다. 본 서비스 T01의 Java 정규화·입력 검증은 필드 맵과 가명화 JSON fixture를 입력으로 사용하며 추측한 응답 구조를 제품 계약으로 고정하지 않는다. 패치 이후 다시 확인할 수 있도록 동일 probe를 유지한다.

## 근거 자료

- [Riot 공식 LoL 문서](https://developer.riotgames.com/docs/lol): LCU는 지원 범위가 제한된 인터페이스이므로 실기 검증과 오류 처리가 필요하다.
- [LCU API 목록](https://lcu.kebs.dev/)과 [공개 클라이언트 스키마](https://raw.githubusercontent.com/KebsCS/lcu-and-riotclient-api/main/lcu/swagger.json): 조회 경로 후보의 출처이며 실제 기록 가용성의 증거는 아니다.
- [Node.js 릴리스 상태](https://nodejs.org/en/about/previous-releases): 사용자가 확정한 검증 도구 Node.js 24 LTS의 릴리스 상태. 서버 Java 25 + Spring Boot 4.1.x와 별도로 관리한다.
