# LCU 실측 필드 맵

> **과거 기록 · 2026-10-21.** 현재 기준은 [정본](../status.md)을 따른다.

> **2026-10-25 편집 보완:** 반복 설명을 정본 링크로 줄였다. 사건 날짜·실측값은 당시 기록이며 현재 링크로 갱신하지 않았다.

- 상태: **과거 사용자 설정 경기 3건의 JSON 구조 확인 — G1 화면 숫자 통계·아이템 슬롯 점유 일치**
- 당시 판정 이력: [LCU 검증 보고서](lcu-report.md#5-gate-판정과-다음-단계). 현재 적용·검증 상태는 [진행 상태](../status.md#단계별-확인-범위).
- 2026-10-22에 [공개 후보 계약](lcu-candidate-contract.md)을 추가했고, 이후 [C07 의미 감사](lcu-objective-semantics.md)에 2026-10-24 조사를 보완했다. 당시 공개 후보의 gameId·gameCreation은 합성값이므로 아래 원본 시각 실측과 구분한다.
- 증거 H2: 제공된 `lcu-probe-kit-1.0.1.zip` 안의 `.private/lcu/pc-a-history-20261021-220717/2026-10-21T13-07-18-049Z-0IDsnC/`.
- G1=`004-game.json`, G2=`005-game.json`, G3=`006-game.json`; H2 목록=`003-history.json`.
- 화면 증거 S1~S5: 사용자 제공 G1(32:22) 점수판·개요·통계 5장. [G1 화면 대조 보고서](../../.private/lcu/test-data-h2-20261021/screen-G1-review.md). G1을 대표 경기로 삼으며 G2·G3 추가 화면 대조는 사용자 결정으로 생략한다.
- [테스트 자료 준비 결과](lcu-test-data.md): 같은 계정 가명을 유지한 G1–G3 후보·비교표·기대값 준비 완료. 원본 수치 대조와 식별자 잔존 검사를 마쳤으며 실기 gate는 HOLD다.
- 아래 경로·타입·존재 여부는 실제 JSON 관찰이다. G1 화면과 확인한 범위는 아래에 명시하며 미확인 의미까지 확정하거나 제품 데이터 계약을 확정하지 않는다. 실제 계정명·PUUID·경기 ID는 문서에 싣지 않는다.
- 친구 목록 조회는 사용자 요청으로 범위에서 제외한다. 참가자 식별에는 경기 상세를 사용한다. 2026-10-22부터 다른 참가자의 솔로랭크는 [Riot 공식 API](riot-solo-reference.md)로 검증하며 LCU PUUID와 공식 API PUUID의 일치를 미리 가정하지 않는다.

## 1. 경기와 계정 식별

| 확인 대상 | 실제 JSON 경로 | 타입·관찰 | 검증 한계·누락 처리 | 증거 |
| --- | --- | --- | --- | --- |
| 지역·플랫폼 | `platformId` | 문자열 `KR` | 다른 PC의 경기 키 대조는 사용자 결정으로 생략 | G1–G3 |
| 경기 ID | `gameId` | 원본 JSON 정수, 도구에서 문자열 보존; 목록·상세 ID 일치 | `platformId:gameId`의 참가자 간 일치는 사용자 결정에 따른 전제; 다른 PC 실측은 범위 제외 | H2 목록, G1–G3 |
| 사용자 설정 경기 구분값 | `gameType` | 세 경기 모두 `CUSTOM_GAME` | 다른 내전 조건과 일반 경기 비교 필요 | G1–G3 |
| 맵·모드·큐 | `mapId`, `gameMode`, `queueId` | `11`, `CLASSIC`, `3130` | 이번 자료의 관찰값. queueId를 0으로 고정하거나 다른 큐를 추정하지 않음 | G1–G3 |
| 완료 표시 | `endOfGameResult` | 문자열 `GameComplete` | 정상 경기 판정의 충분조건으로 확정하지 않음 | G1–G3 |
| 경기 일시 | `gameCreation`, `gameCreationDate` | 정수 epoch 밀리초와 ISO UTC 문자열이 같은 시각을 나타냄; KST 2026-10-10 | 경기 시작/생성 시각이며 종료 시각과 구분 | G1–G3 |
| 경기 시간 | `gameDuration` | 정수 1942, 3062, 2003; 초로 해석하면 32:22, 51:02, 33:23 | G1의 1942초=32:22 화면 일치. G2·G3 추가 화면 대조는 범위 제외. 누락을 0으로 채우지 않음 | G1–G3 |
| 참가자 식별 | `participantIdentities[].player.puuid` | 문자열; 경기마다 비어 있지 않은 고유 PUUID 10개 | 이름 대신 PUUID로 연결 검토; 두 수집자 대조는 범위 제외 | G1–G3 |
| 보조 계정 ID | `participantIdentities[].player.accountId`, `.currentAccountId`, `.summonerId` | 원본 JSON 정수; 도구에서 문자열 보존. 두 accountId 필드는 30행 모두 0이며 summonerId는 별도 값 | 0인 공통 자리표시 값을 계정 연결 키로 사용하지 않음. PUUID 대체 여부 임의 결정 금지 | G1–G3 |
| Riot ID·이름 | `participantIdentities[].player.gameName`, `.tagLine`, `.summonerName` | 문자열 필드 존재 | 표시용이며 계정 식별 키와 분리 | G1–G3 |
| 참가자 연결 | `participants[].participantId`, `participantIdentities[].participantId` | 각 경기 두 배열의 ID 집합 일치; 각각 10명 | 중복·누락 시 보류 | G1–G3 |
| 팀 구성 | `participants[].teamId`, `teams[].teamId` | 팀 100/200, 각 5명 | G1의 화면 1번 팀=200, 2번 팀=100과 5+5 일치. 다른 경기의 화면 팀 번호로 일반화하지 않음 | G1–G3 |
| 승패 | `participants[].stats.win`, `teams[].win` | boolean과 `Win`/`Fail`; 참가자·팀 값 모두 일치 | G1의 teamId=200 승리·100 패배 일치. G2·G3 추가 화면 대조는 범위 제외; 누락을 패배로 처리하지 않음 | G1–G3 |

## 2. 참가자 통계

세 경기의 참가자 행 30개에서 아래 기본 통계는 모두 존재하며 null이 없다. 같은 사람이 여러 경기에 참여할 수 있으므로 30명의 서로 다른 사람이라는 뜻은 아니다. G1의 15개 필수 숫자 통계 × 10명=150개는 화면과 일치한다. G2·G3 추가 화면 대조는 사용자 결정으로 생략하며 아래에 미확인으로 명시한 의미만 계속 남겨 둔다.

| 확인 대상 | 실제 JSON 경로 | 타입·관찰 | 필요한 대조·누락 처리 | 증거 |
| --- | --- | --- | --- | --- |
| 챔피언 | `participants[].championId` | 정수, 30/30 존재 | G1 10명의 정수 ID를 공식 Data Dragon 16.20.1 리소스로 변환해 화면 초상화와 일치 확인 | G1–G3, 보고서 10절 |
| K/D/A | `participants[].stats.kills`, `.deaths`, `.assists` | 정수, 30/30 존재 | G1 10명 화면 일치; G2·G3 추가 화면 대조는 범위 제외. 누락을 0으로 채우지 않음 | G1–G3 |
| 챔피언 대상 피해량 | `participants[].stats.totalDamageDealtToChampions` | 정수, 30/30 존재 | G1 화면의 챔피언 대상 피해와 10/10 일치; 전체 피해량과 구분. G2·G3 추가 화면 대조는 범위 제외 | G1–G3 |
| 받은 피해량 | `participants[].stats.totalDamageTaken` | 정수, 30/30 존재 | G1 화면의 받은 피해량과 10/10 일치; G2·G3 추가 화면 대조는 범위 제외 | G1–G3 |
| CS 구성 | `participants[].stats.totalMinionsKilled`, `.neutralMinionsKilled` | 정수, 30/30 존재 | G1 10명 모두 두 필드 합계=점수판 CS 확인. G2·G3 추가 화면 대조는 범위 제외. `.neutralMinionsKilledTeamJungle`/`.neutralMinionsKilledEnemyJungle`도 존재하나 추가 합산하지 않음 | G1–G3 |
| 획득 골드 | `participants[].stats.goldEarned` | 정수, 30/30 존재 | G1 화면의 골드 획득·점수판과 10/10 일치. G2·G3 추가 화면 대조는 범위 제외 | G1–G3 |
| 시야 점수 | `participants[].stats.visionScore` | 정수, 30/30 양수, 10–172 | G1 화면 10/10 일치. 실제 0 사례 미확보; G2·G3 추가 화면 대조는 범위 제외 | G1–G3 |
| 와드 제거 수 | `participants[].stats.wardsKilled` | 정수, 30/30 존재 | G1 화면의 와드 파괴와 10/10 일치; G2·G3 추가 화면 대조는 범위 제외 | G1–G3 |
| 아이템·장신구 | `participants[].stats.item0`~`.item6` | 7개 정수 슬롯, 30/30 존재; 0 총 7개. 비영 ID 102종 모두 Data Dragon 16.20.1에 존재하며 item6은 30/30 Trinket 태그 | G1의 비영 아이템 65개 아이콘이 해당 ID의 공식 이미지와 일치, 빈 슬롯 5개 일치. item6은 3363/3364 장신구. G2·G3 추가 화면 대조는 범위 제외 | G1–G3, 보고서 10절 |
| 오브젝트 피해량 | `participants[].stats.damageDealtToObjectives` | 정수, 30/30 존재, 0은 1개·양수 29개 | G1 화면의 목표물 피해와 10/10 일치(모두 양수). 0 사례는 원본에서 확인; 추가 경기 화면은 생략. 2026-10-24의 [정의·화면 매핑 조사](lcu-objective-semantics.md#1차-출처와-기존-lcu-자료를-연결한-근거)로 포함 관계 보완 | G1–G3 |
| 포탑 피해량 | `participants[].stats.damageDealtToTurrets` | 정수, 30/30 존재, 0은 4개·양수 26개 | G1 화면의 포탑 피해와 10/10 일치(모두 양수). 0 사례는 원본에서 확인; 추가 경기 화면은 생략. 포함 관계의 근거와 한계는 [2026-10-24 조사](lcu-objective-semantics.md#확인한-의미와-계산상의-제한) 참조 | G1–G3 |
| 역할 힌트 | `participants[].timeline.lane`, `.role` | lane=`BOTTOM/JUNGLE/MIDDLE/TOP`, role=`CARRY/NONE/SOLO/SUPPORT` | 사용자 설정 경기 관찰값. 솔로랭크 자료와 실제 포지션의 정확성 미검증 | G1–G3 |
| 독립 타임라인 이벤트 | 미확인 | 이번에는 game-timelines 경로 미호출 | 상세의 `timeline` 요약 필드와 이벤트 타임라인을 혼동하지 않음 | 없음 |

## 3. 해석과 검증 기록

- **0 / 누락 / null:** 표의 기본 필드는 30/30 존재하고 null이 없다. 피해량·아이템 등에서 실제 0이 관찰됐다. 누락값 보정은 수행하지 않았다.
- **스키마:** 세 경기의 참가자 `stats` 키 집합이 모두 동일하다. 서로 다른 패치·큐의 구조 일치는 아직 검증하지 않았다.
- **목록 페이지:** `begIndex=0&endIndex=2` 요청에 `gameIndexBegin=0`, `gameIndexEnd=2`, `gameCount=3`과 3개 경기가 반환됐다. 이번 페이지는 끝 인덱스 포함 동작과 일치한다. 다른 범위의 포함 규칙·최대 페이지·보관 기한은 미확인이다.
- **목록과 상세의 참가자 범위:** 목록의 각 경기는 수집자 1명의 참가자 통계만 포함하며 해당 통계는 상세와 일치한다. 전체 10명 비교에는 경기 상세를 사용한다.
- **과거 범위:** 이번에 약 12일 전 사용자 설정 경기 3건을 조회했다. 전체 보관 기간이나 최소 보장 기간으로 일반화하지 않는다.
- **보완 기록:** G1 아이템·챔피언 리소스 대조와 다른 참가자 1명의 공식 솔로랭크 경로는 2026-10-22에 확인했다. 2026-10-23 조회 조건·지연·과거 범위 제외는 [D22](../superpowers/decisions/2026-10-22-overnight-decisions.md#d22--2026-10-23-사용자-요청에-따른-검증-작업-제외), 현재 반영·검증은 [진행 상태](../status.md#남은-작업-순서)에 있다.
- **사용자 결정으로 생략:** G2·G3 추가 화면 대조, 클라이언트 재시작 후 같은 경기 재조회와 다른 참가자 PC의 경기 식별자 대조. 실측 PASS로 기록하지 않으며 gate 보류 조건에서도 제외한다.

## 4. 공식 솔로랭크 참고 경로

**C11 PASS.** 공식 개발자 포털에서 다른 참가자 1명의 계정·목록 2페이지·상세 6경기를 조회했다. 모두 HTTP 200이며 `info.queueId=420`, 대상 PUUID 1명 연결, `info.participants[].teamPosition` 60행을 확인했다. 이는 위 LCU의 `participants[].timeline.lane/role`과 별도 경로다. 같은 참가자의 LCU PUUID와 공식 API PUUID가 달랐으므로 Riot ID를 Account-v1로 해석해 연결한다.

2026-10-22 표본에서 `TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY`를 확인했다. 조기 종료 2건을 제외한 4건에서 대상은 정글 2회·서포터 1회·원딜 1회다. 짧은 조기 종료 경기에서도 `GameComplete`가 반환돼 이 값만으로 정상 경기라고 판정하지 않는다. 실제 포지션 정확도는 이 작은 표본으로 검증하지 않았다. 현재 운영자 확인 기준은 [초기 포지션 참고 자료](../spec.md#초기-포지션-참고-자료)에 있다. [요청 순서·키 조건·실측 한계](riot-solo-reference.md)에 상세 기록을 보존했다.

피해 지표의 LCU 30행 부등식 검사·공식 API 60행의 합산식 오차와 아이템 대조는 [보고서 10절](lcu-report.md#10-솔로랭크-경로-분리와-정적-데이터-대조--2026-10-22)을 참조한다. 오브젝트 피해와 포탑·에픽 몬스터 피해의 합은 46행에서 같고 14행에서 1 차이가 났다. 숫자 관계를 전체 포함 범위나 LCU 계약의 증명으로 사용하지 않는다.
