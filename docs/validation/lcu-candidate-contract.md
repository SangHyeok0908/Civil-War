# 단계 0 후보 계약 — 2026-10-22

**2026-10-24 C07·지표 갱신:** [포함 관계 조사](lcu-objective-semantics.md)에서 목표물 피해에 포탑 피해가 포함됨을 확인했다. 사용자는 [D24](../superpowers/decisions/2026-10-22-overnight-decisions.md#d24--2026-10-24-목표물-공격-평가-기준-사용자-확정)에서 아래 단일 지표 구성을 최종 채택했다. 새 계산 버전 확정·반영과 전 경기 재계산·검증은 남아 있어 현재 임시 구현과 원본·후보 자료의 상태를 유지한다.

**상태: provisional / 전체 gate HOLD / 운영 계약 미확정.** [야간 결정 D01–D04](../superpowers/decisions/2026-10-22-overnight-decisions.md)에 따라 단계 1–3 draft 구현에서만 사용한다. Windows 실측 성공 범위를 확대하거나 단계 0 완료를 뜻하지 않는다.

## 후보 자료

`fixtures/lcu/candidates/h2-20261021/G1.json`–`G3.json`은 기존 실제 H2 Windows 응답의 **필드 부분집합**이다. 22개 수치 × 30행=660개, 챔피언·팀·승패·경기 길이·패치·맵·큐·완료 표시는 원본과 같다. G1 화면 대조는 기존 보고서의 증거를 이어받으며 이번에 새 화면을 측정한 것이 아니다.

다음 값은 실측값이 아니다. `gameId`는 9000000000000000000001–3 문자열, `gameCreation`은 2000-01-01~03 UTC의 합성 시각, `puuid`는 `fixture-player-01`~`10`이다. 참가자 순서가 바뀌어도 가명은 유지한다. 실제 ID·계정명·태그·보조 계정 ID·스크린샷·원본 경로·대응표·자유 문자열은 포함하지 않는다. 후보 시각으로 조회 지연·경기 순서를 검증하지 않는다. 이 후보는 완전한 익명성을 보장하는 데이터가 아니며 공개 서비스의 데모 선수·경기로 seed하지 않는다.

## 권고 정규화 v1

서버와 수집기에서 동일한 아래 규칙을 적용한다. 공개 후보의 닫힌 필드 허용 목록을 검사하는 `audit-candidates.mjs`는 **공개 fixture 감사기**다. 실제 LCU 응답 전체를 이 축소 스키마와 동일하다고 강제하는 제품 파서가 아니다. 제품 어댑터는 필요한 경로를 추출하고 원본의 추가 필드는 비공개 보존할 수 있으나, 필요한 경로의 누락·타입 변화는 거절한다.

| 출력 | 입력·검사 |
| --- | --- |
| `schemaVersion` | 정규화 출력 1; 지원하지 않는 입력 버전은 `UNSUPPORTED_SCHEMA` |
| `platformId`, `gameId` | 문자열, 비어 있지 않음; ID는 1–30자리 십진 문자열. 원본 정수 토큰은 lossless 파싱 후 문자열로 변환. 이미 정밀도를 잃은 Number는 거절. `platformId:gameId`를 키로 사용 |
| `startedAtUtc` | `gameCreation`의 유효 epoch **밀리초** → UTC ISO 8601. 양의 안전 정수, 누락/범위 초과는 오류. 후보의 시각은 합성임 |
| `durationSeconds` | `gameDuration` 양의 안전 정수. ms로 다시 나누지 않음 |
| 적격 유형 | 관찰된 `CUSTOM_GAME`, `CLASSIC`, mapId=11, queueId=3130, `GameComplete`. draft에서는 이 조합만 지원; 알 수 없는 조합은 `UNSUPPORTED_SCHEMA`. 3130을 모든 내전의 영구 큐로 일반화하지 않음 |
| `patch` | `gameVersion` 문자열 보존. 후보는 16.20.824.8524. 다른 패치의 계약 적합성은 별도 검사 |
| 참가자 연결 | `participantIdentities`와 `participants` 각각 정확히 10명, participantId는 양의 정수·배열별 고유·두 집합 일치. player.puuid는 비어 있지 않은 문자열·10개 고유. 배열 위치나 이름으로 join하지 않음 |
| 팀·승패 | 팀 100/200 각 5명, teams도 두 팀 고유, `Win`/`Fail` 한 팀씩; stats.win boolean이 팀 결과와 일치 |
| 챔피언·기록 | championId 양의 정수. 아래 통계는 전부 0 이상 안전 정수. 문자열/실수/음수/null/누락을 0으로 바꾸지 않음 |
| 아이템 | item0~6 모두 존재하는 7개 정수. 0은 빈 슬롯, 누락은 오류. 사전에 없는 ID는 숫자를 보존하고 이미지 fallback 사용 |
| 포지션 | 원본 lane/role을 최종 역할로 확정하지 않음. `rolesByPuuid`는 별도 등록 확인 요청에서 각 팀 5역할을 검사 |

필수 수치 매핑:

| 정규화 필드 | `participants[].stats` 원본 필드 |
| --- | --- |
| kills/deaths/assists | kills/deaths/assists |
| championDamage | totalDamageDealtToChampions |
| damageTaken | totalDamageTaken |
| laneCs / neutralCs | totalMinionsKilled / neutralMinionsKilled |
| goldEarned / visionScore | goldEarned / visionScore |
| objectiveDamage / turretDamage | damageDealtToObjectives / damageDealtToTurrets |
| items[0..6] | item0..item6 |

CS는 laneCs+neutralCs만 더한다. 아군/적 정글 하위값을 다시 합산하지 않는다. 후보에 함께 보존한 wardsKilled/wardsPlaced와 정글 하위값은 참고 필드이며 평가 필수 항목을 임의로 늘리지 않는다. `GameComplete`는 이상 없는 경기의 충분조건이 아니므로 수집자의 내전 확인을 유지한다.

누락은 `{path,code:'REQUIRED'}`, null/타입 오류는 `INVALID_TYPE`, 음수·범위 오류는 `OUT_OF_RANGE`, 참가자·팀 모순은 `INVALID_MATCH`에 상세 issues를 연결하는 방식을 권고한다. 예: 시야 점수 삭제 시 `participants.0.visionScore / REQUIRED`. 서버 응답과 로그에 거절한 원본 값·PUUID를 그대로 넣지 않는다. LCU PUUID와 공식 API PUUID는 별도 네임스페이스다.

## 확정한 지표와 현재 잠정 계산 버전

`objectiveDamage`와 `turretDamage`는 각각 원본 그대로 저장하고 화면에서도 별개 지표로 표시한다. 합계·차감으로 새로운 피해 필드를 만들지 않는다. 아직 증명하지 못한 `objectiveDamage >= turretDamage`를 제품 입력 불변식으로 강제하지도 않는다.

draft 평가 `objective-provisional-v1`에서는 TOP의 오브젝트 항목에 분당 turretDamage, JUNGLE/MIDDLE/BOTTOM/UTILITY에는 분당 objectiveDamage **한 지표만** 사용한다. 정해진 바깥 가중치와 역할별 표준화는 유지한다. D04에서는 기존 계획의 MIDDLE/BOTTOM 50:50 혼합을 잠정 보류했고, D24에서 사용자가 현재 단일 지표를 최종 채택해 혼합안은 적용하지 않는다. 포탑을 포함하는 목표물 피해에 포탑을 추가로 가중하지 않기 위한 기준이다. 지표 선택의 확정과 제품 반영 완료는 구분한다. 새 계산 버전 확정·반영, 계약·화면 설명 갱신, 모든 유효 경기의 재계산·검증은 남아 있다.

## 재현 감사

저장소 루트, Node 24:

```sh
node --test tools/lcu-probe/probe.test.mjs tools/lcu-probe/audit-candidates.test.mjs
node tools/lcu-probe/audit-candidates.mjs
node tools/lcu-probe/audit-candidates.mjs --source-dir .private/lcu/source-h2-20261021/2026-10-21T13-07-18-049Z-0IDsnC
```

마지막 명령은 해당 비공개 원본을 보유한 검증자만 실행한다. 파일 해시, 닫힌 후보 구조, 가명·팀 연결, 모든 660개 수치, 원본 식별자의 잔존을 검사하며 식별값은 출력하지 않는다. 공개 JSON은 2칸 들여쓰기·끝 개행의 canonical 인코딩을 요구해 중복 키에 숨은 값도 거절한다. 원본이 없는 CI의 결과는 원본 대조를 수행한 것으로 표시하지 않는다. 정상 결과에서도 `gate:HOLD`를 출력한다.
