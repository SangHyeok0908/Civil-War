# C07 오브젝트·포탑 피해 포함 관계 확인

> **과거 기록 · 2026-10-24.** 현재 기준은 [정본](../status.md)을 따른다.

> **2026-10-25 편집 보완:** 반복 설명을 정본 링크로 줄였다. 사건 날짜·실측값은 당시 기록이며 현재 링크로 갱신하지 않았다.

**2026-10-24: 공식 통계 정의상 포탑 피해는 오브젝트(목표물) 피해의 포함 대상이다.** Riot의 과거 공식 설명, 설치된 클라이언트의 화면·필드 연결, 기존 G1 화면 대조를 연결한 판정이다. 2026-10-24 당시 C07의 지표 의미 확인을 PASS, 전체 단계 0은 **새 계산 버전 반영·재계산·검증 미실행으로 HOLD**로 기록했다. 현재 반영·검증은 [진행 상태](../status.md#남은-작업-순서)를 따른다. 새 Windows 경기나 피해 대상을 나눈 통제 실험을 수행한 결과는 아니다.

## 확인한 의미와 계산상의 제한

| 지표 | 2026-10-24 확인한 해석 | 조사에서 사용한 한계 |
| --- | --- | --- |
| `damageDealtToObjectives` → `objectiveDamage` | 에픽 몬스터와 구조물에 가한 피해를 집계하는 결과 통계. 포탑 피해를 포함하며, 억제기 피해를 포함하도록 수정된 공식 이력도 있음 | 몬스터 전용 피해라는 해석을 배제했다. 원본 정수 누적값을 대조했다 |
| `damageDealtToTurrets` → `turretDamage` | 포탑에 가한 피해를 별도로 보여 주는 결과 통계 | 포함 관계를 확인했으며 합산한 총 피해는 이 조사에서 만들지 않았다 |
| `objectiveDamage - turretDamage` | 포탑을 제외한 잔여값 | 다른 구조물 가능성과 집계 오차가 남아 에픽/중립 몬스터 피해로 확정하지 못했다 |

포탑이 목표물 피해의 포함 대상이라는 의미와 정수 필드 사이에 항상 정확한 합산식이 성립한다는 주장은 구분한다. `objectives = turrets + epicMonsters`를 데이터 계약으로 만들지 않으며, 모든 패치·모드의 피해 집계나 소환물 피해 귀속까지 이번 조사로 확정하지 않는다.

## 1차 출처와 기존 LCU 자료를 연결한 근거

### Riot의 공식 통계 설명

[7.9 공식 패치 노트의 2017-05-04 보관본](https://web.archive.org/web/20170504081043/http://na.leagueoflegends.com/en/news/game-updates/patch/patch-79-notes)의 `Contribution Clarity` → `End of Game Stats`는 새 통계를 다음과 같이 설명한다.

> Damage Dealt to Objectives (damage dealt to Epic Monsters and Structures)

같은 절에서 포탑 피해 통계도 별도로 소개한다. Riot의 [현재 게임 안내](https://www.leagueoflegends.com/en-us/how-to-play/)도 `CLEAR THE PATH`에서 포탑과 억제기를 방어 구조물로 설명한다. 따라서 위 통계 정의에서 포탑은 목표물에 포함되는 구조물로 해석한다.

[7.24 공식 패치 노트의 2017-12-06 보관본](https://web.archive.org/web/20171206053701/https://na.leagueoflegends.com/en/news/game-updates/patch/patch-724-notes)은 버그 수정 목록에 다음을 기록한다.

> Damage to objectives now counts inhibitor damage in the end-of-game stats

이는 목표물 피해를 포탑과 에픽 몬스터만의 정확한 합으로 정의하면 안 되는 추가 근거다. 넥서스를 포함한 모든 구조물의 현행 세부 집계 규칙은 확보하지 못했다.

2026-10-24에 원래 공식 URL은 최신 업데이트 목록으로 이동했다. 위 근거는 Internet Archive가 보존한 **Riot 원문**을 직접 내려받아 확인했다. 원문 HTML 전체는 비공개 조사 폴더에 보존하고, 보관 시각·출처 URL·응답 해시는 [공개 증거 요약](lcu-objective-evidence-20261024.json)에 남긴다.

### 설치된 Riot 클라이언트의 필드 연결

macOS에 설치된 공식 배포물의 `Plugins/rcp-fe-lol-match-history/assets.wad`를 읽었다. `Game.ok`의 설치 게임 버전은 `16.20.8297896`이다. Windows에서 수집한 경기의 `gameVersion=16.20.824.8524`와 같은 16.20 계열이지만 빌드와 운영체제는 다르다.

경기 기록 화면의 코드와 한국어 문자열에서 다음 연결을 확인했다.

| 화면 문자열 키의 끝부분 | 한국어 표시 | 원본 필드 | 표시 형식 |
| --- | --- | --- | --- |
| `DMG_DEALT_TOTAL_OBJECTIVES` | 목표물에게 가한 피해량 | `damageDealtToObjectives` | `number` |
| `DMG_DEALT_TOTAL_TURRETS` | 포탑에게 가한 피해량 | `damageDealtToTurrets` | `number` |

키의 공통 접두사는 `MATCH_HISTORY_STATS_ATTR_`다. 코드에서 두 원본 필드를 직접 선택하며 이 매핑에는 합산·차감·분당 변환이 없다. 기존 Windows G1 결과 화면에서 각 필드가 10명 모두 원본과 일치한 증거도 유지한다. 따라서 공식 문서의 결과 화면 통계와 이 서비스가 읽는 필드를 연결할 근거가 있다.

이 연결과 기존 수치를 종합하여 **관찰한 소환사의 협곡 경기의 지표 해석은 ‘포탑을 포함하는 목표물 피해’로 채택**한다. 현행 필드의 모든 피해 이벤트를 재현한 증명이나 Riot의 LCU 지원 보장이라는 뜻은 아니다. 압축 해제된 코드 전체는 공개하지 않고 WAD 및 선택한 항목의 해시·항목 번호·필드 연결만 증거 요약에 보존한다.

### 공식 API 명세가 설명하지 않는 범위

2026-10-24에 [Match-v5 공식 상세 응답](https://developer.riotgames.com/api-details/match-v5)을 다시 읽었다. `damageDealtToObjectives`, `damageDealtToTurrets`, `damageDealtToBuildings`는 여전히 `int`로만 나열되고 피해 대상이나 합산식은 설명하지 않는다. 이번 응답 해시는 `e98cf514af947a324e6735cf6bc90cdc73e7cb652b43001319e76578f1475e0f`다. 2026-10-22 응답의 해시 `fb40838f6160a3ede81ce59b844e295328fda4c7ecb5f0d18f4f2f6869f2d64d`와 구분한다.

[Riot의 League Client API 안내](https://developer.riotgames.com/docs/lol#league-client-api)에 따르면 LCU는 제3자용으로 공식 지원되지 않고 완전한 문서나 변경 공지를 보장하지 않는다. 이번 의미 판정은 결과 통계의 공식 설명과 클라이언트 화면 연결에 근거한다.

## 기존 표본의 재계산 — 2026-10-24

| 표본 | 재계산 결과 | 결론의 한계 |
| --- | --- | --- |
| H2 LCU G1–G3, 참가자 30행 | objectives ≥ turrets 30/30; 같음 3/30; objectives=0 1행, turrets=0 4행 | 공식 정의와 모순되지 않음. 부등식 자체는 포함 관계의 증명이 아님 |
| 기존 G1 결과 화면 | 두 필드 각각 10/10 일치, 전부 양수 | 기존 화면 검증을 이어받음. 이번 새 측정 아님 |
| 공식 포털 솔로랭크 6경기, 참가자 60행 | objectives−turrets−epicMonsters = 0이 46행, 1이 14행; buildings=turrets 60/60 | 1 차이의 원인은 미확인. LCU와 다른 표본·경로 |

조기 종료 2경기의 20행을 제외하면 정확한 합산 일치는 26/40행이다. 네 피해 필드가 모두 0인 행은 전체 60행 중 21행으로, 조기 종료 경기 외에도 1행이 있다. 네 필드가 전부 0인 행을 모두 제외하면 25/39행이 정확히 일치한다. 두 제외 기준을 혼동하지 않는다. 기존 예시인 11,616−4,931=6,685와 epicMonsters 6,684의 차이도 유지한다.

공개 후보 감사기를 기존 비공개 원본과 함께 재실행해 통계 660개 보존과 식별자 잔존 없음도 확인했다. 원본 경기·계정·화면은 공개하지 않으며 `fixtures/lcu/candidates/`를 검증 완료 자료로 바꾸지 않는다. 감사기의 `gate:HOLD` 출력은 유지한다.

## 사용자 확정 지표와 남은 제품 반영

2026-10-24의 사용자 선택은 [D24](../superpowers/decisions/2026-10-22-overnight-decisions.md#d24--2026-10-24-목표물-공격-평가-기준-사용자-확정)에 보존한다. 적용할 기준은 [현재 명세](../spec.md), 실제 반영·검증 상태는 [현재 상태](../status.md)를 따른다. 이 조사는 통계 의미의 근거이며 제품 반영의 증거가 아니다.

## 증거 재확인

[공개 증거 요약](lcu-objective-evidence-20261024.json)은 공식 원문 URL·해시, 설치 클라이언트의 WAD/선택 항목 해시, 필드 연결, 표본별 집계만 포함한다. 원문과 압축 해제 자료는 `.private/lcu/c07-20261024/`, 기존 공식 API 수치는 `.private/riot/portal-solo-20261022/`에 보존한다. 클라이언트가 업데이트되면 로컬 해시는 달라질 수 있다.

2026-10-24 조사에서 사용한 원본 경로·보관본 시각·해시를 재확인하는 한정된 명령이다. 비공개 원본 보유 환경이 필요하며 일반 개발 실행법은 [개발 안내](../development/setup.md)에서 관리한다:

```sh
node tools/lcu-probe/audit-candidates.mjs --source-dir .private/lcu/source-h2-20261021/2026-10-21T13-07-18-049Z-0IDsnC
curl --fail --silent --show-error --max-time 30 'https://web.archive.org/web/20170504081043id_/http://na.leagueoflegends.com/en/news/game-updates/patch/patch-79-notes' -o /tmp/cw-c07-patch-7.9.html
curl --fail --silent --show-error --max-time 30 'https://web.archive.org/web/20171206053701id_/https://na.leagueoflegends.com/en/news/game-updates/patch/patch-724-notes' -o /tmp/cw-c07-patch-7.24.html
shasum -a 256 /tmp/cw-c07-patch-7.9.html /tmp/cw-c07-patch-7.24.html
```

## 이전 판정 이력

2026-10-22에는 공식 API 명세와 기존 표본만 검토하여 포함 관계를 확정하지 못했고 C07을 보류했다. 이번에는 공식 패치 노트 원문과 설치 클라이언트의 화면 매핑을 추가해 그 판단을 갱신했다. 이전 Windows 관측과 사용자 결정으로 제외한 검증의 상태는 유지한다.
