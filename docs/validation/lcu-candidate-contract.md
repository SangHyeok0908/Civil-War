# 단계 0 후보 계약 — 2026-10-22

> 기록일 2026-10-22. 현재: [수집 계약](../contracts/api.md).

> 2026-10-25: 반복 설명을 정본 링크로 정리했다. 날짜별 사실·근거는 보존하며, 현재 링크의 값은 당시와 다를 수 있다.

**상태: provisional / 전체 gate HOLD / 운영 계약 미확정.** [야간 결정 D01–D04](../superpowers/decisions/2026-10-22-overnight-decisions.md)에 따라 단계 1–3 draft 구현에서만 사용한다. Windows 실측 성공 범위를 확대하거나 단계 0 완료를 뜻하지 않는다.

## 후보 자료

`fixtures/lcu/candidates/h2-20261021/G1.json`–`G3.json`은 기존 실제 H2 Windows 응답의 **필드 부분집합**이다. 22개 수치 × 30행=660개, 챔피언·팀·승패·경기 길이·패치·맵·큐·완료 표시는 원본과 같다. G1 화면 대조는 기존 보고서의 증거를 이어받으며 이번에 새 화면을 측정한 것이 아니다.

다음 값은 실측값이 아니다. `gameId`는 9000000000000000000001–3 문자열, `gameCreation`은 2000-01-01~03 UTC의 합성 시각, `puuid`는 `fixture-player-01`~`10`이다. 참가자 순서가 바뀌어도 가명은 유지한다. 실제 ID·계정명·태그·보조 계정 ID·스크린샷·원본 경로·대응표·자유 문자열은 포함하지 않는다. 후보 시각으로 조회 지연·경기 순서를 검증하지 않는다. 이 후보는 완전한 익명성을 보장하는 데이터가 아니며 공개 서비스의 데모 선수·경기로 seed하지 않는다.

## 권고 정규화 v1

2026-10-22 작성자는 관찰한 `CUSTOM_GAME / CLASSIC / mapId=11 / queueId=3130 / GameComplete`, 패치 `16.20.824.8524`에 한정한 어댑터를 권고했다. 모든 내전·패치를 지원한다는 결론은 아니었다([D03](../superpowers/decisions/2026-10-22-overnight-decisions.md#d03--실측-범위에-한정한-엄격한-정규화-초안)).

현재 원본 필드 매핑·누락/수치·참가자 검사 표는 [LCU 원본 정규화](../contracts/api.md#lcu-원본을-정규화하는-규칙)와 [공통 오류](../contracts/api.md#공통-형식과-오류)에서 관리한다. 당시 축소 후보의 필드 자체는 [G1](../../fixtures/lcu/candidates/h2-20261021/G1.json)·[G2](../../fixtures/lcu/candidates/h2-20261021/G2.json)·[G3](../../fixtures/lcu/candidates/h2-20261021/G3.json)과 [manifest](../../fixtures/lcu/candidates/h2-20261021/manifest.json)에 보존한다.

`audit-candidates.mjs`는 공개 후보의 닫힌 필드 구조를 검사하려고 만들었다. 전체 LCU 응답을 축소 fixture와 같게 강제하는 제품 파서와 구분한다. 이 차이를 유지하려고 제품은 필요한 경로를 검사하면서 추가 원본은 비공개 보존하는 안을 사용했다.

## 확정한 지표와 현재 잠정 계산 버전

후보의 원본 두 피해 필드를 보존한 사실과 평가에서 선택하는 지표는 별개다. 2026-10-24의 사용자 선택은 [D24](../superpowers/decisions/2026-10-22-overnight-decisions.md#d24--2026-10-24-목표물-공격-평가-기준-사용자-확정), 현재 계산 의미는 [활약 점수](../spec.md#경기별-활약-점수), 반영 여부는 [진행 상태](../status.md)를 따른다.

## 재현 감사

저장소 루트, Node 24:

<!-- ssot:preserve candidate-source-audit-command -->
```sh
node --test tools/lcu-probe/probe.test.mjs tools/lcu-probe/audit-candidates.test.mjs
node tools/lcu-probe/audit-candidates.mjs
node tools/lcu-probe/audit-candidates.mjs --source-dir .private/lcu/source-h2-20261021/2026-10-21T13-07-18-049Z-0IDsnC
```
<!-- /ssot:preserve candidate-source-audit-command -->

마지막 명령은 해당 비공개 원본을 보유한 검증자만 실행한다. 파일 해시, 닫힌 후보 구조, 가명·팀 연결, 모든 660개 수치, 원본 식별자의 잔존을 검사하며 식별값은 출력하지 않는다. 공개 JSON은 2칸 들여쓰기·끝 개행의 canonical 인코딩을 요구해 중복 키에 숨은 값도 거절한다. 원본이 없는 CI의 결과는 원본 대조를 수행한 것으로 표시하지 않는다. 정상 결과에서도 `gate:HOLD`를 출력한다.
