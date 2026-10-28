# 밝은 화면·참가자 프로필 사진 검증

웹과 Windows 수집기의 기록 탐색·등록 화면을 같은 밝은 디자인으로 바꾸고, 참가자 사진으로 사람을 구분하도록 구현했다. 요청한 화면 배치와 제거 항목을 반영했으며 페이지 이동과 긴 이름 표시도 보완했다. 이 기록은 로컬 구현과 검사 결과이며 실제 운영 배포·Windows 실기·Riot 운영 키 조회 성공을 뜻하지 않는다.

기록일: 2026-10-29. 현재 제품 규칙은 [명세](../spec.md#화면-디자인과-참가자-사진), 선택 이유·주체·선행 작업과의 관계는 [결정 기록](../superpowers/decisions/2026-10-29-light-ui.md), 구현 순서는 [계획](../superpowers/plans/2026-10-29-light-ui-profile-icons.md)을 따른다.

프로젝트의 최신 진행·운영 확인 범위는 [현재 상태](../status.md)가 정본이다. 아래 수치와 이미지는 이번 실행에 한정한다.

| 분류·주체 | 현재 상태 | 지금 판단할 사항 |
| --- | --- | --- |
| 사용자 확정 · 사용자 | 요청한 웹·수집기 변경 구현, 로컬 확인 완료 | 확정된 요구의 재승인 없음 |
| 위임받은 선택 · 구현 담당자 | 별도 작업 폴더, 서버 사진 캐시, 사진 실패 대체, 페이지 이동·문구·줄바꿈 보완 | 아래 한계와 독립 검토 결과 확인 |
| 조사 및 검증 · 구현 담당자 | 격리 DB·실제 로컬 서버·브라우저와 Electron 가상 응답 검사 | 외부 키·운영 서버·실제 Windows는 미확인 |

## 환경과 확인 결과

macOS arm64에서 저장소에 고정한 Node.js·pnpm·Java 도구를 사용했다. 의존성·Gradle 캐시와 Docker Compose 프로젝트 `cw-light-ui`를 별도로 준비했다. 서버 시험은 이 프로젝트의 `cw_test`, 웹 시험은 `cw_web_test`만 사용하며 포트는 55436이다. 이전 브랜치의 실행 결과나 기본 시험 DB에서의 중간 실행은 아래 최종 수에 합산하지 않는다.

| 환경·상황 | 확인 결과 | 근거 |
| --- | --- | --- |
| Java·격리 PostgreSQL | 172개 시험 사례, 실패·오류·건너뜀 0. 새 사진 캐시 테이블 이전과 기존 계정·경기 보존 포함 | [서버 로그](../../test-results/light-ui/server.log), [이전 검사](../../apps/server/src/test/java/cw/accounts/PlayerAccountMigrationIntegrationTest.java) |
| 실제 로컬 Spring·Chromium·격리 DB | 23개 시험 사례 성공. 기존 인증·기록·팀 추천과 새 사진·필터·문구·페이지 초점·긴 계정 이름 확인 | [웹 로그](../../test-results/light-ui/web.log), [새 웹 검사](../../tests/web/light-ui.spec.ts) |
| 실제 Electron·파일 SQLite·가상 롤/서버 | 20개 시험 사례 성공. 좌우 팀 경계·하단 페이지·세 경기·초안 보존·직접 등록·연결 복구 포함 | [Electron 로그](../../test-results/light-ui/collector.log), [검사 코드](../../tests/e2e/collector.spec.ts) |
| TypeScript·SQLite 단위 | 기존 91개 시험 사례 성공 | [단위 로그](../../test-results/light-ui/unit.log) |
| 공식 외부 경로의 로컬 HTTP 대체 응답 | 헤더 비밀 키·Summoner 경로·번호 0/오류 번호·지연 응답 폐기·정상 사진 보존 확인 | [게이트웨이 검사](../../apps/server/src/test/java/cw/riot/HttpRiotGatewayTest.java), [캐시 검사](../../apps/server/src/test/java/cw/members/MemberProfileIntegrationTest.java) |
| 실제 공개 Data Dragon 이미지 | 시험용 번호 29의 공식 이미지를 받아 화면 검토에 사용 | [Riot 이미지 안내](https://developer.riotgames.com/docs/lol#data-dragon) |

수는 실행한 시험 사례 수다. 사진을 실제 참가자의 Riot 계정에서 조회한 횟수나 Windows 설치 횟수가 아니다. 웹 사진 검사는 합성 계정에 보관한 번호와 이미지 응답 대체를 사용했다. 서버의 사진 조회 검사는 로컬 HTTP·가상 게이트웨이 응답이다. League 클라이언트나 Riot 키를 사용한 실연동 검사로 확대하지 않는다.

## 화면 대조와 사용성 보완

웹은 넓은 화면과 폭 800·390·320에서 목록·팀 선택을 확인했고 긴 이름을 넣은 경우도 대조했다. 수집기는 폭 1280·1000·800에서 양 팀이 같은 높이에 나란히 있고 화면 전체가 가로로 넘치지 않는지 확인했다. 사진 실패 시에도 참가자 선택을 계속할 수 있다.

하단에서 다음 페이지를 누른 뒤 새 경기의 시작을 다시 찾는 불편을 줄이도록 두 앱의 목록 초점·스크롤을 정리했다. 공개 참가자 상태 문구도 실제 팀 추천 포함 여부를 설명하도록 보완했다. 작은 관리 화면의 긴 영문 Riot ID가 잘리는 경우는 실패 검사로 재현한 뒤 줄바꿈을 적용했다. [웹 회귀 검사](../../tests/web/light-ui.spec.ts)는 이 변경 전 실패와 변경 후 결과를 구분해 확인했다.

이미지는 실제 로컬 앱 화면이며 경기·계정은 합성 또는 가명 자료다. 프로필 그림은 시험용 공식 아이콘이다. 원래 날짜의 과거 화면 기록은 보존하고 이번 실행 이미지를 별도로 남겼다.

- [웹 경기 기록](assets/2026-10-29-light-history-desktop.png), [좁은 경기 기록](assets/2026-10-29-light-history-mobile.png)
- [공개 참가자 사진](assets/2026-10-29-light-members-desktop.png), [참가자 관리](assets/2026-10-29-light-admin-desktop.png), [편집 화면](assets/2026-10-29-light-admin-editor.png)
- [팀 선택 사진](assets/2026-10-29-light-teams-desktop.png), [추천 결과의 사진](assets/2026-10-29-light-team-result.png), [좁은 팀 선택](assets/2026-10-29-light-teams-mobile.png)
- [수집기 전체 배치](assets/2026-10-29-light-collector-1280.png), [폭 800의 좌우 팀·하단 페이지](assets/2026-10-29-light-collector-800.png)

## 실행 대조와 독립 검토

최종 웹 검사는 긴 Riot ID 보완을 포함해 23개 사례가 성공했다. 타입 검사와 TypeScript·JavaScript·CSS 형식 검사, Java 형식·중괄호 검사도 통과했다. 문서 검사기 자체 시험은 66개 사례가 성공했고 등록·정본·링크·안내표·중복 검사도 통과했다. [형식 로그](../../test-results/light-ui/format.log), [Java 형식 로그](../../test-results/light-ui/java-format.log), [문서 검사](../../test-results/light-ui/docs-check.log), [검사기 시험](../../test-results/light-ui/docs-tests.log)을 함께 남겼다.

별도 검토자는 기준 `6068dc3` 이후 `62916a5`까지의 코드와 실행 로그를 읽고 중요한 코드 결함이 없다고 판단했다. 검토 중 시험을 새로 실행한 것은 아니며 위 실행 수에 별도 검토 횟수를 합산하지 않는다. 경미한 지적은 명세의 웹 필터 설명과 서버 조회 조건이 혼동될 수 있다는 한 건이었다. 문서 관리 원칙에 따라 이번에 설명을 구분했고 서버의 기존 조회 조건은 유지했다. 이후 커밋은 이번 화면 이미지·기록 보완이며 새 기능을 추가한 재검토로 표시하지 않는다.

실제 Riot 키의 성공·호출 한도, 실제 Windows·설치판·운영 적용, 기준 커밋의 선행 작업은 검토자가 판정하지 않은 범위다. 앞의 둘은 아래 미확인·범위 제외로 유지하고, 선행 작업은 이번 새 구현 성과로 세지 않는다.

## 남은 필수 작업과 확인 한계

이번 구현·로컬 검사·코드 검토 범위의 필수 작업은 마쳤다. 운영 배포나 새 설치판 배포는 이번 작업에 포함하지 않는다. 기존에 사용자 지시로 제외한 Windows 실기는 다시 완료 조건으로 넣지 않는다.

실제 Riot 운영 키로 참가자의 사진을 조회한 결과와 실제 Windows 기기의 표시 상태는 미확인이다. 사진이 바뀌면 서버의 다음 갱신 후 목록을 다시 조회할 때 반영된다. 새 아이콘이 현재 자산 버전에 없으면 이름 대체 표시를 사용하며 자산 목록 갱신이 필요하다. 이것을 모든 최신 아이콘 표시 보장으로 설명하지 않는다.
