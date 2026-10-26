# 개발 환경 준비와 실행

이 문서는 실행·빌드·테스트·로컬 관리자 복구 방법의 정본이다. 제품 동작은 [현재 명세](../spec.md), 확인한 범위는 [현재 상태](../status.md), 요청·응답은 [현재 계약](../contracts/api.md)을 따른다. LCU는 League Client API(게임 클라이언트의 로컬 인터페이스)다.

## 수집기 개발·실행

정확한 Node.js·pnpm·Electron 버전은 [package.json](../../package.json), 의존성은 [잠금 파일](../../pnpm-lock.yaml)을 따른다. Electron의 자체 Node.js·SQLite 런타임은 외부 설치와 별개이며 당시 실측 값은 [수집기 보고서](../validation/stage2-report.md#reproducible-checks)에 보존한다.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`test:e2e`는 빌드한 **실제 Electron main/preload/renderer와 파일 SQLite**를 사용하되 LCU와 서버는 고정 시험 응답(fixture)이다. League·실제 인증·Riot API에 연결하지 않는다. macOS에서도 이 테스트는 실행할 수 있으며 일반 수집기 실행은 Windows만 지원한다. `pnpm test:probe`는 재사용한 LCU 전송 계층의 로컬 HTTPS 회귀 테스트다. `pnpm format:check`는 클라이언트 소스 형식을 검사한다.

Windows PowerShell에서 운영자가 발급한 개인별 코드와 실제 LCU 계정으로 실행한다:

```powershell
$env:CW_SERVER_ORIGIN = "https://your-service.example"
$env:CW_LCU_LOCKFILE = "C:\Riot Games\League of Legends\lockfile"
pnpm dev:collector
```

서버 기본값은 개발용 `http://127.0.0.1:8080`이다. 외부 서버는 HTTPS만 허용하며 임의 리다이렉트를 따르지 않는다. 설치 경로가 다르면 `CW_LCU_LOCKFILE`을 해당 lockfile 경로로 설정한다. 연결할 때마다 현재 파일을 다시 읽는다. `dev:collector`는 main/preload/화면을 빌드하고 실행하며, 설치 파일 생성·서명은 T13에서 진행한다.

Windows `%APPDATA%\Civil War Collector`에 로컬 자료를 보관한다. 비공개 경기·회원·인증 자료이므로 공개 저장소에 복사하지 않는다. 등록·대기열·계정 전환·보존 규칙은 [현재 명세](../spec.md), 실시간 솔로 참고 연동 상태는 [현재 상태](../status.md)를 따른다.

## 서버 빌드와 테스트

Docker Compose와 [서버 빌드 설정](../../apps/server/build.gradle)이 요구하는 Java 개발 도구(JDK)가 필요하다. Node.js·pnpm은 위 설정을 따른다. 아래 명령은 저장소 루트에서 실행한다:

```sh
pnpm install --frozen-lockfile
docker compose -f infra/compose.test.yml up -d --wait
./apps/server/gradlew -p apps/server build
```

macOS 설치 환경에서 JDK 선택이 필요하면 `JAVA_HOME`을 빌드 설정이 요구하는 JDK 설치 디렉터리로 지정한다. Windows PowerShell에서는 `./apps/server/gradlew` 대신 `.\apps\server\gradlew.bat`를 사용한다. Gradle 배포판·검증 해시는 [Wrapper 설정](../../apps/server/gradle/wrapper/gradle-wrapper.properties)을 따른다.

`build`와 `bootJar`는 Gradle `buildWeb`을 통해 Vite 웹을 빌드하여 JAR의 static 리소스에 포함한다. 미리 만들어 둔 dist 디렉터리에 의존하지 않는다. `build`는 단위 테스트, **실제 PostgreSQL 통합 테스트**, 실제 HTTP chunked 요청, 실행 JAR의 `admin:code --revoke-all` 복구 테스트와 패키징을 수행한다. DB가 없으면 실패하며 H2나 skip으로 대체하지 않는다. 테스트는 `cw_test` DB를 초기화하므로 개발/운영 데이터에 연결하지 않는다.

[테스트 Compose](../../infra/compose.test.yml)와 [서버 테스트 설정](../../apps/server/src/test/resources/application-test.yml)이 DB 이름·계정·포트·전용 프로젝트와 볼륨의 정본이다. 공개된 **테스트 전용** 자격이며 포트는 로컬 접속으로 한정한다. `CW_TEST_DB_PORT`, `CW_TEST_DATABASE_URL`, `CW_TEST_DATABASE_USER`, `CW_TEST_DATABASE_PASSWORD`로 접속을 바꿀 수 있다. DB 이름은 테스트의 안전 장치가 요구하는 값을 유지하고, 포트를 바꾸면 JDBC URL도 함께 바꾼다.

## 로컬 API 실행

테스트 Compose의 기본 설정을 사용해 같은 격리 DB로 API를 살펴보는 실행 예시다. 설정을 변경했다면 원본 설정에 맞춰 아래 예시도 바꾼다. 후속 테스트 실행은 이 DB의 자료를 초기화한다.

```sh
export DATABASE_URL=jdbc:postgresql://localhost:55432/cw_test
export DATABASE_USER=cw_test
export DATABASE_PASSWORD=cw_test_only
export SERVER_ORIGIN=http://localhost:8080
./apps/server/gradlew -p apps/server bootRun --args='--spring.profiles.active=dev'
```

JAR(자바 실행 묶음)의 파일명에 넣을 버전은 서버 빌드 설정을 따른다. 또는 `java -jar apps/server/build/libs/civil-war-server-<빌드 버전>.jar --spring.profiles.active=dev`를 사용한다. 로컬 HTTP는 dev 프로필에서 사용한다. 쿠키·출처·위조 요청 방지 설정은 [현재 계약](../contracts/api.md)을 따른다. origin은 완전한 출처 값이며 끝 `/`를 붙이지 않는다.

## 최초 관리자와 복구

같은 DB 환경변수를 설정한 로컬 터미널에서:

```sh
java -jar apps/server/build/libs/civil-war-server-<빌드 버전>.jar admin:code
java -jar apps/server/build/libs/civil-war-server-<빌드 버전>.jar admin:code --revoke-all
```

명령은 웹 서버를 열지 않고 종료한다. `ADMIN_CODE=`는 터미널에 한 번만 출력한다. 유효 기간·세션 규칙은 현재 계약을 따른다. `--revoke-all`은 기존 관리자 세션과 미소비 관리자 코드를 폐기한다. 수집기 인증은 별도 관리한다. 일반 로그로 출력하지 않으며 셸 리다이렉션/터미널 기록에 코드를 보관하지 않는다.

브라우저 `/admin`에 코드를 입력한 뒤 회원을 만들고 개인별 수집기 코드를 발급한다. 계정에는 실제 LCU PUUID(계정 식별자)를 사용하며 Riot 공식 API PUUID와 혼용하지 않는다. 요청·응답과 쿠키 갱신은 [현재 계약](../contracts/api.md)을 참고한다.

## 웹과 전체 통합 검증

```sh
pnpm typecheck
pnpm test
pnpm build
./apps/server/gradlew -p apps/server clean build
pnpm exec playwright install chromium
pnpm test:web
pnpm test:e2e
pnpm test:probe
pnpm format:check
```

`test:web`는 실제 패키지 JAR·Chromium·격리 PostgreSQL을 사용한다. Docker Compose 테스트 DB가 먼저 실행되어야 한다. 검사 실행기(harness)의 [스크립트](../../scripts/web-test-server.mjs)가 DB 이름과 서버·제어 포트의 정본이다. 실행기는 전용 DB만 초기화하고 실제 API로 합성 회원·경기를 등록한다. 필요한 포트를 다른 서버가 점유하면 종료 후 실행한다. 프로세스 제어는 테스트 스크립트에만 있고 제품 JAR에는 없다. 테스트 중 JAR를 덮어쓰지 않는다. Java는 `JAVA_HOME` 또는 PATH에서, Docker는 `CW_DOCKER` 또는 기본 설치에서 찾는다.

실제 서버 브라우저 테스트는 공개/관리 흐름, stage 2 HttpServerApi·SQLite Outbox의 확인 대기→확정→응답 유실 재시도, 원문 소수 정밀도, 역할 정정/취소, 실행 중 작업자 강제 종료→관리 CLI 무개입→재시작 복구를 확인한다. `ui-states.fixture.spec.ts`는 네트워크 UI 상태를 주입하는 별도 fixture 검사이며 서버 검증 증거로 합산하여 설명하지 않는다. `test:e2e`는 기존 Electron fixture만 실행하므로 Windows collector CI가 Java/PostgreSQL 웹 harness를 시작하지 않는다.

화면 캡처는 `docs/validation/assets/stage3-*.png`, 로컬 테스트 로그·추적은 gitignore된 `test-results/`에 생성된다. 테스트 인증 상태는 `test-results/web-state.json`의 합성 DB 전용 값이며 운영 자료로 재사용하지 않는다.

코드 형식과 에디터 설정은 [코드 작성 규칙](code-style.md)을 따른다. 현재 연동 제한·설치·배포의 남은 확인은 [현재 상태](../status.md)를 참고한다. 여기의 명령은 실행 방법이며 통과 증거는 각 실행 보고서에 기록한다.

## 문서 검사

```sh
pnpm docs:index
pnpm test:docs
pnpm docs:check
```

`docs:index`는 [정본 목록](../ssot.json)에서 [문서 안내](../README.md)를 생성한다. 생성 문서는 손으로 고치지 않는다. `test:docs`는 검사기의 회귀 테스트이며 `docs:check`는 저장소 문서 자체를 검사한다. 작성 절차와 자동 검사의 한계는 [AGENTS.md](../../AGENTS.md#문서-관리-절차)가 정본이다.
