# LCU 실기 검증 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 Windows PC에서 수집 프로그램의 실행 시점과 무관하게 명시적 조회 요청으로 과거 사용자 설정 5대5 경기의 전체 기록을 얻을 수 있는지 검증하고, 본 개발의 데이터 계약을 확정한다.

**Architecture:** 본 서비스와 분리된 읽기 전용 Node.js 검증 도구를 먼저 만든다. CLI의 명시적 조회 명령을 제품의 ‘과거 경기 조회’ 버튼에 대응시킨다. 실제 LCU 응답과 게임 결과 화면을 대조하여 판정하며, 문서의 API 목록이나 가상 응답만으로 통과시키지 않는다. 서버 임시 저장·등록 확정·중복 무반영은 이후 서비스 T02/T06/T07에서 검증한다.

**Tech Stack:** Node.js 24 LTS, JavaScript ESM, `node:test`, Node 내장 HTTPS·파일 API, 실제 Windows PC와 LoL 클라이언트.

**Spec:** [확정 기획서](../specs/2026-10-21-lol-inhouse-design.md), 특히 §7·10·11·18. 이후 작업은 [서비스 개발 계획](2026-10-21-lol-inhouse-development-plan.md)을 따른다.

## Global Constraints

- 개발 환경은 macOS, 수집 프로그램 지원 환경은 Windows만 지원한다.
- 새 경기 조회는 ‘과거 경기 조회’ 버튼을 눌렀을 때 시작하며, 프로그램의 경기 전후 실행 시점이나 경기 중 선행 수집에 의존하지 않는다.
- 제품은 조회한 적격 경기를 서버에 임시 저장하고 확인한 경기만 집계한다. 이 단계에서는 그 자료를 조회할 수 있는지 검증한다.
- 참가자 한 명의 수집으로 양 팀 10명의 기록을 얻어야 한다.
- 솔로랭크 기록은 초기 포지션 참고 자료로만 사용한다.
- 경기 중 실시간 수집이나 수동 수치 입력으로 요구사항을 대체하지 않는다.
- 이 문서는 검증 계획이다. 현재 이 프로젝트에서 실제 LCU 응답을 수집하거나 요구사항 충족을 확인한 적은 없다.

## Review Focus

1. 경기 종료 직후 목록 반영 지연: 즉시 실패와 일정 시간 후 조회 성공을 구분하여 시간과 결과를 기록한다 — V2.
2. 클라이언트 재시작으로 포트·인증 정보가 변경됨: 이전 연결을 재사용하지 않고 현재 lockfile을 다시 읽는다 — V1·V2.
3. 0과 누락·알 수 없는 스키마가 섞임: 원본을 보존하고 필드별로 판정하며 임의로 0을 채우지 않는다 — V1·V2.
4. 친구 이름 변경 및 서로 다른 수집자: 표시 이름 대신 안정적인 계정·경기 키가 일치하는지 확인한다 — V2.
5. 진단 파일에 인증 정보가 섞임: lockfile·토큰·Authorization 헤더를 출력하지 않고 공개 fixture에서 실제 식별자도 제거한다 — V1.

---

## 파일 구조와 인터페이스

아래 파일은 이 계획 실행 시 생성한다. 지금은 서비스·수집 프로그램을 만들지 않는다.

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

**Files:** Create 위 표의 `tools/lcu-probe/*`; Modify/Create `.gitignore`; Test `tools/lcu-probe/probe.test.mjs`.

**Interfaces:** Consumes 사용자가 지정한 LoL lockfile 경로와 읽기 전용 조회 옵션. Produces 원본 JSON·HTTP 상태·수집 시각·클라이언트 버전 manifest; 네트워크 실패와 정상 빈 응답을 별도 상태로 반환한다.

- [ ] **1. 연결과 기록 보호 테스트를 작성한다.** `rejectNonLoopback`, `reloadChangedLockfile`, `preserveMissingVersusZero`, `redactSecretsAndStableIdentifiers`, `historyOnlyOnExplicitCommand`를 검증한다. 핵심 assertion은 `assert.equal(output.stats.visionScore, 0)`, `assert.equal('objectiveDamage' in output.stats, false)`, `assert.equal(log.includes(testPassword), false)`, `assert.equal(historyRequestsBeforeCommand, 0)`이며, 실제 계정 가명이 서로 다른 경기에서도 유지되어야 한다.
- [ ] **2. 실패를 확인한다.** `node --test tools/lcu-probe/probe.test.mjs` → 구현 모듈 부재 또는 assertion으로 실패. 문법·테스트 환경 오류를 기능 실패로 간주하지 않는다.
- [ ] **3. 명시적으로 지정한 경로에서 연결 정보를 읽는 CLI를 구현한다.** 기본 명령은 `node tools/lcu-probe/probe.mjs --lockfile "C:\Riot Games\League of Legends\lockfile" --out .private/lcu/run-01`이다. 이 명령은 1회 조회한다. 여기에 `--interactive`를 붙이면 Node 내장 readline으로 `history` 입력 때만 조회하는 대기 모드를 제공한다. 경로는 사용자 설치 위치에 맞게 바꾼다. POST/게임 조작·채팅 조회는 구현하지 않는다. 종료된 클라이언트와 응답 없는 LCU를 구분한다.
- [ ] **4. 테스트와 가상 서버 실행을 확인한다.** 위 테스트 명령 → 전부 PASS. 테스트 암호·실제 lockfile 내용이 stdout, 오류 스택, 저장된 HTTP 메타데이터 어디에도 나오지 않아야 한다. fixture에 실제 자료를 넣기 전 이 테스트를 통과한다.
- [ ] **5. 검증 도구만 커밋한다.** `git add .gitignore tools/lcu-probe` 후 `git diff --cached --check`, `git commit -m "test: add read-only Windows LCU probe"`. 실제 응답은 커밋하지 않는다.

### 조회 후보

아래 경로의 존재는 현재 클라이언트와 실제 게임에서 다시 확인한다. HTTP 200만으로 데이터 충족을 판정하지 않는다.

| 목적 | GET 경로 후보 | 확인 내용 |
| --- | --- | --- |
| 현재 계정 | `/lol-summoner/v1/current-summoner` | PUUID, Riot ID에 해당하는 표시값 |
| 최근 경기 | `/lol-match-history/v1/products/lol/current-summoner/matches` | 사용자 설정 경기 포함 여부, 페이지 범위·반영 지연 |
| 경기 상세 | `/lol-match-history/v1/games/{gameId}` | 참가자 10명과 실제 통계 |
| 다른 참가자 과거 기록 | `/lol-match-history/v1/products/lol/{puuid}/matches` | 운영자가 초기 포지션 참고 자료를 얻을 수 있는 범위 |
| 친구 식별 | `/lol-chat/v1/friends` | 선택한 친구의 안정적인 식별자를 사전 등록에 쓸 수 있는지 |
| 선택적 타임라인 | `/lol-match-history/v1/game-timelines/{gameId}` | 이벤트의 존재·누락; 기본 수집 통과 조건에는 넣지 않음 |

친구 목록은 참가자 등록을 위한 식별 확인에만 쓴다. 친구 10명 전원이 수집 프로그램을 설치해야 하는 설계로 바꾸지 않는다. 친구 목록에서 필요한 식별자를 얻지 못하면 검증된 계정 조회 방법을 조사하여 사전 등록 흐름을 확정한다.

## V2. 실제 경기 검증과 진행 판정

**Files:** Create `docs/validation/lcu-report.md`, `docs/validation/lcu-field-map.md`, `fixtures/lcu/verified/manifest.json`, `fixtures/lcu/verified/custom-complete.json`, `fixtures/lcu/verified/solo-reference.json`; 필요 시 Modify V1 도구. Test V1 테스트 + 아래 실제 검증표.

**Interfaces:** Consumes V1 CLI, 실제 Windows PC, 완료된 사용자 설정 5대5 경기. Produces `gate: PASS | HOLD`, 실제 지원 필드 목록·단위·누락 정책, 검증한 환경/조회 조건, 서비스 T01에서 사용할 가명화 fixture.

- [ ] **1. 실제 테스트 환경을 기록한다.** Windows 버전·CPU 아키텍처, Node 버전, 클라이언트/게임 패치, 지역, 경기 시각, 수집 시작 시각을 기록한다. macOS 가상 응답으로 Windows 결과를 대신하지 않는다.
- [ ] **2. 조회 시점과 프로그램 실행 시점을 분리해 검증한다.** 첫 실제 내전은 경기 중 도구를 실행하지 않고 종료 후 처음 조회한다. 다른 실행에서는 도구를 미리 실행해 두되 조회 명령 전에는 경기 기록을 읽지 않는다. 기존 정상 내전에서 검증하며 고의 탈주·비정상 게임을 만들지 않는다.
- [ ] **3. 명시적 조회 명령으로 아래 표를 채운다.** 종료 직후, 약 1분·5분·15분 뒤 중 필요한 시점과 목록에 제공되는 더 오래된 경기들을 조회하여 관찰된 지연·범위를 기록한다. 두 실행 조건에서 같은 경기의 키와 핵심 기록이 일치하는지 비교한다. 15분은 테스트 관찰 창이며 제품의 보장 기한이 아니다. CLI를 실행해 둔 경우에는 `--interactive` 모드의 `history` 명령을 제품 버튼에 대응시키고 명령 전에는 자동 조회하지 않는다.
- [ ] **4. 클라이언트를 재시작한 뒤 같은 경기를 다시 조회한다.** 최소 두 실제 경기에서 핵심 필드가 같은 구조로 나오는지 확인한다. 같은 경기 참가자 두 명의 PC에서 경기 키를 대조한다. 두 번째 PC에서 확인할 수 없으면 해당 항목을 보류하고 전체 gate를 PASS로 표시하지 않는다.
- [ ] **5. 원본과 게임 결과 화면을 대조해 필드 맵과 판정을 작성한다.** JSON 경로·타입·단위, 결측과 0, 아이템 빈 슬롯, CS 합산 범위, 팀 ID와 승패, 안정적인 경기 키, 역할 힌트의 출처를 명시한다.
- [ ] **6. 가명화 fixture를 검증해 커밋한다.** `node --test tools/lcu-probe/probe.test.mjs` → PASS, `git diff --check` → 출력 없음. `git add docs/validation fixtures/lcu/verified` 후 `git diff --cached`를 검토하고 `git commit -m "docs: record measured LCU capabilities and fixtures"`. 원본·토큰·실제 PUUID가 포함되면 커밋하지 않는다.

### 실기 체크리스트와 완료 기준

| 검증 항목 | 통과 증거 | 실패·누락 시 처리 |
| --- | --- | --- |
| 명시적 요청으로 과거 내전 조회 | 선행 실행 없이 조회 성공, 미리 실행한 경우에도 명령 전 조회 없음, 같은 경기의 키·핵심 기록 일치 | **본 개발 보류**, 가능한 대안과 요구 변경점을 사용자에게 제시 |
| 10명 식별·팀·승패·경기 시간 | 10개의 고유 계정, 5+5 팀, 결과 화면 대조 | 본 개발 보류 |
| 두 수집자의 경기 키 일치 | `platformId:gameId`가 동일하며 문자열로 보존됨 | 본 개발 보류; 다른 안정적인 키 검증 필요 |
| 회원 사전 등록 | 수집자 한 명이 친구의 안정적인 식별자를 확보하는 검증된 경로 | 모든 친구 설치를 강제하지 말고 등록 대안 검증 |
| 챔피언·K/D/A·가한/받은 피해량·CS·골드·시야·아이템 | 10명 전원 실제 JSON 값과 화면상 확인 가능한 값 대조 | 누락 필드를 정확히 제시하고 요구/대안 재검토 |
| 오브젝트·포탑 피해량 | 필드의 존재, 0과 양수 사례, 단위·의미 확인 | 확정 가중치를 조용히 변경하지 않음; 해당 평가 구현 전에 사용자와 대안 확정 |
| 재시작·조회 범위 | 같은 경기 재조회 결과, 확인한 과거 경기 범위·페이지 제한 명시 | 재시작 이후 실패는 제한으로 명시; 버튼 기반 과거 조회 요구와 충돌 여부 검토 |
| 솔로랭크 초기 포지션 | 검증된 솔로랭크 구분값과 역할 힌트, 다른 친구 조회 가능 여부 | 기록 부족은 ‘자료 부족’과 수동 지정; 기능 자체가 불가능하면 대안 확인 |
| 타임라인 | 응답 유무와 이벤트 항목만 기록 | 없어도 통과 가능, 초기 평가에 의존하지 않음 |

`gate: PASS`는 핵심 수집·식별 요구가 충족되고 평가/초기 포지션 참고 기능의 구현 경로가 확정되었을 때만 쓴다. 필수 지표에 변경이 필요하면 변경 승인을 기획서에 반영한 다음 PASS로 전환한다. 선택적 확장 지표의 누락은 이를 막지 않는다. 이 확인에는 실제 Windows PC와 내전 일정, 같은 경기에 참여한 친구의 검증 협조가 필요하다.

## 실기 검증 후 인계

보고서 첫 화면에 `PASS/HOLD`, 검증일·패치, 가능/불가능/미확인 항목, 알려진 조회 제약을 적는다. 본 서비스 T01은 필드 맵을 입력으로 사용하며 추측한 응답 구조를 제품 계약으로 고정하지 않는다. 패치 이후 다시 확인할 수 있도록 동일 probe를 유지한다.

## 근거 자료

- [Riot 공식 LoL 문서](https://developer.riotgames.com/docs/lol): LCU는 지원 범위가 제한된 인터페이스이므로 실기 검증과 오류 처리가 필요하다.
- [LCU API 목록](https://lcu.kebs.dev/)과 [공개 클라이언트 스키마](https://raw.githubusercontent.com/KebsCS/lcu-and-riotclient-api/main/lcu/swagger.json): 조회 경로 후보의 출처이며 실제 기록 가용성의 증거는 아니다.
- [Node.js 릴리스 상태](https://nodejs.org/en/about/previous-releases): 검증 도구와 서버의 Node 24 LTS 선택 근거. 정확한 패치 버전은 실행 시 기록한다.
