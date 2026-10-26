# Civil War — LoL 내전 기록

Java 25 / Spring Boot 4.1.1 / PostgreSQL 18.6 / JPA + Specification / Gradle Groovy.

**Provisional stage 1.** LCU 실기 gate는 HOLD다. `fixtures/lcu/candidates/h2-20261021/`의 경기 ID·PUUID·시각은 합성/가명이고 서비스 seed가 아니다. Windows 수집기, 평가 작업자, 웹, 운영 배포는 후속 단계다. [검증 상태](docs/validation/lcu-report.md), [후보 계약](docs/validation/lcu-candidate-contract.md).

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
