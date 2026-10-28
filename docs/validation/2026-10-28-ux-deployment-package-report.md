# 사용자 경험 변경 배포 ZIP 생성과 검증

사용자가 서버와 수집기를 함께 교체할 수 있도록 실행 파일·설정 예제·적용 순서를 묶는다. 통신 규약이 함께 바뀌므로 두 구성요소를 같은 배포물로 식별하고, 기존 DB와 PC의 대기 자료를 유지하는 절차를 제공한다.

기록일·편집일: 2026-10-28. 현재 제품·검증 상태는 [상태 정본](../status.md), 기능 구현의 근거는 [이전 실행 보고서](2026-10-28-ux-implementation-report.md)다. 이번 기록은 새 묶음 생성에 한정한다.

| 분류·주체 | 상태 | 지금 판단할 사항 |
| --- | --- | --- |
| 사용자 확정 · 사용자 | 운영 적용용 ZIP 생성 요청 | 이미 요청한 생성 작업의 재승인 없음 |
| 위임받은 선택 · 개발 담당자 | 서버와 Windows 수집기를 함께 제공, 설치판 버전 구분 | [결정 보완](../superpowers/decisions/2026-10-28-ux-requirements.md#운영-배포-zip-요청) 참조 |
| 조사 및 검증 · 개발 담당자 | 생성·검증 완료 | 사용자 서버 적용과 Windows 실기는 미실행 |

## 생성 결과

macOS arm64에서 코드 빌드 기준 `4dc7df2`과 안내·묶음 기준 `5807e98`로 생성했다. 새 수집기는 `0.3.0-provisional`, 통신 규약은 2다. 서버 실행 파일의 내부 버전은 기존 빌드 설정을 유지하며 묶음의 커밋·파일 확인값으로 이번 내용을 구분한다.

| 파일 | 크기(바이트) | SHA-256 |
| --- | ---: | --- |
| `Civil-War-Deployment-0.3.0-provisional-5807e98.zip` | 173432474 | `3ee88cde809110ab3836301f9184e0b8739635f552f1f751f0679e27744c241e` |
| `Civil-War-Home-Server-5807e98.zip` | 47319987 | `e5b998e487ddaa2068071adda30cb4022f824b47530006694d6fcec807ab32f3` |

로컬 출력은 저장소의 `dist/`다. 전체 ZIP에는 서버 실행 파일과 설정 예제, Windows 설치판과 설치·제거 무결성 정보, 정본에서 생성한 `START-HERE.txt`, 묶음 정보와 확인값 목록을 넣었다. 서버 전용 ZIP은 [배포 안내](../runbooks/home-server.md#개발-환경에서-묶음-재생성)의 허용 파일 다섯 개만 포함한다. 실제 `.env`, Tunnel 토큰, DB와 PC 사용자 자료는 포함하지 않았다.

허용 목록·모든 파일 해시·ZIP 내부 CRC(압축 내용의 오류 확인값)를 대조했다. 확인값 파일은 `SHA256SUMS-deployment-5807e98.txt`이며, ZIP 안의 목록도 압축 내용을 다시 읽어 검증했다. [생성·대조 출력](../../test-results/deployment-package/verification.json)은 생성 증거로만 보관한다.

## 검증 결과

| 환경·상황 | 확인 결과 | 근거 |
| --- | --- | --- |
| Java 빌드와 전용 PostgreSQL | 전체 서버 검사 160개 실행, 실패·건너뜀 0개. 실행 JAR에 웹·DB 전환 파일 8개 포함 | [빌드 로그](../../test-results/deployment-package/server-build-verified.log) |
| Windows x64 설치판의 바이트 검사 | 설치 파일과 그 안에서 추출한 제거 프로그램의 저장 CRC가 실제 바이트와 일치 | [최종 위치 재검증](../../test-results/deployment-package/collector-verify-delivery.log), [검사 코드](../../scripts/nsis-integrity.mjs) |
| 실제 설치용 앱 묶음 | 챔피언 PNG 173개·앱 버전·새 통신 헤더 확인. 개발 경기·시험 서비스 미포함 | [묶음 내부 검사](../../test-results/deployment-package/installed-assets.log) |
| 배포 생성 회귀 | 설치·제거·배포 검사 12개 성공 | [검사 로그](../../test-results/deployment-package/collector-tests.log) |
| ZIP·설정 | 전체 ZIP 12파일·서버 ZIP 5파일 허용 목록, 경로·확인값·CRC 성공. 가짜 설정값으로 Compose 문법 확인 | 생성·대조 출력, [설정 검사](../../test-results/deployment-package/compose-check.log) |
| 타입·형식·문서 | 타입과 형식 검사 성공. 문서 단위 66개, 등록·링크·중복 검사 성공 | [타입](../../test-results/deployment-package/typecheck.log), [형식](../../test-results/deployment-package/format-check.log), [문서 검사](../../test-results/deployment-package/docs-check.log) |

수는 시험 사례·파일 수이며 Windows 설치 실행이나 운영 경기 수가 아니다. 이전 [기능 검증](2026-10-28-ux-implementation-report.md)의 웹·Electron 결과를 새 실기 횟수로 합산하지 않았다.

## 생성 중 오류와 조치

첫 서버 재검사에서는 재시도 응답을 두 번 읽고 두 번째 남은 시간이 정확히 12초라고 비교하던 시험이 1ms 경과로 실패했다. 같은 응답의 상태·대기 시간을 검사하도록 고쳤다. 제품의 재시도 동작은 바꾸지 않았으며, 수정 뒤 전체 160개 검사가 통과했다.

고정된 NSIS 설치 도구는 긴 의존성 경로에서 `SIGABRT`로 중단했다. 짧은 38자 include 경로는 성공하고 280자 경로는 중단하는 [최소 재현](../../test-results/deployment-package/nsis-path-check.log)과 중단 위치를 확인했다. 같은 커밋을 `/private/tmp/cw30`에 내보내고 고정 의존성을 복제한 짧은 경로에서 빌드했다. 도구 버전·앱 식별자·자료 경로나 CRC 검사를 바꾸지 않고 최종 설치판·제거 파일 검증을 통과했다.

## 적용과 미확인

[기존 자료를 유지하는 교체 순서](../runbooks/home-server.md#새-계정코드-계약-적용-순서)를 ZIP의 안내에 생성해 넣었다. 기존 배포 설정을 유지하고 실행 JAR을 먼저 교체한 뒤 새 수집기를 같은 계정·자료 경로로 연결한다. 수집기 모임 코드는 새 서버에서 발급한다.

서명하지 않은 Windows 설치판이며, 실제 Windows 설치 실행·새 LCU 현재 이름 조회·Riot 키 실연동·운영 서버 적용은 미확인이다. 이번 작업은 ZIP을 로컬에 생성했고 외부 게시나 운영 자료 변경은 하지 않았다. 기존에 제외한 업데이트·인증 손상 실기와 시범 경기는 새 완료 조건으로 되살리지 않았다.
