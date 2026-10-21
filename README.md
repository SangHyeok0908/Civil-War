# Civil War — LoL 내전 기록

Java 25 / Spring Boot 4.1.1 / PostgreSQL 18.6 / JPA + Specification / Gradle Groovy.

**Provisional stage 2.** LCU 실기 gate는 HOLD다. `fixtures/lcu/candidates/h2-20261021/`의 경기 ID·PUUID·시각은 합성/가명이고 서비스 seed가 아니다. Windows 수집기 코드와 macOS Electron fixture 검증을 추가했다. 실제 Windows/League/DPAPI 실측, 평가 작업자, 웹, 운영 배포는 후속 단계다. [검증 상태](docs/validation/lcu-report.md), [후보 계약](docs/validation/lcu-candidate-contract.md), [수집기 검증과 Windows 체크리스트](docs/validation/stage2-report.md).

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

Java 25와 Docker Compose가 필요하다. 저장소 루트에서:

```sh
docker compose -f infra/compose.test.yml up -d --wait
./apps/server/gradlew -p apps/server build
```

macOS 설치 환경에서 JDK 선택이 필요하면 `JAVA_HOME`을 Java 25 설치 디렉터리로 지정한다. Windows PowerShell에서는 `./apps/server/gradlew` 대신 `.\apps\server\gradlew.bat`를 사용한다. Gradle Wrapper는 공식 9.8.2 배포판을 SHA-256으로 검증한다.

`build`는 단위 테스트, **실제 PostgreSQL 통합 테스트**, 실제 HTTP chunked 요청, 실행 JAR의 `admin:code --revoke-all` 복구 테스트와 패키징을 수행한다. DB가 없으면 실패하며 H2나 skip으로 대체하지 않는다. 테스트는 `cw_test` DB를 초기화하므로 개발/운영 데이터에 연결하지 않는다.

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

코드를 `POST /api/admin/session`에 JSON으로 전송하면 쿠키와 CSRF 토큰을 받는다. 관리자 쓰기에는 설정한 `Origin`과 `X-CSRF-Token`이 필요하다. 새로고침 후 `GET /api/admin/session`으로 CSRF 토큰을 다시 받는다. 회원을 먼저 생성하고 개인별 collector 코드를 발급한다. 실제 계정의 LCU PUUID를 사용하며 Riot 공식 API PUUID와 혼용하지 않는다.

[전체 API 계약과 예시](docs/contracts/stage1-api.md) · [JSON Schema](docs/contracts/stage1.schema.json) · [stage 1 검증 보고서](docs/validation/stage1-report.md) · [야간 결정 기록](docs/superpowers/decisions/2026-10-22-overnight-decisions.md).

현재 재계산 job은 durable `pending`으로 저장된다. 평가 작업자는 T08–T09에서 구현하므로 공개 경기의 `evaluationStatus`는 `recalculating`, `scoringVersion`은 null이다. 운영용 DB·Tunnel·백업 구성은 아직 제공하지 않는다.
