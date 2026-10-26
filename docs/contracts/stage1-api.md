# Stage 1 HTTP/JSON contract — v1 provisional

> 기록일 2026-10-22. 현재: [API 정본](api.md).

> 2026-10-25: 반복 설명을 정본 링크로 정리했다. 날짜별 사실·근거는 보존하며, 현재 링크의 값은 당시와 다를 수 있다.

2026-10-22의 `apps/server` T01–T04 임시 계약 기록이다. 당시 단계 0은 HOLD였고 Windows 검증 완료를 주장하지 않았다. [후보 계약](../validation/lcu-candidate-contract.md)으로 관찰 범위를 제한했으며 [1단계 스키마](stage1.schema.json)는 당시 평가 미구현 상태의 자료 구조를 보존한다. 현재 운영 계약의 정본은 [api.md](api.md)다.

## Encoding and errors

1단계에서 문자열 ID, 정밀도를 보존하는 원본 파싱, 엄격한 입력 오류를 계약으로 도입했다. 당시 자료형·상한·오류 코드는 [1단계 스키마](stage1.schema.json)의 고정 증거를 참조한다. 현재 HTTP 형식·오류·재시도 경계는 [공통 형식과 오류](api.md#공통-형식과-오류)에 있다.

## Authentication

T03의 코드 인증·기기 권한·운영자 쿠키/CSRF 경계를 기술했다. 당시 프록시 신뢰 설정은 4단계로 남겼고 요청 제한기는 직접 원격 IP를 기준으로 서버 재시작 시 초기화됐다. 이 한계는 운영 준비 완료 증거가 아니었다. 현재 경로·유효 기간·요청 형식은 [인증과 권한](api.md#인증과-권한), 선택 이유는 [D10](../superpowers/decisions/2026-10-22-overnight-decisions.md#d10--인증과-http-기본값의-명시적-운영-한계)을 참조한다.

## Members

1단계는 안정적인 회원 연결과 관리자가 지정하는 역할·초기 실력을 저장했으며 자동 티어 추정을 구현하지 않았다. 당시 요청·응답 모델은 [Member 스키마](stage1.schema.json), 현재 경로와 검증은 [회원 계약](api.md#회원)에 있다.

## Normalized match

1단계 예시에 쓴 `gameId=9000000000000000000001`, `2000-01-01T00:00:00Z`는 합성값이며 특정 참가자의 실측 주장이 아니었다. 실제 수치는 [후보 자료](../validation/lcu-candidate-contract.md#후보-자료), 당시 출력은 [1단계 스키마](stage1.schema.json)에 보존한다. 현재 필드 매핑·필수 조건은 [LCU 원본 정규화](api.md#lcu-원본을-정규화하는-규칙)를 따른다.

## Collector match workflow

T02에서 수집과 별도 등록 확인을 나눴고 원래 참가자·첫 확정·취소 상태를 보존하는 중복 처리를 구현했다. 당시 검증 결과는 [1단계 보고서](../validation/stage1-report.md)에 있다. 실행 중 사용할 경로·응답·원자성 조건은 [경기 수집·등록과 중복 처리](api.md#경기-수집등록과-중복-처리)를 참조한다.

## Public records and owner corrections

**당시 1단계 차이:** 공개 경기에는 아직 점수 배열과 계산 세대가 없었다. `evaluationStatus:"recalculating"`, `scoringVersion:null`을 내보냈고 T08–T09가 이후 작업을 소비하도록 남겼다. 관리자 상세도 이 단계에는 `record,rawMatch,audit`였으며 정밀도 보존용 `rawJson`은 3단계 보완이다. 고정 출력 증거는 [stage1.schema.json](stage1.schema.json), 후속 변경은 [3단계 기록](stage3-api.md)에 있다.

현재 페이지 필터·응답·수정 권한은 [공개 기록과 관리자 정정](api.md#공개-기록과-관리자-정정)을 따른다.

## Stage 3 integration points

1단계는 `service_state`와 영속 `recalculation_jobs`, 호출 트랜잭션에 참여하는 `MutationCoordinator`를 다음 단계의 연결점으로 마련했다. `MatchRepository`는 JPA/Specification을 쓰고 보존한 v1 JSON을 다시 읽었다. 평가 알고리즘·솔로 참고 자료는 이 단계 통계에 넣지 않았다. 후속 완성 계약은 [계산 규칙 검증·게시·복구](api.md#계산-규칙-검증게시복구), 단계별 증거는 [3단계 보고서](../validation/stage3-report.md)를 참조한다.
