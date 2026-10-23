# 솔로랭크 초기 포지션 참고 경로

- 확인일: 2026-10-22 KST
- 경로: **Riot 공식 Account-v1 → Match-v5**. 내전 수집은 기존 LCU를 유지한다.
- 상태: **C11 PASS — 다른 참가자 1명의 계정·목록 2페이지·상세 6경기 실측 완료.** 전체 LCU gate는 HOLD다.
- 사용자 확인: 승인된 Personal API Key 보유. 공식 개발자 포털에서 등록 앱을 선택해 검증했다. 에이전트 요청은 `Header Param`을 사용했고 키·인증 헤더·쿠키는 저장한 증거와 문서에서 제외했다.

## 1. 조회 경로와 확인 기준

한국 계정의 Account-v1·Match-v5는 `asia.api.riotgames.com`을 사용한다. 인증은 `X-Riot-Token` 헤더로 전달한다. 계정 조회는 이름과 태그를 각각 URL 인코딩한다. [공식 계정·지역 안내](https://developer.riotgames.com/docs/lol#summoner-names-to-riot-ids)

| 단계 | GET 경로 | 확인 내용 |
| --- | --- | --- |
| 대상 계정 | `/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` | 기존 내전 참가자 중 수집자와 다른 1명을 선택하고 공식 API의 PUUID 확보 |
| 솔로랭크 목록 | `/lol/match/v5/matches/by-puuid/{puuid}/ids?queue=420&start=0&count=3` | 첫 페이지 3건, 이후 `start=3&count=3`을 한 번 더 조회. 정상 빈 목록과 오류를 구분 |
| 경기 상세 | `/lol/match/v5/matches/{matchId}` | 반환된 ID 사용, 목록·상세 ID 일치 및 해당 PUUID 참가자 1명 연결 |

기존 H2 내전의 참가자 `H2-P01`을 선택했다. 수집자는 `H2-P08`이며 두 계정이 다름을 원본에서 확인했다. H2-P01의 Riot ID로 Account-v1 조회가 성공했고 반환된 PUUID는 솔로랭크 상세 6건에서 각각 정확히 1명과 연결됐다. 따라서 본인 이외 참가자의 조회 경로도 실측됐다.

**H2-P01의 LCU PUUID와 공식 API PUUID는 달랐다.** LCU 값을 Match-v5에 그대로 전달하지 않고, 같은 참가자의 Riot ID를 Account-v1로 해석해 공식 API 식별자를 별도로 보존한다. 표시 이름을 영구 키로 사용하지 않으며 이름 변경·계정 연결 불일치는 검토 대상으로 남긴다. 사용자가 제공한 첫 Account-v1 성공 화면은 수집자 본인의 결과로, 다른 참가자 검증 증거와 구분했다.

공식 큐 사전에서 `420`은 솔로/듀오 랭크, `440`은 자유랭크다. 목록에 `queue=420`을 지정하고 상세의 `info.queueId`도 확인한다. 일반 경기·자유랭크·사용자 설정 경기는 이 참고 표본에 넣지 않는다. [Riot 큐 사전](https://static.developer.riotgames.com/docs/lol/queues.json)

## 2. 포지션 필드

`info.participants[]`에서 대상 PUUID로 참가자를 찾고 다음을 보존한다.

| 필드 | 사용 범위 |
| --- | --- |
| `teamPosition` | 우선 참고값. 팀 내 각 포지션 배치를 고려한 서버의 추정값 |
| `individualPosition` | 개인 단위의 추정값. 진단·교차 확인용으로 보존 |
| `lane`, `role` | 원본 보조값. LCU와 필드·값이 같다고 가정하지 않음 |

공식 문서는 일반적으로 `teamPosition` 사용을 권장한다. 이는 사용자가 선택한 주·부 포지션이나 매칭 때 배정받은 포지션을 직접 반환한다는 뜻은 아니다. [Match-v5 공식 명세](https://developer.riotgames.com/apis#match-v5/GET_getMatch)

검증 시 `TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY`를 각각 탑/정글/미드/원딜/서포터 참고값으로 점검한다. 이번 6경기의 참가자 60행에 모두 다섯 값 중 하나가 있었고 각 팀에서 다섯 포지션이 한 번씩 반환됐다. 대상 참가자 6행의 `teamPosition`과 `individualPosition`은 일치했다. 빈 문자열·누락·알 수 없는 값은 ‘자료 부족’으로 남기고 챔피언만으로 포지션을 채우지 않는다. 실제 플레이와의 정확도 검증이나 모든 패치에 대한 보장은 아니다.

78초·79초 경기에서도 `endOfGameResult=GameComplete`였지만 `gameEndedInEarlySurrender=true`였다. 두 건은 포지션 빈도 참고 표본에서 제외했다. 해당 참가자의 `lane=NONE`, `role=SUPPORT`를 실제 서포터 플레이로 해석하면 잘못된 결과가 된다. 나머지 4경기는 정글 2회·서포터 1회·원딜 1회다. `GameComplete`만으로 정상 경기라고 판단하지 않는다.

실제 응답에 `positionAssignedByMatchmaking`, `selectedRolePreferences`도 관찰됐다. 현재 확인한 공식 필드 설명에서 값의 계약·형식을 확정하지 못했으므로 진단용 관측값으로만 보존하며 주·부 포지션 확정 로직에는 사용하지 않는다.

기존 기획대로 운영자가 주·부 포지션을 최종 확인한다. 솔로랭크 기록을 모임의 전적·점수·랭킹·팀 편성용 실력 보정에 섞지 않으며 운영자 지정값을 자동 덮어쓰지 않는다. 이번 6건은 경로 확인용 표본이며 주·부 포지션을 확정하기에 충분한 표본 수라고 정한 것이 아니다.

## 3. 키와 조회 조건

승인된 Personal Key는 개발자 또는 소규모 비공개 모임용이다. 포털 로그인 시 자동 발급되는 Development Key의 24시간 만료 조건과 구분한다. Personal Key의 기본 제한은 지역별 초당 20회·2분당 100회이며 응답의 적용 제한을 함께 확인한다. 공개 서비스 운영에는 Production Key가 필요하다. 공개 웹을 포함한 최종 운영 범위의 키 승인은 이번 개인 검증과 별개다. [Riot API 키 안내](https://developer.riotgames.com/docs/portal#api-keys)

- `start`는 목록 시작 인덱스, `count`는 요청 건수다. 문서상 `count` 범위는 0~100이다. 이번에는 `start=0/3`, `count=3`으로 두 페이지를 조회했고 중복 없는 6개 ID를 받았다. 100건 요청과 최대 과거 범위는 미측정이다.
- 기간 조건을 쓸 때 `startTime/endTime`은 epoch **초**다. LCU의 `begIndex/endIndex`와 혼용하지 않는다.
- 이번에는 `type/startTime/endTime` 필터를 설정하지 않았다. `type=ranked`만으로 솔로랭크를 구분하지 않고 `queue=420`을 사용한다.
- 요청 범위·응답 수·가장 오래된 실제 반환 시각을 기록한다. 문서상 필터 지원을 전체 보관 기간 보장으로 해석하지 않는다.
- 401/403, 404, 429, 5xx와 정상 빈 목록을 구분한다. 429는 `Retry-After`를 지키며 자동 반복 조회하지 않는다.
- 다른 참가자 1명의 성공으로 모든 계정·지역·과거 기간의 접근을 보장하지 않는다.

[목록 요청 명세](https://developer.riotgames.com/apis#match-v5/GET_getMatchIdsByPUUID), [응답 코드 안내](https://developer.riotgames.com/docs/portal#response-codes)

## 4. 실제 시도와 성공 증거

2026-10-22 00:04~00:06 KST에 기존 H2의 수집자와 다른 참가자 1명을 대상으로 시도했다.

| 시도 | 결과 | 판정 |
| --- | --- | --- |
| 샌드박스 내 Account-v1 | 네트워크 실패 | 경기 없음으로 처리하지 않음 |
| 권한 확장 후 Account-v1 | HTTP 403, 목록·상세 요청 미실행 | 키의 유효성·대상 기록 접근 여부 미확인 |
| 같은 키로 KR 서버 상태 진단 | HTTP 403, Cloudflare `1010`, `browser_signature_banned` | 이 환경의 자동화 요청 차단 확인. Riot 표준 인증 오류와 구분 |

상태 진단의 응답은 재시도 금지를 명시했다. 이후 해당 직접 HTTP 호출을 중단했다. 다음 검증은 사용자가 성공 화면을 제공한 공식 개발자 포털 UI에서 수행했다. 계정 조회의 오류 본문은 보관하지 않았으므로 그 403의 구체적 원인을 동일하다고 단정하지 않는다. 포털에서 선택한 앱 키와 로컬 키 파일의 동일성은 대조하지 않았고, 직접 HTTP 연동 문제가 해결됐다고 판정하지 않는다.

비공개 기록: `.private/riot/solo-20261021T150425Z-fbadfa/manifest.json`, `.private/riot/solo-20261021T150445Z-a9cbec/manifest.json`, `.private/riot/key-diagnostic.json`. 인증 헤더·키는 이 기록에 없다. 로컬 실행 스크립트는 일회성 검증용이며 배포 도구에 포함하지 않는다.

2026-10-22 **00:20:17~00:26:09 KST**(응답 Date 기준), 공식 개발자 포털에서 계정 1회·목록 2회·상세 6회가 모두 HTTP 200이었다. 응답의 앱 제한은 `100:120,20:1`, 메서드 제한은 Account `1000:60`, Match `2000:10`이었다.

| 경기 가명 | 시작 시각 KST | 버전 | 길이 | 대상 teamPosition | 조기 종료 여부 |
| --- | --- | --- | --- | --- | --- |
| S1 | 2026-10-21 23:46:41 | 16.21.829.8620 | 30:17 | JUNGLE | false |
| S2 | 2026-10-21 23:41:33 | 16.21.829.8620 | 1:19 | JUNGLE | true — 빈도 표본 제외 |
| S3 | 2026-10-21 23:34:00 | 16.21.829.8620 | 1:18 | JUNGLE | true — 빈도 표본 제외 |
| S4 | 2026-10-21 22:59:37 | 16.21.829.8620 | 30:19 | JUNGLE | false |
| S5 | 2026-10-16 04:42:13 | 16.20.824.8524 | 33:03 | UTILITY | false |
| S6 | 2026-10-16 04:07:02 | 16.20.824.8524 | 28:03 | BOTTOM | false |

6경기 모두 `queueId=420`, `MATCHED_GAME`, `CLASSIC`, `mapId=11`, 참가자 10명이다. 목록 ID와 상세 `metadata.matchId`, 메타데이터와 상세의 참가자 PUUID 연결이 일치했다. 가장 오래된 반환 경기는 10월 16일이며 이것을 보관 기간의 한계로 해석하지 않는다. 정상 빈 목록·다른 지역·전체 계정의 접근과 새 경기 반영 지연은 이번에 실측하지 않았다.

비공개 증거는 `.private/riot/portal-solo-20261022/evidence.json`과 `audit.json`이다. 화면에 렌더링된 JSON에서 필요한 필드만 추출한 기록이며 **전체 HTTP 원문 캡처나 검증 완료 fixture가 아니다**. 실계정·경기 ID는 비공개 파일에만 보존했다. 사용자가 제공한 원본 성공 화면에는 키가 노출돼 원본을 프로젝트로 복사하지 않고 해시·상태·시각만 기록했다. 이후 사용자가 키 재발급과 로컬 파일 교체 완료를 확인했다. 새 키의 실제 API 호출은 이번 커밋 정리에서 수행하지 않았다.

**C11 PASS의 범위는 다른 참가자의 솔로랭크 조회·큐 구분·포지션 참고 경로다.** 운영 서버의 직접 HTTP 통합과 주·부 포지션의 추정 정확도까지 검증한 것은 아니다. LCU의 C01/C02/C10은 2026-10-23 사용자 결정으로 검증 작업에서 제외했다. LCU `--player` 성공은 필수 조건이 아니다.
