# Windows Docker 서버 설치·교체

집 Windows 데스크톱의 Docker Desktop에서 서버·데이터베이스를 실행하고 Cloudflare Tunnel로 수집기를 연결한다. 사용자는 이 절차의 실제 배포를 맡는다. 기존 서버의 새 버전 교체는 아래 [교체 절차](#새-계정코드-계약-적용-순서)를 따른다. 새 시험 환경은 기존 운영 DB와 분리한다. 기기 등록 이후의 확인은 [Windows 실기 절차](collector-acceptance.md)를 따른다.

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

시험 호스트에 별도의 브라우저 로그인·보안 확인 화면을 적용하면 수집기 요청이 JSON 대신 HTML이나 리다이렉트를 받을 수 있다. `/api/collector/*`에 그런 응답이 없는지 확인한다. 이 서버의 관리자 인증은 자체 고정 코드로 로그인한다. 외부 HTTPS만 사용하며 서버의 개발용 HTTP 프로필을 켜지 않는다.

## 4. 최초 관리자 코드와 모임 코드

기존 서버 웹 주소의 `/admin`에서 고정 운영자 코드로 로그인한다. 현재 값은 [서버 인증 설정](../../apps/server/src/main/java/cw/auth/AuthService.java), 형식과 세션은 [인증 계약](../contracts/api.md#인증과-권한)을 따른다. 코드 발급 명령은 사용하지 않는다.

1. **참가자 관리 → 참가자 추가**에서 실제 Riot ID를 입력한다. 기존 참가자는 같은 프로필을 사용한다. 가능한 포지션은 팀 추천용 별도 설정이다.
2. **코드·인증 → 모임 코드 발급**으로 공통 코드를 한 번 표시하고 수집자에게 전달한다. 수집자별 코드는 만들지 않는다.
3. 수집자는 롤에 로그인한 뒤 수집기의 **모임에 연결**을 사용한다. 현재 계정 관측으로 프로필을 연결하며 과거 경기 이름만으로 합치지 않는다. 상세 입력·게스트 기준은 [명세](../spec.md#참가자와-포지션-관리)를 따른다.
4. 재발급·삭제는 모든 수집기 연결을 해제한다. PC의 대기 자료를 지우지 않고 같은 계정으로 재연결하게 안내한다.

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

## 새 계정·코드 계약 적용 순서

이 절차는 기존 Windows·Docker 서버와 수집기를 교체할 때 사용한다. ZIP은 새 폴더에 풀어 실행 파일을 준비한다. 기존 서버의 Compose 프로젝트·DB·볼륨·환경 설정과 각 PC의 수집기 자료 경로를 유지한다. 새 서버 구축은 앞의 최초 환경 설정 절차를 따른다.

### 1. 쓰기 중단과 백업

모든 수집기를 종료한다. **기존 서버 배포 폴더**의 PowerShell에서 외부 연결과 서버를 멈추고 DB 컨테이너는 유지한다.

```powershell
docker compose stop cloudflared server
$cwBackupRoot = Join-Path $env:USERPROFILE ('CivilWarBackups\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $cwBackupRoot | Out-Null
Copy-Item -LiteralPath @('.env', 'compose.yml', 'Dockerfile', '.dockerignore', 'server.jar') -Destination $cwBackupRoot
if (Test-Path -LiteralPath 'secrets') { Copy-Item -LiteralPath 'secrets' -Destination $cwBackupRoot -Recurse }
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/civil-war-before-ux.dump'
if ($LASTEXITCODE -ne 0) { throw 'DB 백업 실패. 적용을 멈추세요.' }
docker compose cp postgres:/tmp/civil-war-before-ux.dump (Join-Path $cwBackupRoot 'database.dump')
if ($LASTEXITCODE -ne 0) { throw 'DB 백업 복사 실패. 적용을 멈추세요.' }
```

각 수집기 PC에서도 앱 종료 후 `%APPDATA%\Civil War Collector` 폴더 전체를 별도 백업한다. 서버 DB 백업과 수집기 대기는 서로 다른 자료다. 백업을 새 격리 DB·복사 폴더에 복원해 회원·등록/취소 경기·원문·대기 요청·초안을 대조하는 것이 적용 전 확인 기준이다.

### 2. 기존 설정으로 서버 교체

ZIP의 `home-server/server.jar`를 기존 배포 폴더의 `server.jar`에 복사한다. 기존 `.env`, `secrets`, `compose.yml`, `Dockerfile`, `.dockerignore`를 사용한다. ZIP의 설정 네 파일은 최초 구성과 대조할 때 쓰는 예제다. 사용자별 프로젝트명·DB·볼륨을 새 이름으로 바꾸지 않는다.

자동 솔로랭크 참고를 사용할 때는 서버 `.env`에 `RIOT_API_KEY`를 넣고, 기존 `compose.yml`의 `server.environment`에 다음 항목을 추가한다. 실제 키는 배포 ZIP·수집기 설정에 넣지 않는다. 키가 없거나 조회가 실패하면 연결·조회 대기와 최근 성공값 또는 공통 시작값을 사용한다.

```yaml
RIOT_API_KEY: ${RIOT_API_KEY:-}
```

기존 서버 폴더에서 실행한다. Docker Desktop은 Linux 컨테이너 모드여야 한다.

```powershell
docker compose config --quiet
docker compose up -d --build --wait postgres server
docker compose ps
```

서버 시작 때 DB 전환을 수행한다. 회원·경기·취소 상태와 관리자 세션을 보존하며, 이전 개인 코드와 수집기 자격은 해제한다. 연결 누락으로 전환이 실패하면 자료를 버려 계속하지 않는다. **`docker compose down -v`와 볼륨 삭제는 실행하지 않는다.**

### 3. 모임 코드와 새 수집기 연결

서버가 `healthy`이면 `docker compose start cloudflared`로 기존 외부 연결을 시작한다. 기존 웹 주소에서 고정 운영자 코드로 로그인해 모임 코드를 발급한다. 이전 43자리 코드는 새 수집기의 입력 팝업에서 사용할 수 없으므로 6자리 코드로 재발급한다. 재발급은 기존 모든 수집기를 해제하므로 새 코드를 배포할 시점에 수행한다. 서버 버전 교체만으로 기존 기기·브라우저 세션을 해제하지 않는다.

ZIP의 `collector` 폴더에 있는 새 설치 파일을 같은 Windows 사용자로 더블클릭한다. 설치를 마치면 바로가기가 생성되고 앱이 실행된다. 이후 바탕화면 아이콘으로 실행하며 서버 주소를 입력하지 않는다. 기존 수집기 자료 폴더와 참가자 프로필을 그대로 사용한다. 롤에 로그인한 상태에서 팝업에 새 모임 코드를 입력하면 같은 참가자·계정의 저장 요청을 자동으로 이어 보낸다. 정상 연결 후에는 코드 입력 폼을 숨긴다.

서버와 PC의 기존 기록·포지션·대기 건수·계산 상태를 대조한다. 새 경기 수집이나 새 참가자 계정 확인에는 **롤에서 경기 가져오기**를 사용한다. 이미 등록을 요청한 경기만 자동 처리되고 확인 대기 경기는 직접 등록한다.

구형 수집기의 요청은 새 서버에서 업데이트 필요 응답을 받는다. 새 모임 코드를 재발급·삭제하면 모든 수집기가 다시 연결해야 한다. 모임 코드는 발급 때 한 번만 보여 준다.

### 4. 확인 범위와 되돌리기

이 배포물은 macOS에서 빌드·무결성 검사한 Windows x64 설치판이며 코드 서명은 없다. 실제 Windows 설치 실행, 새 LCU 현재 이름 조회 경로와 Riot 키 실연동, 운영 서버 적용은 이 ZIP 생성으로 확인된 결과가 아니다.

문제가 생기면 쓰기를 멈춘 상태를 유지하고 보관한 서버·수집기 백업과 그에 맞는 프로그램 버전을 함께 복원한다. 새 DB에 예전 프로그램을 역실행하지 않는다. 적용 후 새로 생긴 자료는 별도로 보관해 복원 시 잃지 않도록 대조한다.
