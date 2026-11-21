# 운영자 로그인 코드의 서버 설정 이동 검증

운영자 로그인 코드를 서버 코드에서 빼고 서버 PC의 `.env` 설정(`ADMIN_LOGIN_CODE`)에서 읽도록 바꿨다. 공개 저장소에 값이 남지 않게 하고, 값이 없거나 약하면 서버가 시작하지 않게 하는 것이 목적이다. 이 기록은 로컬 구현과 검사 결과이며 실제 집 서버 적용을 뜻하지 않는다.

기록일: 2026-11-21. 선택 이유와 대안 비교는 [결정 기록](../superpowers/decisions/2026-10-28-ux-requirements.md#2026-11-21-보완--운영자-로그인-코드를-서버-비밀-설정으로-이동), 현재 규칙은 [인증 계약](../contracts/api.md#인증과-권한), 현재 상태는 [상태 정본](../status.md)을 따른다.

| 분류·주체 | 상태 | 지금 판단할 사항 |
| --- | --- | --- |
| 사용자 확정 · 사용자 | 서버 비밀 설정으로 이동 지시 | 재승인 없음 |
| 위임받은 선택 · 구현 담당자 | `.env` 환경 변수, 8–128자, 누락·예시 값이면 시작 거부 | 결정 기록의 재검토 조건 |
| 조사 및 검증 · 구현 담당자 | 아래 로컬 검사 완료 | 실제 집 서버 적용은 미확인 |

## 변경 전후

| 상황 | 변경 전 | 변경 후 |
| --- | --- | --- |
| 코드 값의 위치 | 서버 코드에 숫자 4자리를 직접 적음 | 서버 PC `.env`의 `ADMIN_LOGIN_CODE`. 저장소·배포 ZIP에 없음 |
| 값이 없을 때 | 해당 없음 | 서버가 시작하지 않고 설정 안내를 출력. 값은 출력하지 않음 |
| 약한 값 | 4자리 | 8자 미만·128자 초과·앞뒤 공백·`replace-with-` 예시 값은 시작 거부 |
| 웹 로그인 입력 | 숫자 4자리만 입력 가능 | 8–128자 비밀번호 입력. 비밀번호 관리자 자동 입력 허용 |
| 반복 로그인·실패 제한·세션 | 유지 | 유지 |

이전 고정값은 Git 이력에 남아 지울 수 없다. 8자 하한 때문에 그 값으로는 서버를 설정할 수 없고, 로그인 시에도 거절된다.

## 환경과 결과

macOS arm64, OpenJDK 25.0.1, Node.js 23.11.0(저장소 지정 24.22.1과 다름, pnpm 경고만 출력), 저장소 테스트 Compose의 PostgreSQL에서 실행했다. 서버 테스트는 `cw_test`, 웹 테스트는 `cw_web_test`만 초기화했다. 운영 서버와 사용자 PC 자료는 열지 않았다. 수는 시험 사례 수이며 실제 로그인 횟수가 아니다.

| 환경·검사 | 결과 |
| --- | --- |
| `./apps/server/gradlew -p apps/server spotlessApply clean build` (실제 PostgreSQL) | 174개 사례, 실패·오류·건너뜀 0. Java 형식 검사와 실행 JAR 빌드 성공 |
| 새 설정 검사 [AdminLoginCodeTest](../../apps/server/src/test/java/cw/auth/AdminLoginCodeTest.java) | 누락·공백·짧은 값·이전 고정값·예시 값·너무 긴 값 거절, 오류 문구에 값 미포함. 8자·128자 경계 허용과 정확한 비교 |
| 로그인 검사 [AdminCodeFormatTest](../../apps/server/src/test/java/cw/auth/AdminCodeFormatTest.java) | 설정한 값으로 반복 세션 발급. 이전 고정값·한 글자 차이·대소문자 차이·뒤 공백 거절 |
| `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` | 타입·형식·빌드 성공, 단위 91개 사례 성공 |
| `pnpm test:web` (실제 JAR·Chromium·격리 DB) | 23개 사례 성공. 시험 서버 실행기가 설정한 값으로 운영자 로그인·참가자 관리·생명주기 검사 진행 |
| 실제 JAR 시작 (`--spring.main.web-application-type=none`) | 값 없음·`2005`·예시 값은 종료 코드 1과 설정 안내. 정상 값은 시작 후 종료 코드 0. 네 경우 모두 출력에 값 없음 |
| 집 서버 Compose 설정 (가짜 값) | `ADMIN_LOGIN_CODE`가 없으면 `config` 단계에서 실패, 있으면 통과 |
| `pnpm docs:index`, `pnpm test:docs`, `pnpm docs:check` | 안내표 갱신, 문서 검사기 66개 사례와 등록·링크·중복 검사 통과 |

서버 테스트의 운영자 코드는 [테스트 설정](../../apps/server/src/test/resources/application-test.yml), 웹 테스트의 값은 [시험 서버 실행기](../../scripts/web-test-server.mjs)에 있는 공개 시험용 값이다. 운영 값이 아니다.

## 원격 서버 검사 실패와 수정

PR #8의 원격 서버 검사(Ubuntu)는 이번 변경 전 커밋 `8d36f23`부터 이미 실패하고 있었다. 당시 원격 실행은 메시지에서 공동 작성자 줄을 지우기 전의 같은 내용 커밋 `68d61ad`에 연결돼 있다. 실패한 시험은 등급 보관 검사 2개(`failedRefreshKeepsLastSuccess`, `accountMergeRetainsKnownRankWhenNextLookupFails`)였다.

- **원인**: Linux의 Java 시계는 나노초 단위 시각을 주고, PostgreSQL은 마이크로초까지만 저장한다. 첫 등급 갱신 응답은 나노초 시각을 그대로 돌려주는데, 나중에 DB에서 읽은 시각은 잘려 있어 두 값이 달랐다. macOS 시계는 마이크로초 단위라 로컬 검사에서는 드러나지 않았다.
- **수정**: [등급 서비스](../../apps/server/src/main/java/cw/riot/SoloRankService.java)가 저장 전에 시각을 마이크로초로 자른다.
- **재현과 회귀 확인**: [등급 보관 검사](../../apps/server/src/test/java/cw/members/SoloRankIntegrationTest.java)에 1나노초를 더한 시계를 넣어 Linux 조건을 만들었다. 수정 전에는 같은 2개 시험이 실패했고, 수정 후 서버 전체 174개 사례가 통과했다. 원격 결과는 PR의 Checks를 따른다.

## 남은 확인과 한계

- 실제 집 서버의 `.env`·`compose.yml`에 값을 추가하고 새 서버를 띄우는 작업은 하지 않았다. 절차는 [서버 안내](../runbooks/home-server.md#2-기존-설정으로-서버-교체)에 있다.
- Windows PowerShell 입력 절차는 macOS에서 실행하지 않았다. 정규식과 파일 쓰기 형식만 문서로 작성했다.
- 컨테이너 환경 정보를 볼 수 있는 PC 사용자는 값을 볼 수 있다. 결정 기록에 적은 감수 범위다.
- 수집기 앱은 이번 변경 대상이 아니며 Electron 검사는 다시 실행하지 않았다.
- `pnpm test:web`이 이전 보고서의 화면 이미지 9개(`docs/validation/assets/2026-10-28-ux-*` 등)를 다시 저장했다. 과거 기록을 보존하려고 커밋 전에 원래 파일로 되돌렸다. 이번 변경에는 새 화면 이미지가 없다. 웹 로그인 화면은 입력 길이 속성만 바뀌었다.
- 로컬 실행 기록은 `test-results/admin-secret-2026-11-21/`에 남으며 저장소에는 포함하지 않는다.
