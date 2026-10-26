# C07 오브젝트·포탑 의미 감사 — 2026-10-22

**C07 HOLD.** 필드 존재·0 보존·G1 화면의 수치 일치는 확인됐다. 포함 관계와 차감값의 의미는 확정하지 못했다. 이번 작업은 기존 표본 재검사와 공식 명세 확인이며 새 Windows 경기 측정이 아니다.

## 1차 출처 확인

2026-10-22 KST에 [Riot Match-v5 공식 명세](https://developer.riotgames.com/apis#match-v5/GET_getMatch)의 페이지가 사용하는 [공식 상세 응답](https://developer.riotgames.com/api-details/match-v5)을 인증 없이 다시 읽었다. `damageDealtToObjectives`, `damageDealtToTurrets`, `damageDealtToBuildings`는 `int`로 나열되지만 설명 칸에서 피해 대상·포탑 포함 여부·합산식을 정의하지 않는다. `damageDealtToEpicMonsters`의 설명도 확보하지 못했다. 필드 이름과 타입은 의미의 충분한 계약이 아니다.

공식 상세 응답 SHA-256: `fb40838f6160a3ede81ce59b844e295328fda4c7ecb5f0d18f4f2f6869f2d64d`. 공개 문서 응답의 해시이며 사용자 경기나 계정의 해시가 아니다. 재현 명령은 다음과 같다. 명세가 바뀌면 해시도 달라질 수 있다.

```sh
curl --fail --silent --show-error --max-time 30 https://developer.riotgames.com/api-details/match-v5 -o /tmp/cw-match-v5-reference.json
```

[Riot의 League Client API 안내](https://developer.riotgames.com/docs/lol#league-client-api)는 LCU가 제3자용 공식 지원 인터페이스가 아니며 문서 완전성·변경 공지를 보장하지 않는다고 설명한다. 따라서 공식 Match-v5의 필드와 비슷하다는 이유로 LCU 의미를 전용하지 않는다. 커뮤니티 Swagger는 경로·타입 탐색에만 활용하며 의미 확정의 1차 출처로 삼지 않았다.

## 제공 표본 재검사

| 표본 | 이번에 재계산한 결과 | 결론의 한계 |
| --- | --- | --- |
| H2 LCU G1–G3, 30행 | objectives ≥ turrets 30/30; 같음 3/30; objectives=0 1행, turrets=0 4행 | 포함 관계와 원인까지 증명하지 않음 |
| 기존 G1 결과 화면 | 두 필드 각각 10/10 일치, 전부 양수 | 기존 화면 검증을 유지; 이번 새 측정 아님 |
| 공식 포털 솔로랭크 6경기, 60행 | objectives−turrets−epicMonsters = 0이 46행, 1이 14행; buildings=turrets 60/60 | 정수화/집계 시점 등 1 차이의 원인은 미확인; LCU와 다른 표본·경로 |

조기 종료 20행의 피해가 모두 0이므로 이를 제외한 공식 API 행에서 정확한 합산 일치는 26/40이다. ‘대체로 같음’을 정확한 등식으로 만들지 않는다. 원본에서 확인한 11,616−4,931=6,685와 epicMonsters 6,684의 차이도 유지한다. 원본 수치는 `.private/riot/portal-solo-20261022/damage-projection.json`과 H2에 보존하고 식별값을 공개하지 않는다.

이번 확인에서 두 필드가 독립적이라는 근거를 얻지 못했다. **중복 가능성이 높다는 추론**과 포함 관계가 입증됐다는 주장을 구분한다. `objectives + turrets`를 총 피해로 표시하지 않고 `objectives - turrets`를 중립/에픽 몬스터 피해로 이름 붙이지 않는다. buildings와 turrets의 표본상 같음도 모든 구조물의 의미가 같다는 계약이 아니다.

## 잠정 결정과 닫기 위한 증거

원본 두 필드를 각각 보존한다. 단계 1–3 draft는 [후보 계약](lcu-candidate-contract.md)의 `objective-provisional-v1`을 사용한다. TOP은 포탑, 다른 포지션은 오브젝트 단일 지표를 선택하며 바깥 가중치는 유지한다. 기존 MIDDLE/BOTTOM 혼합 정책의 변경과 되돌리기 비용은 [D04](../superpowers/decisions/2026-10-22-overnight-decisions.md)에 명시했다. 이는 미확정 의미를 검증 완료로 바꾸지 않는다.

C07을 닫으려면 현재 LCU 필드의 포함 대상과 단위를 설명하는 신뢰 가능한 정의, 또는 피해 대상을 구분할 수 있고 결과 화면·필드와 연결된 적절한 관찰이 필요하다. 이미 생략하기로 한 G2/G3 추가 화면이나 고의 비정상 내전은 요구하지 않는다. 얻지 못하면 HOLD와 잠정 평가 표시를 유지하며 운영 준비 완료를 선언하지 않는다.
