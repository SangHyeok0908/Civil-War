# LCU probe Windows 재검증 준비 계획

**현재 범위 정정:** 사용자 요청에 따라 친구 목록 조회와 1.0.2 Windows 친구 재검증을 제외한다. 솔로랭크 조회는 초기 포지션 참고용으로 유지한다. 아래 계획·완료 항목의 친구 관련 내용은 당시 작업 이력이며 현재 실행 지시가 아니다. 현재 절차와 판정은 [README](../../../tools/lcu-probe/README.md)와 [검증 보고서](../../validation/lcu-report.md)를 따른다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 첫 Windows 수집에서 발견한 요청 인자 오류를 수정하고, 친구 응답 차단 사유를 안전하게 기록하는 재검증 키트를 제공한다.

**Architecture:** 기존 Node CLI와 GET 전용 클라이언트를 유지한다. 경기 목록의 쿼리를 `begIndex`로 수정하고 민감정보 차단 결과에 고정 분류만 추가한다. 친구 응답 본문 저장 정책은 유지한다.

**Tech Stack:** Node.js 24, 표준 라이브러리, PowerShell 실행 안내.

**Spec:** 사용자 승인 범위는 이전 분석의 다음 단계(인자 수정, 친구 차단 원인 확인, 실제 ID 재조회 준비). 기존 요구사항은 `2026-10-21-lcu-validation-plan.md`와 `tools/lcu-probe/README.md`.

## Global Constraints

- 실제 Windows LCU 재검증은 사용자의 PC에서 수행한다. 여기서 합성 테스트만으로 PASS를 선언하지 않는다.
- 인증 정보, 원문 키·값, 계정 식별자를 새 진단 정보에 넣지 않는다.
- 자동 재시도·폴링·페이지 순회와 외부 의존성을 추가하지 않는다.
- 기존 작업 브랜치 `codex/lcu-probe`에서 수정한다. 사용자 기존 문서 변경을 보존하고 커밋·푸시는 하지 않는다.
- 출력은 `.private/lcu/`의 새 폴더에 저장하며 배포 zip에 실제 수집 파일을 넣지 않는다.

## Review Focus

- 현재 계정과 PUUID 경로 모두 잘못된 쿼리를 거부하는 합성 서버로 검증한다.
- 임의 키 이름·값 및 이스케이프된 인증 문자열도 진단 파일과 화면에 노출하지 않는다.
- 알려진 게임용 token 필드를 진단해도 실제 인증 필드의 차단을 유지한다.
- README의 예시 PUUID를 복사하면 요청 전 오류를 반환한다.
- 경기 ID가 큰 정수여도 파일에서 문자열로 가져오고 조회 기록이 없으면 선택 명령을 건너뛴다.

## Task 1: 요청 인자와 차단 진단 수정

**Files:** `tools/lcu-probe/client.mjs`, `probe.mjs`, `probe.test.mjs`.

**Interfaces:** `lcuGet`의 `ProbeError`에 선택적 `sensitivity` 객체를 추가한다. `rules`, `keyCategories`, `recognizedFields`는 고정 문자열의 중복 없는 배열이다. `collect`가 이를 manifest에 저장하며 CLI는 요청 종류·HTTP 상태·오류와 해당 분류만 표시한다.

- [x] 기존 history 테스트를 실제 400 오류와 동일한 엄격한 쿼리 검사로 보완하고 PUUID 경로 테스트를 추가한다.
- [x] 민감 필드 분류·비밀 비노출·예시 PUUID 거절 테스트를 추가하고 의도한 실패를 확인한다.
- [x] `beginIndex`를 요청 생성과 허용 경로에서 `begIndex`로 변경한다. 기존 페이지 범위 의미는 유지하고 실제 endIndex 포함 여부는 미확인으로 문서화한다.
- [x] 민감정보 차단을 유지하면서 고정 분류를 수집한다. 알려진 필드명은 `challengeTokensSelected`, `challengeTokenNamesSelected` 두 개만 표시한다.
- [x] 예시 `REPLACE_WITH_PUUID`를 거절하고 도구 버전을 1.0.1로 올린다.
- [x] Node 24 전체 테스트를 실행해 통과 여부를 확인한다.

## Task 2: 재검증 안내·증거·배포

**Files:** `tools/lcu-probe/README.md`, `docs/validation/lcu-report.md`, `.private/releases/lcu-probe-kit-1.0.1.zip`.

**Interfaces:** 기본 조회로 저장한 manifest의 `responses[].path`에서 실제 경기 ID를 문자열로 얻는다. 실제 PUUID는 사용자 입력으로 받는다. 사전 조회 실패 시 후속 명령은 실행하지 않는다.

- [x] 새 내전 없이 먼저 실행할 history/friends 명령, 대기 모드 내부 명령, 실제 ID 조회 절차를 README에 명시한다.
- [x] 첫 Windows 수집의 성공·오류·미확인 항목을 가명으로 보고서에 반영한다.
- [x] 독립 코드 리뷰를 받고 필요한 회귀 테스트와 수정을 반영한다.
- [x] 도구·문서·공개 테스트 자료만 zip으로 묶고 파일 목록·무결성을 검사한다.
- [x] 압축을 새 임시 디렉터리에 풀어 Node 24 전체 테스트와 help를 실행한다.

## 실행 기록

- 시작 기준: 이전 턴의 동일 코드 Node 24 테스트 18/18 PASS. 사용자 원본 zip에는 6개 세션, 5개 캡처, 9개 요청이 있으며 본 작업은 해당 원본을 수정하지 않는다.

- 회귀 테스트 6개 실패 확인 후 수정, Node 24 전체 22/22 PASS. 독립 읽기 전용 리뷰에서 지적 사항 없음. Windows 재실행·친구 원인·endIndex 의미는 미확인으로 유지.
- 배포 zip 14개 파일의 무결성·작업본 일치·기존 계정 식별자 미포함 확인. 별도 임시 폴더로 풀어 `node --test` 22/22 PASS, `--help` 버전 1.0.1 확인. 배포본에는 작업 내부용 재검증 계획 파일은 포함하지 않음.

## 후속 1.0.2 — 실제 Windows 결과 반영

- 승인 맥락: 사용자가 재검증 zip과 결과를 전달했으며, 기존 수정·원인 확인 작업을 계속한다.
- 증거: 1.0.1은 history 6/6 HTTP 200, CUSTOM_GAME 3건 수집. 친구는 sensitive-key/token/challengeTokensSelected. 실제 친구 값·위치·다른 token 키는 본문 미보관으로 미확인.
- 구현 선택: friends 배열 요소 lol.challengeTokensSelected의 빈 문자열 또는 최대 3개 숫자 ID 문자열(각 1~10자리)만 키 검사 예외. 현재 인증값·다른 키/경로/형식 차단 유지.
- [x] 오탐 저장 실패 재현 및 제한적 예외 구현; 원문 보존·인증값 차단·경로/형식 경계 테스트.
- [x] Node 24 전체 테스트 26/26 PASS.
- [x] 실제 경기 JSON 기준 보고서·필드 맵 갱신, README를 친구 1회 재조회로 단축.
- [x] 독립 리뷰 및 필요한 수정 반영. 중복 JSON 키가 앞선 인증값을 가리는 우회를 실패 테스트로 확인하고 원문 토큰·객체 범위 검사로 거절. 이스케이프 동등 키 포함 26/26 PASS; 재검토 추가 지적 없음.
- [x] 실제 데이터 없는 1.0.2 배포 zip 생성, 별도 추출본 테스트·무결성·식별자 미포함 확인. 14개 파일, 별도 추출본 26/26 PASS, help 1.0.2 확인. 이후 사용자 범위 정정으로 실제 Windows 친구 재조회 요청은 철회했다.
