# LCU 실기 검증 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 Windows PC에서 수집 프로그램의 실행 시점과 무관하게 명시적 조회 요청으로 과거 사용자 설정 5대5 경기의 전체 기록을 얻을 수 있는지 검증하고, 본 개발의 데이터 계약을 확정한다.

**Architecture:** 본 서비스와 분리된 읽기 전용 검증 도구를 먼저 만든다. 검증 도구는 사용자와 확정한 Node.js 24로 구현한다. CLI의 명시적 조회 명령을 제품의 ‘과거 경기 조회’ 버튼에 대응시킨다. 실제 LCU 응답과 게임 결과 화면을 대조하여 판정하며, 문서의 API 목록이나 가상 응답만으로 통과시키지 않는다. 서버 임시 저장·등록 확정·중복 무반영은 이후 서비스 T02/T06/T07에서 검증한다.

**Tech Stack:** 사용자 확정 — Node.js 24 LTS. 구현은 JavaScript ESM, `node:test`, Node 내장 HTTPS·파일 API를 사용하며 외부 패키지 의존성은 없다. 실제 Windows PC와 LoL 클라이언트에서 검증한다는 조건은 확정되어 있다.

**서버 기술 결정 (2026-10-21):** 본 서비스 서버는 **Java 25 + Spring Boot 4.1.x의 최신 정식 패치 버전**, 서버 DB는 **PostgreSQL**, DB 접근과 동적 조회는 **Spring Data JPA + Specification**, 서버 빌드는 **Gradle + Groovy DSL(`build.gradle`)**로 사용자와 확정했다. Spring Boot의 정확한 패치 버전은 본 서비스 T01에서 공식 릴리스를 확인한 뒤 고정한다. 서버 선택과 독립적으로 검증 도구는 후속 대화에서 Node.js 24로 확정했다. 아래 `.mjs` 파일·Node 명령·테스트 절차를 사용한다. Windows PC 실측은 사용자가 나중에 진행한다. 검증 산출물인 원본 JSON·필드 맵·가명화 fixture·PASS/HOLD 기준은 서버 언어와 무관하다.

**기술 선택 기록:** 대안별 장단점과 LCU 원본 보존 이유는 [기술 스택 선택 근거](../decisions/2026-10-21-tech-stack-decisions.md)에 정리한다.

**Spec:** [확정 기획서](../specs/2026-10-21-lol-inhouse-design.md), 특히 §7·10·11·18. 이후 작업은 [서비스 개발 계획](2026-10-21-lol-inhouse-development-plan.md)을 따른다.

## Global Constraints

- 개발 환경은 macOS, 수집 프로그램 지원 환경은 Windows만 지원한다.
- 새 경기 조회는 ‘과거 경기 조회’ 버튼을 눌렀을 때 시작하며, 프로그램의 경기 전후 실행 시점이나 경기 중 선행 수집에 의존하지 않는다.
- 제품은 조회한 적격 경기를 서버에 임시 저장하고 확인한 경기만 집계한다. 이 단계에서는 그 자료를 조회할 수 있는지 검증한다.
- 참가자 한 명의 수집으로 양 팀 10명의 기록을 얻어야 한다.
- 화면 수치 검증은 G1을 대표 경기로 삼는다. G1의 일치 결과를 근거로 G2·G3 추가 검증을 생략한다는 사용자 결정을 반영하며, 두 경기의 화면 증거를 추가로 요구하거나 gate 보류 조건에 넣지 않는다. 이미 완료한 G1–G3 JSON 구조·수치 보존 검사는 유지한다.
- 사용자 결정으로 클라이언트 재시작 후 같은 경기 재조회와 다른 참가자 PC의 경기 식별자 대조를 생략한다. 두 항목은 `범위 제외`로 기록하고 gate 보류 조건에서 제외한다. 참가자 간 동일 경기 키는 사용자 결정에 따른 전제로 두며 실측 PASS로 표현하지 않는다.
- 친구 목록 조회는 수집·검증 범위에서 제외한다. 참가자 식별은 경기 상세를 기준으로 검증하며, 친구 목록 조회 성공을 회원 등록이나 전체 gate의 전제로 두지 않는다.
- 솔로랭크 기록은 초기 포지션 참고 자료로만 사용한다.
- 경기 중 실시간 수집이나 수동 수치 입력으로 요구사항을 대체하지 않는다.
- 이 문서는 검증 계획이다. 현재 실측 결과와 범위별 판정은 [검증 보고서](../../validation/lcu-report.md)를 따른다.

## Review Focus

1. 경기 종료 직후 목록 반영 지연: 즉시 실패와 일정 시간 후 조회 성공을 구분하여 시간과 결과를 기록한다 — V2.
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
| 최근 경기 | `/lol-match-history/v1/products/lol/current-summoner/matches` | 사용자 설정 경기 포함 여부, 페이지 범위·반영 지연 |
| 경기 상세 | `/lol-match-history/v1/games/{gameId}` | 참가자 10명과 실제 통계 |
| 다른 참가자 과거 기록 | `/lol-match-history/v1/products/lol/{puuid}/matches` | 운영자가 초기 포지션 참고 자료를 얻을 수 있는 범위 |
| 선택적 타임라인 | `/lol-match-history/v1/game-timelines/{gameId}` | 이벤트의 존재·누락; 기본 수집 통과 조건에는 넣지 않음 |

경기 상세의 `participantIdentities[].player.puuid`로 참가자 식별자를 확인한다. 확보한 PUUID는 다른 참가자의 과거 기록·솔로랭크 조회 검증에도 사용하되, 식별자 확보와 해당 계정 기록의 접근 가능 여부는 구분한다. 참가자 사전 등록 요구와 10명 전원이 수집 프로그램을 설치할 필요가 없다는 원칙은 유지한다. 친구 목록을 회원 등록 수단으로 요구하지 않으며, 회원 등록 절차 자체가 검증됐다고 간주하지 않는다.

## V2. 실제 경기 검증과 진행 판정

**Files:** Create `docs/validation/lcu-report.md`, `docs/validation/lcu-field-map.md`, `fixtures/lcu/verified/manifest.json`, `fixtures/lcu/verified/custom-complete.json`, `fixtures/lcu/verified/solo-reference.json`; 필요 시 Modify V1 도구. Test V1 테스트 + 아래 실제 검증표.

**Interfaces:** Consumes V1 CLI, 실제 Windows PC, 완료된 사용자 설정 5대5 경기. Produces `gate: PASS | HOLD`, 실제 지원 필드 목록·단위·누락 정책, 검증한 환경/조회 조건, 서비스 T01에서 사용할 가명화 fixture.

- [ ] **1. 실제 테스트 환경을 기록한다.** Windows 버전·CPU 아키텍처, Node 버전, 클라이언트/게임 패치, 지역, 경기 시각, 수집 시작 시각을 기록한다. macOS 가상 응답으로 Windows 결과를 대신하지 않는다.
- [ ] **2. 조회 시점과 프로그램 실행 시점을 분리해 검증한다.** 첫 실제 내전은 경기 중 도구를 실행하지 않고 종료 후 처음 조회한다. 다른 실행에서는 도구를 미리 실행해 두되 조회 명령 전에는 경기 기록을 읽지 않는다. 기존 정상 내전에서 검증하며 고의 탈주·비정상 게임을 만들지 않는다.
- [ ] **3. 명시적 조회 명령으로 아래 표를 채운다.** 종료 직후, 약 1분·5분·15분 뒤 중 필요한 시점과 목록에 제공되는 더 오래된 경기들을 조회하여 관찰된 지연·범위를 기록한다. 두 실행 조건에서 같은 경기의 키와 핵심 기록이 일치하는지 비교한다. 15분은 테스트 관찰 창이며 제품의 보장 기한이 아니다. CLI를 실행해 둔 경우에는 `--interactive` 모드의 `history` 명령을 제품 버튼에 대응시키고 명령 전에는 자동 조회하지 않는다.
- [x] **4. 최소 두 실제 경기의 핵심 구조를 비교한다.** G1–G3의 구조 일치를 확인했다(C09). 클라이언트 재시작 후 같은 경기 재조회(C08)와 다른 참가자 PC의 경기 키 대조(C04)는 사용자 결정으로 생략하며 gate 조건에서 제외한다.
- [ ] **5. 대표 경기 G1의 원본과 게임 결과 화면을 대조해 필드 맵과 판정을 작성한다.** 숫자 통계·CS·아이템 빈 슬롯·팀·승패·경기 시간 대조는 완료했다. 개별 아이템 ID·지표 의미 등 미확인 범위를 구분한다. G2·G3 추가 화면 대조는 사용자 결정으로 생략한다.
- [ ] **6. 가명화 fixture를 검증해 커밋한다.** `node --test tools/lcu-probe/probe.test.mjs` → PASS, `git diff --check` → 출력 없음. `git add docs/validation fixtures/lcu/verified` 후 `git diff --cached`를 검토하고 `git commit -m "docs: record measured LCU capabilities and fixtures"`. 원본·토큰·실제 PUUID가 포함되면 커밋하지 않는다.

### 실기 체크리스트와 완료 기준

| 검증 항목 | 통과 증거 | 실패·누락 시 처리 |
| --- | --- | --- |
| 명시적 요청으로 과거 내전 조회 | 선행 실행 없이 조회 성공, 미리 실행한 경우에도 명령 전 조회 없음, 같은 경기의 키·핵심 기록 일치 | **본 개발 보류**, 가능한 대안과 요구 변경점을 사용자에게 제시 |
| 10명 식별·팀·승패·경기 시간 | 대표 경기 G1의 10개 고유 계정, 5+5 팀, 결과 화면 대조 | 본 개발 보류; G2·G3 추가 화면은 범위 제외 |
| 두 수집자의 경기 키 일치 | 사용자 결정으로 실측 생략; 동일 `platformId:gameId`를 전제로 둠 | 범위 제외; 실측 PASS로 기록하지 않고 gate 보류 사유로 삼지 않음 |
| 챔피언·K/D/A·가한/받은 피해량·CS·골드·시야·아이템 | 대표 경기 G1의 10명 전원 실제 JSON 값과 화면상 확인 가능한 값 대조 | 누락 필드를 정확히 제시하고 요구/대안 재검토; G2·G3 추가 화면은 범위 제외 |
| 오브젝트·포탑 피해량 | 필드 존재, 원본의 0·양수 사례, 대표 경기 G1 화면과 단위·의미 확인 | 추가 경기의 0 사례 화면은 요구하지 않음. 확정 가중치를 조용히 변경하지 않으며 해당 평가 구현 전에 미확인 의미를 정리 |
| 조회 범위 | 확인한 과거 경기 범위·페이지 제한 명시 | 관찰 범위와 미확인 범위를 구분해 기록 |
| 재시작 후 같은 경기 재조회 | 사용자 결정으로 실측 생략 | 범위 제외; gate 보류 사유로 삼지 않음 |
| 솔로랭크 초기 포지션 | 검증된 솔로랭크 구분값과 역할 힌트, 다른 친구 조회 가능 여부 | 기록 부족은 ‘자료 부족’과 수동 지정; 기능 자체가 불가능하면 대안 확인 |
| 타임라인 | 응답 유무와 이벤트 항목만 기록 | 없어도 통과 가능, 초기 평가에 의존하지 않음 |

`gate: PASS`는 사용자가 조정한 검증 범위의 핵심 수집·식별 요구가 충족되고 평가/초기 포지션 참고 기능의 구현 경로가 확정되었을 때 쓴다. 필수 지표에 변경이 필요하면 변경 승인을 기획서에 반영한 다음 PASS로 전환한다. 선택적 확장 지표의 누락은 이를 막지 않는다. 확보한 실제 Windows 경기 자료와 게임 결과 화면을 활용하며, 같은 경기 참가자의 다른 PC 협조는 요구하지 않는다.

친구 목록 기반 식별 검증은 사용자 요청으로 제외했다. 친구 응답 차단이나 친구 자료 미확보는 HOLD 사유가 아니다. 솔로랭크 초기 포지션 검증과 다른 참가자 기록의 접근 범위 확인은 그대로 유지한다.

## 실기 검증 후 인계

보고서 첫 화면에 `PASS/HOLD`, 검증일·패치, 가능/불가능/미확인 항목, 알려진 조회 제약을 적는다. 본 서비스 T01의 Java 정규화·입력 검증은 필드 맵과 가명화 JSON fixture를 입력으로 사용하며 추측한 응답 구조를 제품 계약으로 고정하지 않는다. 패치 이후 다시 확인할 수 있도록 동일 probe를 유지한다.

## 근거 자료

- [Riot 공식 LoL 문서](https://developer.riotgames.com/docs/lol): LCU는 지원 범위가 제한된 인터페이스이므로 실기 검증과 오류 처리가 필요하다.
- [LCU API 목록](https://lcu.kebs.dev/)과 [공개 클라이언트 스키마](https://raw.githubusercontent.com/KebsCS/lcu-and-riotclient-api/main/lcu/swagger.json): 조회 경로 후보의 출처이며 실제 기록 가용성의 증거는 아니다.
- [Node.js 릴리스 상태](https://nodejs.org/en/about/previous-releases): 사용자가 확정한 검증 도구 Node.js 24 LTS의 릴리스 상태. 서버 Java 25 + Spring Boot 4.1.x와 별도로 관리한다.
