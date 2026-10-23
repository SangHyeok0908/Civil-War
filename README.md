# Civil War — LoL 내전 기록

Java 25 / Spring Boot 4.1.1 / PostgreSQL 18.6 / JPA + Specification / Gradle Groovy.

**Provisional stage 3.** 공개 전적·누적 통계·활약 랭킹·팀 추천과 운영자 웹, 포지션별 평가 및 PostgreSQL 재계산 작업자를 구현했다. [stage 3 검증과 한계](docs/validation/stage3-report.md)를 참조한다. LCU 검증의 남은 보류 사유는 포탑·오브젝트 피해량의 의미 확인(C07)이다. 실제 Windows 인증 정보 보호, 설치·업데이트, 서버 외부 접속과 백업·복원은 아직 확인하지 않았다. fixture의 ID·PUUID·시각은 합성/가명이며 운영 seed가 아니다.

2026-10-23 사용자 결정으로 경기 종료 후 첫 조회(C01), 미리 실행한 도구와의 조회 비교(C02), 반영 시간·과거 조회 범위 측정(C10), 실제 3–5경기 시범 운영(T15)을 작업·완료 조건에서 제외했다. 제외 항목을 검증 성공으로 바꾸지는 않는다. 이후 작업은 **피해량 의미와 점수 기준 확정 → Windows 설치·업데이트 검증 → 서버 외부 접속과 백업·복원**이다. [범위 변경 기록 D22](docs/superpowers/decisions/2026-10-22-overnight-decisions.md#d22--2026-10-23-사용자-요청에-따른-검증-작업-제외).

웹: `/matches`, `/matches/:key`, `/members`, `/members/:id`, `/rankings`, `/teams`. 운영자: `/admin`에서 일회용 코드 로그인 후 참가자·코드/인증·경기 정정/취소·평가 기준·재계산·감사 이력을 관리한다. 빌드된 웹과 API는 같은 Spring JAR에서 제공한다. [현재 API 계약](docs/contracts/stage3-api.md) · [현재 JSON Schema](docs/contracts/stage3.schema.json) · [수집기 검증](docs/validation/stage2-report.md).

## 수집기 개발·실행

Node **24.22.1**, pnpm **11.5.0**을 사용한다. 직접 의존성과 transitive lockfile을 고정했다. Electron **45.0.0**의 자체 런타임은 Node **24.22.0** / SQLite **3.53.4**이며 외부 Node 설치와 별개다.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`test:e2e`는 빌드한 **실제 Electron main/preload/renderer와 파일 SQLite**를 사용하되 LCU와 서버는 고정 fixture다. League·실제 인증·Riot API에 연결하지 않는다. macOS에서도 이 테스트는 실행할 수 있으며 일반 수집기 실행은 Windows만 지원한다. `pnpm test:probe`는 재사용한 LCU transport의 로컬 HTTPS 회귀 테스트다. `pnpm format:check`는 클라이언트 소스 형식을 검사한다.

Windows PowerShell에서 운영자가 발급한 개인별 코드와 실제 LCU 계정으로 실행한다:

```powershell
$env:CW_SERVER_ORIGIN = "https://your-service.example"
$env:CW_LCU_LOCKFILE = "C:\Riot Games\League of Legends\lockfile"
pnpm dev:collector
```

서버 기본값은 개발용 `http://127.0.0.1:8080`이다. 외부 서버는 HTTPS만 허용하며 임의 리다이렉트를 따르지 않는다. 설치 경로가 다르면 `CW_LCU_LOCKFILE`을 해당 lockfile 경로로 설정한다. 연결할 때마다 현재 파일을 다시 읽는다. `dev:collector`는 main/preload/화면을 빌드하고 실행하며, 설치 파일 생성·서명은 T13에서 진행한다.

최초 온라인 기기 등록 후에는 회원 명단 캐시로 오프라인 LCU 수집이 가능하다. 실행 시 LCU 계정만 인식하고, 새 LCU 경기 조회는 **과거 경기 조회** 버튼으로만 시작한다. 조회는 임시 저장이며 **양 팀 실제 포지션과 내전 여부를 확인한 뒤 내전 등록**을 눌러야 공개 집계한다. 서버 확인 대기 경기는 LCU에서 사라져도 다시 불러온다. 기존 자료의 확인·전송은 League가 꺼져 있어도 가능하지만, 인식한 다른 계정으로는 진행하지 않는다.

전송 대기 → 확인 대기 → 등록 대기 → 등록 완료를 구분한다. 등록 취소는 복구하지 않으며, 인증/자료 오류는 확인 필요로 표시한다. 새 코드로 같은 회원을 재등록한 뒤 **본인 대기 요청 재개**를 명시적으로 눌러야 이전 인증의 요청을 재개할 수 있다. 다른 회원에게 미완료 요청을 이전하지 않는다.

Windows `%APPDATA%\Civil War Collector`에 `collector.sqlite`와 암호화된 `credential.bin`을 보관한다. 토큰은 main의 Windows safeStorage만 사용하고, 복호화 실패 시 평문 저장 없이 재등록을 안내한다. SQLite에는 비공개 경기·회원 자료가 있으므로 공개 저장소에 복사하지 않는다. 미완료 요청은 자동 삭제하지 않고, 완료된 등록 경기의 큰 원본 요청만 30일 후 정리하며 키·상태·확정 역할은 남긴다.

솔로랭크 참고 자료 버튼은 현재 **이용 불가 사유**를 안내한다. C11은 공식 Account-v1 → Match-v5 경로의 포털 실측이며, 직접 HTTP 연동은 차단된 상태다. 수집기에는 Riot 키를 넣거나 LCU의 다른 플레이어 조회 성공을 가정하지 않았다. [공식 경로의 실제 검증 범위](docs/validation/riot-solo-reference.md).

## 서버 빌드와 테스트

Java 25, Docker Compose, Node 24.22.1, pnpm 11.5.0이 필요하다. 저장소 루트에서:

```sh
pnpm install --frozen-lockfile
docker compose -f infra/compose.test.yml up -d --wait
./apps/server/gradlew -p apps/server build
```

macOS 설치 환경에서 JDK 선택이 필요하면 `JAVA_HOME`을 Java 25 설치 디렉터리로 지정한다. Windows PowerShell에서는 `./apps/server/gradlew` 대신 `.\apps\server\gradlew.bat`를 사용한다. Gradle Wrapper는 공식 9.8.2 배포판을 SHA-256으로 검증한다.

`build`와 `bootJar`는 Gradle `buildWeb`을 통해 Vite 웹을 빌드하여 JAR의 static 리소스에 포함한다. 미리 만들어 둔 dist 디렉터리에 의존하지 않는다. `build`는 단위 테스트, **실제 PostgreSQL 통합 테스트**, 실제 HTTP chunked 요청, 실행 JAR의 `admin:code --revoke-all` 복구 테스트와 패키징을 수행한다. DB가 없으면 실패하며 H2나 skip으로 대체하지 않는다. 테스트는 `cw_test` DB를 초기화하므로 개발/운영 데이터에 연결하지 않는다.

기본 테스트 DB는 `localhost:55432/cw_test`, 사용자 `cw_test`, 비밀번호 `cw_test_only`다. 공개된 **테스트 전용** 자격이다. Compose project/volume은 `cw-stage1-test` 전용이며 포트는 loopback에만 바인딩한다. `CW_TEST_DB_PORT`, `CW_TEST_DATABASE_URL`, `CW_TEST_DATABASE_USER`, `CW_TEST_DATABASE_PASSWORD`로 바꿀 수 있다. 테스트 DB 이름은 안전 장치 때문에 `cw_test`를 유지한다. 포트 변경 시 JDBC URL도 함께 바꾼다.

## 로컬 API 실행

테스트를 마친 뒤 동일한 격리 DB로 API를 살펴보는 예시다. 후속 테스트 실행은 이 DB의 자료를 초기화한다.

```sh
export DATABASE_URL=jdbc:postgresql://localhost:55432/cw_test
export DATABASE_USER=cw_test
export DATABASE_PASSWORD=cw_test_only
export SERVER_ORIGIN=http://localhost:8080
./apps/server/gradlew -p apps/server bootRun --args='--spring.profiles.active=dev'
```

또는 `java -jar apps/server/build/libs/civil-war-server-0.1.0-provisional.jar --spring.profiles.active=dev`를 사용한다. `dev`에서만 HTTP 테스트 쿠키 `cw-admin-dev`를 사용한다. 기본은 HTTPS 전용 `__Host-cw-admin; Secure; HttpOnly; SameSite=Strict; Path=/`다. `cw.dev-http=true`만 설정하고 dev/test profile을 활성화하지 않으면 시작을 거절한다. origin은 완전한 출처 값이며 끝 `/`를 붙이지 않는다.

## 최초 관리자와 복구

같은 DB 환경변수를 설정한 로컬 터미널에서:

```sh
java -jar apps/server/build/libs/civil-war-server-0.1.0-provisional.jar admin:code
java -jar apps/server/build/libs/civil-war-server-0.1.0-provisional.jar admin:code --revoke-all
```

명령은 웹 서버를 열지 않고 종료한다. `ADMIN_CODE=`는 터미널에 한 번만 출력하며 30분 동안 1회 사용할 수 있다. `--revoke-all`은 기존 관리자 세션과 미소비 관리자 코드를 폐기한다. 수집기 인증은 별도 관리한다. 일반 로그로 출력하지 않으며 셸 리다이렉션/터미널 기록에 코드를 보관하지 않는다.

브라우저에서 `/admin`에 코드를 입력한다. `POST /api/admin/session`으로 교환한 쿠키와 CSRF 토큰을 사용한다. 관리자 쓰기에는 설정한 `Origin`과 `X-CSRF-Token`이 필요하다. 새로고침 후 `GET /api/admin/session`으로 CSRF 토큰을 다시 받는다. 회원을 먼저 생성하고 개인별 collector 코드를 발급한다. 실제 계정의 LCU PUUID를 사용하며 Riot 공식 API PUUID와 혼용하지 않는다.

[현재 API 계약과 예시](docs/contracts/stage3-api.md) · [JSON Schema](docs/contracts/stage3.schema.json) · [stage 1 검증 보고서](docs/validation/stage1-report.md) · [야간 결정 기록](docs/superpowers/decisions/2026-10-22-overnight-decisions.md).

재계산 작업은 PostgreSQL에 영속 저장한다. 등록·정정·취소·평가 기준·팀 입력이 바뀌면 공개 평가를 즉시 무효화하고, 같은 스냅샷에서 경기 점수·누적 통계·역할 실력을 모두 만든 뒤 최신 revision/기준/작업 시도를 확인하여 원자적으로 공개한다. 실패·중단된 계산은 공개하지 않는다. 웹 프로세스 재시작 또는 운영자 재시도로 회복하며 로컬 `admin:code` 명령은 작업자를 시작하지 않는다.

운영자 초기 실력은 팀 편성에만 쓰고 공개 점수에는 포함하지 않는다. 0경기는 점수 없음, 1–2경기는 평가 중, 3경기부터 공동 순위를 적용한다. 누적 KDA는 합계에서 계산하고 0데스는 Perfect다. 새 경기 등록 시 같은 포지션의 비교 표본이 달라져 과거 점수도 다시 계산된다. 현재 오브젝트 정책은 잠정 `objective-provisional-v1`이며 C07 검증 전 운영 확정 기준으로 주장하지 않는다.

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

`test:web`는 실제 패키지 JAR·Chromium·격리 PostgreSQL **cw_web_test**를 사용한다. Docker Compose 테스트 DB가 먼저 실행되어야 한다. harness는 이 DB만 초기화하고 실제 API로 합성 회원/경기를 등록하며 localhost:18080(Spring), 18081(테스트 전용 프로세스 제어)을 사용한다. 다른 서버가 이 포트를 점유하면 종료 후 실행한다. 18081 제어는 테스트 스크립트에만 있고 제품 JAR에는 없다. 테스트 중 JAR를 덮어쓰지 않는다. Java는 `JAVA_HOME` 또는 PATH에서, Docker는 `CW_DOCKER` 또는 기본 설치에서 찾는다.

실제 서버 브라우저 테스트는 공개/관리 흐름, stage 2 HttpServerApi·SQLite Outbox의 확인 대기→확정→응답 유실 재시도, 원문 소수 정밀도, 역할 정정/취소, 실행 중 작업자 강제 종료→관리 CLI 무개입→재시작 복구를 확인한다. `ui-states.fixture.spec.ts`는 네트워크 UI 상태를 주입하는 별도 fixture 검사이며 서버 검증 증거로 합산하여 설명하지 않는다. `test:e2e`는 기존 Electron fixture만 실행하므로 Windows collector CI가 Java/PostgreSQL 웹 harness를 시작하지 않는다.

화면 캡처는 `docs/validation/assets/stage3-*.png`, 로컬 테스트 로그·추적은 gitignore된 `test-results/`에 생성된다. 테스트 인증 상태는 `test-results/web-state.json`의 합성 DB 전용 값이며 운영 자료로 재사용하지 않는다.

솔로 참고 가져오기는 운영자가 확인한 **LCU 회원 ↔ 공식 API PUUID 매핑**을 반드시 요구한다. 최근 최대 20개의 검증된 솔로/등록 내전 역할로 주·부 역할을 제안하며 수동 설정은 자동 변경하지 않는다. 제안을 편집란에 적용하고 저장하는 두 번의 명시적 동작이 필요하다. 수집기의 실시간 솔로 export는 여전히 이용 불가이며, 직접 Riot HTTP 차단을 우회하지 않는다. 상세 import 형식은 현재 API 계약을 따른다.

운영용 DB·Tunnel·설치/업데이트·외부 백업/복원은 T13–T14 후속 범위다. T15 시범 운영은 사용자 결정으로 제외했다. 로컬/호스팅 fixture 성공은 실제 Windows 인증 정보 보호, 운영 보안 또는 가용성 검증을 대신하지 않는다.
