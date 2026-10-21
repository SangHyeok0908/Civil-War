# LCU 실측 필드 맵

- 상태: **과거 사용자 설정 경기 3건의 JSON 구조 확인 — 결과 화면 대조 대기**
- 관련 판정: [LCU 검증 보고서](lcu-report.md), 전체 `gate: HOLD`
- 증거 H2: 제공된 `lcu-probe-kit-1.0.1.zip` 안의 `.private/lcu/pc-a-history-20261021-220717/2026-10-21T13-07-18-049Z-0IDsnC/`.
- G1=`004-game.json`, G2=`005-game.json`, G3=`006-game.json`; H2 목록=`003-history.json`.
- 아래 경로·타입·존재 여부는 실제 JSON 관찰이다. 단위·게임 내 의미·결과 화면 수치와의 일치는 별도 검증이며 제품 데이터 계약을 확정하지 않는다. 실제 계정명·PUUID·경기 ID는 문서에 싣지 않는다.

## 1. 경기와 계정 식별

| 확인 대상 | 실제 JSON 경로 | 타입·관찰 | 검증 한계·누락 처리 | 증거 |
| --- | --- | --- | --- | --- |
| 지역·플랫폼 | `platformId` | 문자열 `KR` | 두 PC 같은 경기 키 대조 대기 | G1–G3 |
| 경기 ID | `gameId` | 원본 JSON 정수, 도구에서 문자열 보존; 목록·상세 ID 일치 | `platformId:gameId` 계약 확정은 두 PC 대조 후 | H2 목록, G1–G3 |
| 사용자 설정 경기 구분값 | `gameType` | 세 경기 모두 `CUSTOM_GAME` | 다른 내전 조건과 일반 경기 비교 필요 | G1–G3 |
| 맵·모드·큐 | `mapId`, `gameMode`, `queueId` | `11`, `CLASSIC`, `3130` | 이번 자료의 관찰값. queueId를 0으로 고정하거나 다른 큐를 추정하지 않음 | G1–G3 |
| 완료 표시 | `endOfGameResult` | 문자열 `GameComplete` | 정상 경기 판정의 충분조건으로 확정하지 않음 | G1–G3 |
| 경기 일시 | `gameCreation`, `gameCreationDate` | 정수 epoch 밀리초와 ISO UTC 문자열이 같은 시각을 나타냄; KST 2026-10-10 | 경기 시작/생성 시각이며 종료 시각과 구분 | G1–G3 |
| 경기 시간 | `gameDuration` | 정수 1942, 3062, 2003; 초로 해석하면 32:22, 51:02, 33:23 | 단위·화면 시간 대조 대기. 누락을 0으로 채우지 않음 | G1–G3 |
| 참가자 식별 | `participantIdentities[].player.puuid` | 문자열; 경기마다 비어 있지 않은 고유 PUUID 10개 | 이름 대신 PUUID로 연결 검토; 두 수집자 대조 대기 | G1–G3 |
| 보조 계정 ID | `participantIdentities[].player.accountId`, `.summonerId` | 원본 JSON 정수; 도구에서 문자열 보존 | PUUID 대체 여부 임의 결정 금지 | G1–G3 |
| Riot ID·이름 | `participantIdentities[].player.gameName`, `.tagLine`, `.summonerName` | 문자열 필드 존재 | 표시용이며 계정 식별 키와 분리 | G1–G3 |
| 참가자 연결 | `participants[].participantId`, `participantIdentities[].participantId` | 각 경기 두 배열의 ID 집합 일치; 각각 10명 | 중복·누락 시 보류 | G1–G3 |
| 팀 구성 | `participants[].teamId`, `teams[].teamId` | 팀 100/200, 각 5명 | 실제 화면 팀 구성 대조 대기 | G1–G3 |
| 승패 | `participants[].stats.win`, `teams[].win` | boolean과 `Win`/`Fail`; 참가자·팀 값 모두 일치 | 화면 승패 대조 대기, 누락을 패배로 처리하지 않음 | G1–G3 |
| 친구의 식별자 | 미확인 | HTTP 200이나 민감 키 검사로 본문 미보관 | 1.0.2 친구 재조회 필요 | friends 1.0.1 manifest |

## 2. 참가자 통계

세 경기의 참가자 행 30개에서 아래 기본 통계는 모두 존재하며 null이 없다. 같은 사람이 여러 경기에 참여할 수 있으므로 30명의 서로 다른 사람이라는 뜻은 아니다. 숫자 필드의 게임 내 의미·단위는 화면 대조 전까지 확정하지 않는다.

| 확인 대상 | 실제 JSON 경로 | 타입·관찰 | 필요한 대조·누락 처리 | 증거 |
| --- | --- | --- | --- | --- |
| 챔피언 | `participants[].championId` | 정수, 30/30 존재 | 실제 챔피언과 화면 대조 | G1–G3 |
| K/D/A | `participants[].stats.kills`, `.deaths`, `.assists` | 정수, 30/30 존재 | 화면 수치 대조; 누락을 0으로 채우지 않음 | G1–G3 |
| 챔피언 대상 피해량 | `participants[].stats.totalDamageDealtToChampions` | 정수, 30/30 존재 | 전체 피해량 필드와 구분, 화면 대조 | G1–G3 |
| 받은 피해량 | `participants[].stats.totalDamageTaken` | 정수, 30/30 존재 | 대상 범위·화면 수치 대조 | G1–G3 |
| CS 구성 | `participants[].stats.totalMinionsKilled`, `.neutralMinionsKilled` | 정수, 30/30 존재 | 두 필드 합산과 화면 CS 일치 여부 대기. `.neutralMinionsKilledTeamJungle`/`.neutralMinionsKilledEnemyJungle`도 존재하나 추가 합산하지 않음 | G1–G3 |
| 획득 골드 | `participants[].stats.goldEarned` | 정수, 30/30 존재 | 보유 골드와 구분; 화면 대조 | G1–G3 |
| 시야 점수 | `participants[].stats.visionScore` | 정수, 30/30 양수, 10–172 | 실제 0 사례 미확보; 화면 대조 대기 | G1–G3 |
| 와드 제거 수 | `participants[].stats.wardsKilled` | 정수, 30/30 존재 | 화면 의미 대조 | G1–G3 |
| 아이템·장신구 | `participants[].stats.item0`~`.item6` | 7개 정수 슬롯, 30/30 존재; item0~5에서 0 총 7개, item6은 모두 양수 | 0이 빈 슬롯인지, item6의 장신구 의미를 화면으로 대조 | G1–G3 |
| 오브젝트 피해량 | `participants[].stats.damageDealtToObjectives` | 정수, 30/30 존재, 0은 1개·양수 29개 | 포탑 피해 포함 여부와 단위 미확인; 중복 합산 금지 | G1–G3 |
| 포탑 피해량 | `participants[].stats.damageDealtToTurrets` | 정수, 30/30 존재, 0은 4개·양수 26개 | 오브젝트 피해와의 관계·화면 대조 대기 | G1–G3 |
| 역할 힌트 | `participants[].timeline.lane`, `.role` | lane=`BOTTOM/JUNGLE/MIDDLE/TOP`, role=`CARRY/NONE/SOLO/SUPPORT` | 사용자 설정 경기 관찰값. 솔로랭크 자료와 실제 포지션의 정확성 미검증 | G1–G3 |
| 독립 타임라인 이벤트 | 미확인 | 이번에는 game-timelines 경로 미호출 | 상세의 `timeline` 요약 필드와 이벤트 타임라인을 혼동하지 않음 | 없음 |

## 3. 해석과 검증 기록

- **0 / 누락 / null:** 표의 기본 필드는 30/30 존재하고 null이 없다. 피해량·아이템 등에서 실제 0이 관찰됐다. 누락값 보정은 수행하지 않았다.
- **스키마:** 세 경기의 참가자 `stats` 키 집합이 모두 동일하다. 서로 다른 패치·큐의 구조 일치는 아직 검증하지 않았다.
- **목록 페이지:** `begIndex=0&endIndex=2` 요청에 `gameIndexBegin=0`, `gameIndexEnd=2`, `gameCount=3`과 3개 경기가 반환됐다. 이번 페이지는 끝 인덱스 포함 동작과 일치한다. 다른 범위의 포함 규칙·최대 페이지·보관 기한은 미확인이다.
- **과거 범위:** 이번에 약 12일 전 사용자 설정 경기 3건을 조회했다. 전체 보관 기간이나 최소 보장 기간으로 일반화하지 않는다.
- **아직 필요한 증거:** 결과 화면, 같은 경기의 두 번째 참가자 PC, 클라이언트 재시작 전후 비교, 새 경기 종료 후 반영 지연, 친구 식별 자료·다른 참가자 기록 접근 범위.
