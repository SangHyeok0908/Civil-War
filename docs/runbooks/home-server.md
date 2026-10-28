# 집 Windows 시험 서버 배포

집 Windows 데스크톱의 Docker Desktop에서 서버·데이터베이스를 실행하고 Cloudflare Tunnel로 수집기를 연결한다. 사용자는 이 절차의 실제 배포를 맡는다. 이번 묶음은 자료 보존 시험용이며, 기존 운영 DB를 옮기거나 덮어쓰는 절차가 아니다. 기기 등록 이후의 확인은 [Windows 실기 절차](collector-acceptance.md)를 따른다.

기록일: 2026-10-26. 편집·보완일: 2026-10-28. 제품의 운영 기준은 [명세](../spec.md#설치운영-설계), 실행 결과는 [준비 검증 보고서](../validation/2026-10-26-collector-acceptance-preparation.md)에 있다.

## 준비할 것

- Docker Desktop을 설치한 집 Windows PC. **Linux 컨테이너 모드**로 실행한다. Java·Node.js를 Windows에 별도로 설치할 필요는 없다.
- Cloudflare에서 관리하는 도메인의 시험용 호스트 이름과 관리 화면에서 만든 원격 관리 Tunnel. 기존 운영 경로와 분리한다.
- 전달받은 `Civil-War-Home-Server.zip`과 `SHA256SUMS-home-server.txt`. ZIP의 해시를 `Get-FileHash -Algorithm SHA256`으로 대조한 뒤 `C:\CivilWarTest` 같은 로컬 폴더에 푼다.

압축을 푼 `home-server` 폴더에는 실행 JAR(자바 묶음)·Dockerfile·Compose 설정·환경 예제가 있다. 이후 PowerShell 명령은 **그 폴더에서** 실행한다. `server.jar`를 직접 실행하거나 JAR 내부를 편집하지 않는다. 원본 설정은 [Compose](../../infra/home-server/compose.yml)와 [Dockerfile](../../infra/home-server/Dockerfile)이다.

## 1. 최초 환경 설정

아래 블록은 새 시험 배포에서 한 번만 실행한다. 기존 `.env`가 있으면 중단한다. 기존 DB의 암호를 파일만 바꿔서 변경할 수는 없다.

```powershell
if (Test-Path -LiteralPath .env) { throw '기존 .env를 유지하세요. 최초 설정을 반복하지 마세요.' }
$cwOrigin = (Read-Host '시험 서버 HTTPS 주소를 입력하세요').Trim().TrimEnd('/').ToLowerInvariant()
if ($cwOrigin -notmatch '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?$') {
    throw 'https://시험호스트 형식의 주소만 입력하세요. 경로·포트·계정 정보는 넣지 마세요.'
}
$cwPassword = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
[IO.File]::WriteAllLines((Join-Path $PWD '.env'), @("SERVER_ORIGIN=$cwOrigin", "POSTGRES_PASSWORD=$cwPassword"), [Text.UTF8Encoding]::new($false))
Remove-Variable cwPassword
New-Item -ItemType Directory -Force secrets | Out-Null
$cwToken = Read-Host 'Cloudflare Tunnel 토큰만 붙여넣으세요' -AsSecureString
$cwCredential = [PSCredential]::new('tunnel', $cwToken)
[IO.File]::WriteAllText((Join-Path $PWD 'secrets\cloudflare-tunnel-token.txt'), $cwCredential.GetNetworkCredential().Password.Trim(), [Text.UTF8Encoding]::new($false))
Remove-Variable cwToken, cwCredential
```

토큰은 Cloudflare 설치 명령 중 `--token` 다음의 값이다. 설치 명령 전체를 넣지 않는다. `.env`와 `secrets`는 해당 PC에서만 보관하고 공유 ZIP·공개 저장소·시험 결과에 넣지 않는다. 토큰 파일 전달은 [Cloudflare 공식 실행 옵션](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/#token-file)을 따른다.

## 2. 서버·DB 시작

```powershell
docker version
docker compose version
docker compose config --quiet
docker compose up -d --build --wait postgres server
docker compose ps
```

`postgres`와 `server`가 `healthy`인지 확인한다. 처음에는 고정 이미지 다운로드·서버 시작에 시간이 걸린다. 실패하면 `docker compose logs --tail 80 server postgres`에서 오류 종류를 확인한다. 비밀값이 포함될 수 있는 전체 `docker inspect`·환경 설정 출력은 결과로 보내지 않는다.

이 구성에는 호스트로 여는 포트가 없다. DB는 전용 내부 네트워크·영속 볼륨에 있고, 서버는 Tunnel에서 접근한다. 기존 자동 시험의 DB·볼륨과 분리되어 있다. `docker compose down`은 컨테이너를 내리고 볼륨은 남긴다. **`down -v`와 Docker Desktop의 볼륨 삭제는 시험 DB를 지우므로 보존 시험 중 사용하지 않는다.**

## 3. Cloudflare 연결

Cloudflare의 Tunnel 설정에서 시험용 공개 호스트를 추가하고 서비스 주소를 **`http://server:8080`**으로 지정한다. `server`는 같은 Docker 네트워크의 서비스 이름이다. `localhost`를 넣으면 Tunnel 컨테이너 자신을 가리킨다. 외부 사용 주소는 `.env`에 적은 HTTPS 주소와 같아야 한다.

```powershell
docker compose up -d cloudflared
docker compose ps
docker compose logs --tail 30 cloudflared
$cwOrigin = ((Get-Content -LiteralPath .env | Where-Object { $_.StartsWith('SERVER_ORIGIN=') }) -replace '^SERVER_ORIGIN=', '')
Invoke-RestMethod "$cwOrigin/api/members"
```

처음 회원 목록은 빈 배열이다. PowerShell에서 아무 항목도 출력되지 않더라도 HTTP 오류가 없어야 한다. 브라우저에서 같은 주소의 `/admin`을 열어 로그인 화면도 확인한다. Cloudflare Tunnel 상태가 연결됨인지 확인하며, 화면 메뉴가 바뀌면 [공식 배포 안내](https://developers.cloudflare.com/tunnel/get-started/)의 공개 호스트 연결 절차를 따른다.

시험 호스트에 별도의 브라우저 로그인·보안 확인 화면을 적용하면 수집기 요청이 JSON 대신 HTML이나 리다이렉트를 받을 수 있다. `/api/collector/*`에 그런 응답이 없는지 확인한다. 이 서버의 관리자 인증은 자체 일회용 코드를 사용한다. 외부 HTTPS만 사용하며 서버의 개발용 HTTP 프로필을 켜지 않는다.

## 4. 최초 관리자 코드와 개인별 코드

같은 배포 폴더에서 다음 명령을 실행한다. 실행 중 서버와 같은 설정·DB에 연결하는 일회용 컨테이너다.

```powershell
docker compose run --rm --no-deps server admin:code --logging.level.root=ERROR
```

터미널의 `ADMIN_CODE=` 뒤 코드로 `/admin`에 로그인한다. 코드는 일반 로그로 저장하거나 공유하지 않는다. `--revoke-all`은 기존 관리자 인증을 폐기하는 복구 명령이므로 첫 발급에는 붙이지 않는다. 유효기간·권한은 [인증 계약](../contracts/api.md#인증과-권한)을 따른다.

1. **참가자 관리 → 참가자 추가**에서 시험 수집자의 실제 LCU PUUID(게임 클라이언트가 사용하는 계정 식별자), Riot ID, 공개 이름을 등록한다. 기존 회원이 있다면 같은 회원을 사용한다. PUUID는 생성 후 바꿀 수 없다.
2. 기기 인증만 먼저 확인할 때는 본인 1명으로 가능하다. 대기 자료 생성에는 선택한 기존 내전의 **참가자 10명 모두**가 회원으로 등록되어 있어야 한다. 원본 경기의 `participantIdentities[].player.puuid`와 실제 참가자를 대조한다. 이름이나 Riot 공식 API의 PUUID로 대신하지 않는다.
3. 기존 비공개 조회 자료의 `002-current-summoner.json`에 있는 `puuid`로 본인 계정을 확인할 수 있다. 자료가 없으면 [기존 읽기 전용 조회 도구](../../tools/lcu-probe/README.md)의 필요한 조회만 사용한다. 식별자·원본은 공개 결과에 첨부하지 않는다.
4. **코드·인증 → 코드 종류: 수집자 기기 → 연결할 참가자 → 코드 발급**으로 개인별 등록 코드를 만든다. 관리자 코드와 수집자 코드는 서로 다르다. 복구 때에도 새 회원을 만들지 않고 동일 참가자를 선택한다.

### 참가자 정보 찾기

친구에게 계정 식별자를 직접 물어보거나 친구마다 조회 도구를 실행할 필요는 없다. 함께 참가한 경기 원본의 참가자 정보에서 아래 값을 읽는다. 공개용 가명화 경기 예제는 실제 기기 등록에 사용할 수 없다.

| 입력란 | 준비 방법 | 확인할 점 |
| --- | --- | --- |
| LCU PUUID | `participantIdentities[].player.puuid`를 그대로 복사 | 표시 이름이나 공식 API 식별자로 대신하지 않음 |
| Riot ID | 같은 참가자의 `player.gameName`과 `player.tagLine`을 `이름#태그`로 연결 | 과거 원본이면 이후 이름·태그 변경 여부를 본인에게 확인. 값이 없으면 이름으로 추정하지 않음 |
| 공개 이름 | 웹에 표시할 모임 별명을 운영자가 정해 입력 | 실제 이름일 필요가 없고 게임 이름과 같을 필요도 없음. 해당 친구가 쓸 별명을 확인하면 됨 |

당시 조회 계정은 `002-current-summoner.json`의 `puuid`와 참가자 식별자를 대조해 찾는다. 이 표시는 수집 당시 계정이며 오늘 로그인한 계정을 새로 확인한 결과는 아니다. 먼저 본인만 등록해 기기 인증을 시험할 수 있고, 경기 자료를 수집하기 전까지 나머지 참가자를 등록하면 된다. PUUID는 수정할 수 없지만 Riot ID·공개 이름은 기존 회원의 편집 화면에서 바꿀 수 있다.

포지션·초기 실력의 의미는 [회원 계약](../contracts/api.md#회원)을 따른다. 시험에서 임시로 입력한 값은 실제 포지션 검증이나 운영 데이터 확정으로 기록하지 않는다.

## 5. 중단·재개와 남은 운영 확인

대기 자료를 만들 때는 이 폴더에서 `docker compose stop cloudflared`, 연결을 복구할 때는 `docker compose start cloudflared`를 사용한다. 서버·DB는 계속 켜 둔다. 실제 수집기에서 외부 요청이 실패하는지도 확인해야 한다.

컨테이너에는 재시작 정책이 있으나 Docker Desktop 자체가 실행되지 않으면 시작되지 않는다. Docker Desktop 자동 시작·Windows 절전 설정·PC 재부팅 후 복구, 외부 회선에서의 접속, PC 밖 DB 백업·복원과 프록시의 요청 제한은 별도 운영 확인이다. 이번 시험 서버 실행만으로 완료 처리하지 않는다. 프록시 뒤의 코드 교환 실패 제한은 [현재 인증 계약](../contracts/api.md#인증과-권한)의 한계를 따른다.

## 개발 환경에서 묶음 재생성

저장소의 고정 도구로 서버를 빌드한 뒤 아래 허용 파일만 새 폴더에 복사해 ZIP으로 묶는다. 실제 `.env`·토큰·DB·사용자 자료는 포함하지 않는다.

```sh
./apps/server/gradlew -p apps/server bootJar
mkdir -p dist/home-server
cp infra/home-server/Dockerfile infra/home-server/compose.yml infra/home-server/.env.example infra/home-server/.dockerignore dist/home-server/
cp apps/server/build/libs/civil-war-server-*-provisional.jar dist/home-server/server.jar
```

JAR 후보가 여러 개라면 현재 빌드 설정의 실행 JAR 하나를 명시한다. `-plain.jar`는 사용하지 않는다. 배포 ZIP에는 `home-server/` 아래 위 설정 4개와 `server.jar`만 넣는다. ZIP 해시는 파일 생성 후 별도로 계산한다.
