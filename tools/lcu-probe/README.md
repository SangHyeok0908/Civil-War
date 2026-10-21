# LCU 읽기 전용 검증 도구

Node.js 24로 실제 Windows LoL 클라이언트의 과거 경기 조회 가능 범위를 조사한다. 외부 npm 패키지, 빌드, 서버 설치, Riot 개발자 API 키는 필요하지 않다. 인증은 명시적으로 지정한 로컬 LoL lockfile에서 읽으며 화면이나 파일에 출력하지 않는다.

**준비 상태:** macOS에서 합성 응답을 제공하는 실제 루프백 HTTPS 서버로 도구 테스트를 통과했다. Windows 호환성과 실제 LCU 데이터 제공 여부는 아직 검증하지 않았다. 전체 판정은 HOLD다.

- [검증 계획](../../docs/superpowers/plans/2026-10-21-lcu-validation-plan.md)
- [실측 보고서](../../docs/validation/lcu-report.md)
- [필드 맵](../../docs/validation/lcu-field-map.md)

## 1. Windows 준비

1. [Node.js 공식 다운로드](https://nodejs.org/en/download)에서 **24.x**를 설치한다.
2. 이 저장소를 Windows로 복사한다. 최소한 tools/lcu-probe 폴더, 루트 .gitignore, docs/validation을 함께 가져온다. 개발용 .private 폴더는 복사하지 않는다.
3. PowerShell에서 프로젝트 루트로 이동한다. 아래 상대 경로는 모두 프로젝트 루트 기준이다.
4. 런타임과 도구 테스트를 확인한다.

~~~powershell
node --version
node --test tools/lcu-probe/probe.test.mjs
node tools/lcu-probe/probe.mjs --help
~~~

버전은 v24.x여야 한다. 테스트는 가상 로컬 HTTPS 서버만 사용하고 실제 롤 클라이언트에 접속하지 않는다. test-fixtures의 인증서와 키는 이 가상 서버 전용 공개 테스트 자료다. 테스트 실행 시 OpenSSL 설치는 필요 없다.

LoL 클라이언트에 로그인한 뒤 설치 위치를 확인한다. 기본 경로가 다르면 아래 경로를 실제 위치로 바꾼다. lockfile 내용은 복사하거나 공유하지 않는다.

~~~powershell
Test-Path 'C:\Riot Games\League of Legends\lockfile'
~~~

Windows 버전·빌드, CPU 아키텍처, 지역, 클라이언트 표시 버전, 경기 패치와 경기 종료 시각을 보고서에 기록한다. 도구는 OS 커널 버전·아키텍처·Node 버전·수집 시각을 자동 기록하며, 클라이언트 표시 버전은 --client-version으로 전달한다. 생략한 값은 추정하지 않고 null로 남긴다.

## 2. 종료 후 첫 조회

첫 실측 경기는 경기 중 이 도구를 실행하지 않는다. 정상 내전이 끝난 뒤 아래 명령으로 처음 조회한다.

~~~powershell
node tools/lcu-probe/probe.mjs --lockfile 'C:\Riot Games\League of Legends\lockfile' --out .private/lcu/pc-a-after-game-01 --region KR --label after-game
~~~

현재 계정, 게임 패치 후보 경로, 최근 경기 한 페이지와 그 페이지의 경기 상세를 순서대로 GET 조회한다. 기본 범위는 beginIndex=0, endIndex=19이며 사용자 설정·솔로랭크 여부를 임의로 필터링하지 않는다. 알려진 목록 구조가 아니면 원본을 보존하고 unknown-schema로 기록한다.

명령 실행 자체가 명시적 조회 요청이다. 자동 폴링·재시도·자동 페이지 순회는 없다. 종료 직후 목록에 경기가 없으면 필요한 시점에 새 실행 폴더를 지정하여 다시 실행한다. 예: pc-a-after-1m-01, pc-a-after-5m-01, pc-a-after-15m-01. 관찰 시간은 보장 기한이 아니다.

--out은 반드시 프로젝트 루트의 **.private/lcu/ 아래 새 실행 폴더**여야 한다. 이미 session.json이 있는 실행 폴더는 덮어쓰지 않는다. 경로의 기존 심볼릭 링크나 junction도 거부한다.

## 3. 미리 실행하고 명령으로 조회

다른 실행에서는 아래 대기 모드를 켜 둔다.

~~~powershell
node tools/lcu-probe/probe.mjs --lockfile 'C:\Riot Games\League of Legends\lockfile' --out .private/lcu/pc-a-interactive-01 --interactive
~~~

READY가 표시된 시점에는 LCU 요청이 0건이다. 각 명령은 한 번의 수집을 수행하며, 완료 후 다시 대기한다.

~~~text
history
history 20 20
game 1234567890
friends
player REPLACE_WITH_PUUID
timeline 1234567890
quit
~~~

- history: 기본 최근 20경기 페이지. history 20 20은 20번 인덱스부터 20개를 요청한다. --begin과 --count로 기본값도 지정할 수 있다.
- game: 목록에 나온 경기 ID의 상세 재조회. 예시 ID를 실제 값으로 바꾼다.
- friends: 참가자 사전 등록용 식별 자료 확인. 대화·메시지 조회는 지원하지 않는다.
- player: 다른 참가자의 기록 접근 가능 범위 확인. 확보한 PUUID를 사용하며, 솔로랭크 여부와 역할 힌트는 원본을 보고 판정한다.
- timeline: 선택적 타임라인 조회. 실패하거나 없어도 기본 수집 PASS를 단독으로 막지 않는다.
- help, quit: 도움말과 종료.

대기 중 클라이언트를 재시작한 뒤 history 또는 game을 다시 실행하면 현재 lockfile을 새로 읽는다. 같은 경기의 키·핵심 기록을 재시작 전후 및 종료 후 첫 조회 결과와 대조한다.

한 명령에서 페이지당 최대 100개 상세를 요청하며, 실제 클라이언트가 허용하는 페이지 범위와 의미는 실측으로 확인한다. 각 요청의 제한 시간은 8초, 응답 크기 제한은 16 MiB다.

## 4. 단일 조회 옵션

~~~powershell
node tools/lcu-probe/probe.mjs --lockfile 'C:\Riot Games\League of Legends\lockfile' --out .private/lcu/pc-a-friends-01 --friends
node tools/lcu-probe/probe.mjs --lockfile 'C:\Riot Games\League of Legends\lockfile' --out .private/lcu/pc-a-game-01 --game 1234567890
node tools/lcu-probe/probe.mjs --lockfile 'C:\Riot Games\League of Legends\lockfile' --out .private/lcu/pc-a-player-01 --player REPLACE_WITH_PUUID --begin 0 --count 20
node tools/lcu-probe/probe.mjs --lockfile 'C:\Riot Games\League of Legends\lockfile' --out .private/lcu/pc-a-timeline-01 --timeline 1234567890
~~~

--game, --friends, --player, --timeline, --interactive는 함께 사용하지 않는다. 모든 조회 명령에 --client-version, --region, --label을 추가할 수 있다. 메타데이터에는 인증 정보나 실명을 넣지 않고 수집자·PC 가명을 사용한다.

## 5. 저장 결과 읽기

~~~text
.private/lcu/pc-a-interactive-01/
  session.json
  2026-...-<고유 접미사>/
    manifest.json
    001-game-version.json
    002-current-summoner.json
    003-history.json
    004-game.json
    ...
~~~

- session.json: 시작·종료 시각, 요청 수, 명령별 캡처 폴더 목록. 대기 시작 시 요청 수는 0이다.
- manifest.json: OS·런타임·수동 클라이언트 버전, 조회 조건, 요청별 시각·HTTP 상태·오류·원본 파일명, historyState.
- 응답 파일: 인증 정보가 검출되지 않은 유효 JSON 응답 텍스트를 그대로 저장한다. 게임 ID를 포함한 숫자와 누락·0·null을 재직렬화하지 않는다. 비어 있는 응답은 빈 .txt 파일로 구분한다.
- 분석 시 큰 정수 식별자는 Node 24의 JSON reviver source로 문자열 보존한다. 경기 ID를 JavaScript Number로 먼저 변환해 비교하지 않는다.
- 인증 정보가 포함된 응답, 파싱 불가능한 비어 있지 않은 응답, 크기 제한을 넘은 응답은 본문을 저장하지 않는다. 가능한 경우 HTTP 상태와 차단 사유만 기록한다.

historyState의 available은 알려진 목록 구조에서 경기 ID를 읽었다는 뜻이다. 참가자 10명이나 필수 통계가 확인됐다는 의미가 아니다. empty는 정상 목록 배열이 비어 있다는 뜻이며, unknown-schema·request-failed와 구분한다. HTTP 200과 도구 종료 코드 0도 실기 PASS가 아니다.

종료 코드: 0은 요청 처리 완료, 1은 옵션·파일 등 실행 오류, 2는 일부 요청/본문 오류·알 수 없는 목록 구조·상세 수집 제한 발생이다. 대기 모드에서는 종료 시 세션 전체에서 발생한 오류가 반영된다. 패치 후보 경로가 404인 경우에도 다른 조회를 계속하고 해당 실패를 기록한다.

## 6. 오류 해석

| 코드·상태 | 의미와 다음 확인 |
| --- | --- |
| NODE_24_REQUIRED | Node.js 24로 실행한다. |
| CLIENT_NOT_RUNNING | 지정 위치에 lockfile이 없다. 클라이언트 실행·로그인 및 설치 경로를 확인한다. 경로 오류와 실제 종료는 직접 구분한다. |
| LOCKFILE_UNREADABLE / INVALID_LOCKFILE | 파일 읽기 권한 또는 형식 문제. 내용을 출력하지 말고 경로·클라이언트 상태를 확인한다. |
| LCU_UNAVAILABLE | lockfile은 있지만 포트 연결이 거부됐다. 클라이언트 준비·재시작 상태를 확인한 뒤 새 명령으로 조회한다. |
| LCU_TIMEOUT / LCU_NETWORK_ERROR / RESPONSE_INTERRUPTED | 응답 없음·통신 오류·중단. 정상 빈 기록과 구분하여 관찰 시각을 기록한다. |
| http-error 및 401/403 | 인증·세션 상태 확인. 현재 lockfile을 읽는 새 명령으로 재조회한다. |
| http-error 및 404 | 경로 또는 해당 경기의 제공 여부가 미확인이다. 다른 실행 조건과 수동 결과 화면을 대조한다. |
| SENSITIVE_RESPONSE | 인증 정보로 의심되는 데이터가 검출되어 본문을 저장하지 않았다. |
| NON_JSON_RESPONSE / RESPONSE_TOO_LARGE | 본문 미보관. HTTP 상태와 오류만 기록하여 원인을 조사한다. |
| OUTPUT_ALREADY_USED | 새로운 --out 폴더를 사용한다. 기존 결과를 지우지 않는다. |
| OUTPUT_MUST_BE_PRIVATE / UNSAFE_OUTPUT | .private/lcu/ 아래 실제 디렉터리를 지정한다. |
| IO_OR_ARGUMENT_ERROR / CAPTURE_WRITE_FAILED | 인자, 저장 공간과 파일 권한을 확인한다. 원시 예외에는 민감한 값이 있을 수 있어 출력하지 않는다. |

## 7. 가명화 후보 준비

실제 응답을 확보한 뒤 공개 fixture 후보를 만들 때만 사용한다. 서버 접속 없이 로컬 JSON을 읽는다. 같은 계정의 가명을 유지하려면 관련 경기·현재 계정·친구 자료를 **같은 실행에 모두 --input으로 전달**한다.

~~~powershell
node tools/lcu-probe/redact.mjs --input '.private/lcu/pc-a-after-game-01/실제캡처폴더/004-game.json' --input '.private/lcu/pc-a-game-01/실제캡처폴더/001-game.json' --out .private/lcu/candidates-01
~~~

입력 순서대로 001.json, 002.json 등을 생성한다. aliases.private.json은 실제 값과 가명의 대응표이므로 .private 밖으로 이동하거나 공유하지 않는다. manifest.json에도 원본 경로가 있어 이 파일 자체는 공개용이 아니다. 기존 후보 폴더는 덮어쓰지 않으며, 여러 번 실행한 후보 사이의 가명 일치는 보장하지 않는다.

가명화는 허용된 통계·구조·열거값만 남기고 알 수 없는 필드와 자유 문자열은 제거한다. 이는 새로운 스키마의 개인 식별 정보 유출을 줄이기 위한 준비 단계이며, 실제 스키마를 완전히 지원한다는 의미가 아니다. 원본과 비교해 빠진 필드를 검토하고 허용 목록과 테스트를 보완한다. 누락된 통계를 0으로 채우지 않는다.

검토 전 후보는 .private에만 저장한다. V2 실측 판정과 식별자 잔존 검사를 마친 JSON만 fixtures/lcu/verified/로 옮기고, 공개용 출처·가명화 정책 manifest를 별도 작성한다. 이 도구는 verified 폴더를 생성하거나 gate를 PASS로 바꾸지 않는다.

## 8. V2 완료에 필요한 관찰

최소 두 정상 내전, 같은 경기에 참가한 두 사람의 PC가 필요하다.

1. 종료 후 처음 실행한 조회와 미리 실행한 도구의 명령 조회를 대조한다.
2. 명령 전 요청 0건과 종료 후 반영 지연을 기록한다.
3. 클라이언트 재시작 뒤 같은 경기의 키·기록을 대조한다.
4. 두 수집자의 platformId:gameId가 일치하는지 확인한다.
5. 고유 계정 10명·5+5 팀·승패·경기 시간과 모든 필수 통계를 화면과 대조한다.
6. 오브젝트·포탑 피해의 0과 양수, CS 합산 범위, 아이템 빈 슬롯, 친구 식별·솔로랭크 참고 경로를 확인한다.
7. 실제 확인한 과거 조회 범위·페이지 제한과 미확인 항목을 보고서에 기록한다.

전체 PASS 전에는 실제 Windows 결과를 가상 테스트로 대신하거나 본 서비스의 데이터 계약을 확정하지 않는다.
