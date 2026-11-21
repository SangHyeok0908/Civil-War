# 수집기 설치·자동 전송·화면 간소화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 수집자가 터미널 없이 설치하고 저장된 전송을 자동으로 이어 보내며 필요한 경기만 확인하도록 한다.

**Architecture:** 현재 Electron 주 프로세스의 계정·대기 요청 검증을 자동 재개 진입점으로 통합한다. React 화면에는 연결 모달과 3개 단위 페이지를 두고 서버의 관리자·모임 코드 계약을 함께 바꾼다. DB 구조와 참가자·경기·전송 요청 식별자는 유지한다.

**Tech Stack:** 기존 Electron, React, TypeScript, Java Spring Boot, PostgreSQL, SQLite와 고정된 설치 도구를 사용한다.

**Spec:** [이번 사용자 결정](../decisions/2026-10-28-ux-requirements.md#수집기-사용-간소화-추가-요구), [제품 정본](../../spec.md), [인증 계약](../../contracts/api.md).

## Global Constraints

- 운영자 고정 코드는 서버에서만 `2005`와 비교한다. 모임 코드는 앞자리 0을 보존하는 임의 숫자 6자리다.
- 설치판 서버 주소는 `https://ensharp.cloud`로 고정한다. 개발 실행의 별도 서버 설정은 유지한다.
- 앱 식별자·사용자 자료 폴더·기존 경기와 전송 요청을 유지한다. 새 확인 대기 경기를 자동 등록하지 않는다.
- 기존 모임 코드 교체·삭제의 전 기기 해제와 인증 실패 제한·관리자 세션 보호는 유지한다.
- 변경 이유는 결정 기록, 실행 증거는 검증 보고서, 현재 규칙은 정본에서 관리한다.

## Review Focus

- 같은 롤 계정이지만 재연결 전후 기기 인증이 달라진 저장 요청이 중복 등록 없이 재개되는가.
- 롤 종료·다른 계정·미확인 회원 연결·입력 오류 때 자동 재개가 권한을 넘어가지 않는가.
- 연결 팝업을 닫거나 페이지·필터를 바꾼 뒤 서버 상태가 갱신되어도 입력 초안이 보존되는가.
- 기존 긴 모임 코드와 인증을 가진 서버의 업그레이드가 경기·세션을 지우지 않는가.
- 설치 직후와 바탕화면 실행에 외부 환경 변수 없이 고정 주소가 적용되는가.

### Task 1: 계정 검증 후 자동 전송 재개

**Files:** `apps/collector/src/main/history-sync.ts`, `uploader.ts`, `outbox.ts`, `history-sync.test.ts`, `outbox.test.ts`, `apps/collector/src/preload/collector-api.ts`, `index.ts`, `apps/collector/src/main/ipc.ts`.

**Interfaces:** `CollectorService.tick(): Promise<void>`와 `enroll(code)`가 자동 복구한다. 렌더러용 수동 `resumeOwnRequests` 명령을 제거한다. `SafeAccount`는 대기 요청을 만든 계정 안내용 이름을 추가할 수 있다.

- [x] 같은 계정 재연결·재시작·계정 복귀 후 자동 성공, 다른 계정·인증 거절·포지션 오류의 비전송과 롤 종료 때 기존 권한의 저장 전송 유지, 기존 요청 ID·초안 보존 검사를 먼저 추가하고 실패를 확인한다.
- [x] `verified credential` 확인 후에만 `resumeVerified`를 호출하고 기존 업로더의 순서·지수 대기·서버 결과 선확인을 유지한다. 동시 tick을 하나로 합친다.
- [x] `pnpm test`에서 기존 검사와 새 재개 검사가 모두 통과하는지 확인한다.

### Task 2: 연결 모달·3경기 페이지·클릭 시 포지션 검사

**Files:** `apps/collector/src/renderer/AccountView.tsx`, `App.tsx`, `MatchList.tsx`, `MatchReview.tsx`, `MatchProgress.tsx`, `styles.css`, `apps/collector/src/main/fixture.ts`, `tests/e2e/collector.spec.ts`.

**Interfaces:** 연결 성공 시 닫히고 수동 닫기 후 재개방 동작을 제공하는 모달, 필터당 페이지 3개, 검증 실패 시 포지션 수정 안내 모달. 저장 초안은 현재 주 프로세스 저장 API를 사용한다.

- [x] Electron 검사에 3개 제한·페이지/필터 전환·초안 보존·코드 모달 닫기/성공·체크박스 없는 등록·포지션 미선택/중복 거절을 추가하고 실패를 확인한다.
- [x] 안내 문구를 `내전한 경기를 등록해주세요`, 계정 제목을 `수집자 계정`으로 바꾸고 경기 키·지속 연결 폼·체크박스·역할 확인 문장을 숨긴다.
- [x] 경기별 전송/결과 확인/재시도 남은 시간/계산 진행을 실제 관측에 맞게 표시한다. 사용자 조작이 필요한 경우 외에는 팝업을 띄우지 않는다.
- [x] 빌드 후 `pnpm test:e2e`와 타입 검사를 실행하고 화면 이미지를 남긴다.

### Task 3: 고정 관리자 로그인·숫자 모임 코드

**Files:** `apps/server/src/main/java/cw/auth/{AuthService,AuthController,AdminReadController,GroupCodeService}.java`, 숫자 생성기, 기존 코드 발급 CLI, `CivilWarApplication.java`, `apps/web/src/features/admin/{Codes,Login}.tsx`, 서버 인증 검사와 웹 검사 보조 설정.

**Interfaces:** `AuthService.login("2005")`는 반복 가능한 기존 형태의 안전한 세션을 발급한다. `/api/admin/codes`의 발급·조회·철회를 제거하고 모임 코드 API와 기기/브라우저 세션 관리는 유지한다.

- [x] 고정 코드의 반복 로그인·다른 값 거절·폐기된 발급 API·6자리/앞자리 0·재발급 시 다른 값·모든 기기 해제와 기존 기록 보존 검사를 먼저 추가하고 실패를 확인한다.
- [x] 발급 서비스/CLI를 제거한다. 과거 코드 DB 행과 감사 자료는 삭제하지 않고 더 이상 인증에 쓰지 않는다. 기존 기기·세션은 코드 변경만으로 해제하지 않는다. 기존 긴 공통 코드는 운영자가 재발급할 때까지 호환한다.
- [x] 기존 로그인 준비 코드를 고정 코드로 바꾸고, CSRF·Origin·추측 제한·세션 철회 검사를 유지한다.
- [x] 전용 테스트 DB에서 서버 전체 검사와 웹 브라우저 검사를 실행한다.

### Task 4: 설치 기본값·정본·최종 검증

**Files:** `apps/collector/src/main/main.ts`, 배포 서버 설정 모듈, `apps/collector/electron-builder.json`, `apps/collector/package.json`, `scripts/collector-release.test.mjs`, 설치/운영 안내, `docs/spec.md`, `docs/contracts/api.md`, `docs/status.md`, 이번 실행 보고서·정본 목록.

**Interfaces:** 설치용 빌드는 환경 변수와 무관하게 고정 HTTPS 서버로 연결한다. 설치판은 `0.4.0-provisional`로 구분하고 바로가기를 재생성하며 설치 종료 시 실행을 기본값으로 한다.

- [x] 설치용 빌드의 주소 고정·개발 설정 분리·이전 서버 주소 미사용을 검사하고 실패를 확인한다.
- [x] 설치 설정을 바꾸고 설치판을 생성·검증한다. 긴 경로 NSIS 오류의 기존 근거가 있으므로 같은 소스를 짧은 별도 빌드 경로에서 패키징한다.
- [x] 사용자 자료 경로·기존 대기 DB를 유지하는 더블클릭 업데이트 절차로 안내를 수정한다. 운영자 코드 발급 안내를 제거한다.
- [x] 타입·형식·단위·Electron·웹·서버·문서 검사와 설치 파일 무결성을 확인한다. 실제 Windows 설치·운영 서버 접속은 별도 미확인으로 기록한다.
- [x] 전체 변경을 독립 검토한 뒤 필요한 오류를 수정하고 검증 보고서에 결과·한계를 기록한다.
