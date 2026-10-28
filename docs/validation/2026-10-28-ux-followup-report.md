# 기존 UX 작업의 설치·자동 전송·화면 간소화 검증

수집자가 터미널 없이 설치·실행하고, 이미 요청한 전송을 자동으로 이어 보내며 세 경기씩 확인하도록 기존 사용자 경험 작업을 보완했다. 이번 변경은 [이전 구현 기록](2026-10-28-ux-implementation-report.md)의 후속 수정이며 이전 검사 수치와 Windows 사용자 보고를 새 성과로 바꾸지 않는다.

기록일·편집일: 2026-10-28. 판단 근거는 [추가 결정](../superpowers/decisions/2026-10-28-ux-requirements.md#수집기-사용-간소화-추가-요구), 현재 동작은 [명세](../spec.md), 현재 상태는 [상태 정본](../status.md), 작업 추적은 [후속 계획](../superpowers/plans/2026-10-28-collector-ease.md)을 따른다.

| 분류·주체 | 상태 | 지금 판단할 사항 |
| --- | --- | --- |
| 사용자 확정 · 사용자 | 추가 요구와 자동 전송 안내 채택 후 구현 요청 | 기존 UX 작업에 이어 반영 |
| 위임받은 선택 · 구현 담당자 | 기존 자료 경로·요청 ID·긴 공통 코드 호환 유지 | 별도 DB 구조 전환 없음 |
| 조사 및 검증 · 구현 담당자 | 코드 검사 완료, 구현·독립 검토 수정·배포물 생성과 자동 검사 완료 | 아래 환경과 한계 확인 |

## 실행 환경과 결과

macOS arm64, 저장소의 고정 Node·Java 도구와 별도 PostgreSQL 프로젝트 `cw-ux-test`에서 검사했다. 서버 단위·통합 검사는 `cw_test`, 실제 서버·브라우저 검사는 `cw_web_test`만 사용했다. 운영 서버나 사용자 PC의 자료는 열거나 수정하지 않았다.

| 검사 환경·상황 | 확인 결과 | 실행 근거 |
| --- | --- | --- |
| TypeScript·SQLite 단위 검사 | 91개 사례 성공, 기존 요청/초안 보존·자동 재연결 포함 | [단위 로그](../../test-results/ux-followup/unit.log) |
| Electron 앱·가상 롤/서버 | 19개 사례 성공. 코드 실패/재입력·팝업 닫기·페이지·직접 등록·재실행 확인 | [앱 로그](../../test-results/ux-followup/e2e.log) |
| Java·격리 PostgreSQL | 163개 사례, 실패 0·오류 0·건너뜀 0. Java 형식·실행 JAR 빌드 성공 | [서버 로그](../../test-results/ux-followup/server.log) |
| 실제 로컬 Spring·브라우저 | 16개 사례 성공. 게스트 소급·기기 철회·응답 유실·계산 작업 복구 포함 | [웹 로그](../../test-results/ux-followup/web.log) |
| 설치 전용 앱 빌드·설치 도구 회귀 | 12개 사례 성공. 운영 주소 고정·개발 설정 미포함·내부 CRC 검사 포함 | [배포 검사](../../test-results/ux-followup/release-green.log) |

수는 실행한 시험 사례 수이며 실제 Windows 설치 횟수나 운영 경기 수가 아니다. 최종 설치판은 수정 커밋 `27febfc` 소스로 다시 생성했으며 배포 검사를 통과했다. 자동 재개 검사는 [소유자·초안 보존 코드](../../apps/collector/src/main/history-sync.test.ts), 인증 검사는 [고정 로그인과 제거 경로](../../apps/server/src/test/java/cw/auth/AdminCodeFormatTest.java), [이전 공통 코드 호환](../../apps/server/src/test/java/cw/auth/GroupCodeIntegrationTest.java)에 있다. 실행 로그는 [이번 검사 폴더](../../test-results/ux-followup/)에서 구분한다.

## 화면 증거

- [직접 등록과 참가자 행](assets/2026-10-28-ux-ease-collector.png)
- [연결 코드 팝업](assets/2026-10-28-ux-ease-connection.png)
- [세 경기와 숫자 페이지](assets/2026-10-28-ux-ease-pagination.png)
- [관리자 참가자 화면](assets/2026-10-28-ux-ease-admin.png)

연결·경기 화면은 Electron의 가상 롤·서버 응답을 사용했다. 웹 검사는 로컬 실제 Spring 서버와 격리 DB를 사용했으며 실제 Riot 키·League 클라이언트 연동 성공을 의미하지 않는다.

## 자료 보존과 한계

참가자·경기·취소·원문·포지션·누적 집계의 저장 구조는 바꾸지 않는다. 로컬 요청 번호와 최초 소유자·제출 번호·초안도 보존하며 새 인증에는 서버의 최신 회원/계정 일치 확인 뒤 연결한다. 잘못된 역할·취소·다른 계정은 자동 전송하지 않는다. 이전 관리자 코드 DB 이력은 인증·조회 경로에서 제외하고 행 자체는 보존한다.

새 설치판은 Windows x64용이며 코드 서명이 없다. 실제 Windows 설치 직후 실행·바탕화면 실행, 실제 운영 주소 접속과 운영 DB 적용은 이번 macOS 검사로 확인하지 않았다. 이전에 사용자 지시로 제외한 Windows 업데이트·인증 손상 실기는 새 필수 작업으로 추가하지 않는다.

## 독립 검토와 수정

별도 검토자는 첫 구현 커밋 `261bbf3`을 이전 UX 완료 커밋 `72fafce`와 비교해 중요한 오류 두 건을 지적했다. 이전 43자리 코드를 입력창이 막는 문제와, 예전 인증 요청의 늦은 실패가 새 인증 상태를 덮어쓰는 문제다. 전자는 Electron에서 입력이 여섯 글자로 잘리는 실패를, 후자는 업로드·회원·대기·계산 진행 네 경로의 지연 응답으로 실패를 재현했다. 입력 호환과 인증별 응답 반영을 수정한 뒤 단위 91개와 앱 19개 사례가 통과했다. 검토자가 제시한 치명적 또는 경미한 추가 지적은 없었으며 수정 후 별도의 재검토를 실행했다고 기록하지 않는다.

고정 관리자 코드의 정책 위험, Windows 실기·운영 접속 미확인, 원래 권한의 롤 종료 중 저장 전송은 검토에서 구현 오류로 판단하지 않은 범위다. 사용자 선택과 기존 지원 동작을 유지하며 실제 Windows 실행을 자동 검사 성공으로 바꾸지 않는다. Electron 출력 경로는 다른 검사 로그를 정리하지 않도록 하위 폴더로 분리했다.

## 새 배포물

수집기 `0.4.0-provisional`과 서버를 [새 교체 안내](../runbooks/home-server.md#새-계정코드-계약-적용-순서)와 함께 묶었다. 이전 `0.3.0-provisional` ZIP과 설치판은 덮어쓰거나 삭제하지 않았다. 앱 식별자와 사용자 자료 경로를 유지하며 설치판의 주 프로세스에 고정 운영 주소가 있고 환경 변수의 서버 주소 변경 경로·개발 경기 응답·수동 재개 명령은 없다. 설치 앱에 챔피언 PNG 173개가 들어 있다.

| 파일 | 크기(바이트) | SHA-256 |
| --- | ---: | --- |
| `Civil-War-Deployment-0.4.0-provisional-27febfc.zip` | 173428515 | `af7b101c8c76ddf6a4d4ed127ef9344a21df989db09155f0a632306454672089` |
| `Civil-War-Home-Server-27febfc.zip` | 47314706 | `7a24f1381670de77a8efe34e3d27317d5680d3799c6f82d74efd93cd4acd1160` |

출력은 저장소 `dist/`다. 전체 ZIP은 허용한 12개 파일, 서버 전용 ZIP은 5개 파일만 포함하며 실제 `.env`·토큰·DB·PC 사용자 자료는 포함하지 않는다. 압축 CRC·모든 내부 파일 해시·실행 JAR의 웹/DB 전환 자료·설치/제거 프로그램 CRC를 확인했다. 같은 소스를 짧은 빌드 경로에 내보내어 고정 의존성으로 포장했으며 [이전 긴 경로 진단](2026-10-28-ux-deployment-package-report.md#생성-중-오류와-조치)을 재사용했다.

근거는 [ZIP 대조 결과](../../test-results/ux-followup/verification.json), [최종 설치판 생성](../../test-results/ux-followup/package-final.log), [전달 위치 재검증](../../test-results/ux-followup/package-delivery.log)이다. 문서 단위 검사 66개와 등록·내부 링크·중복 검사, TypeScript 타입·코드 형식 검사도 통과했다. 배포물 생성은 외부 게시나 운영 서비스 업데이트가 아니다.
