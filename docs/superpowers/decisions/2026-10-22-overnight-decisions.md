# 야간 단계 0–3 결정 기록

작성일: 2026-10-22 KST. 본 파일은 최신 사용자 승인으로 위임받은 판단과 코디네이터 ruling을 기록한다. 단계 0의 실기 판정은 **HOLD**이며 미실측을 성공으로 바꾸지 않는다. 이 파일은 단계 0–3의 누적 결정 기록이다. 각 단계 담당자는 자신의 구현 범위와 근거·검증·되돌리기 비용을 아래에 이어서 기록한다.

## D01 — HOLD 중 단계 1–3의 조건부 draft 개발

- 결정·권한: 최신 사용자는 약 5시간 안에 단계 0–3을 순차 stacked PR로 진행하고 권고안을 독립적으로 선택·기록하도록 승인했다. 코디네이터는 2026-10-22에 Windows 호스트가 노출되지 않았음을 확인하고, 단계 0 HOLD를 유지하면서 이후 단계를 **명시적인 provisional draft 구현**으로 진행하도록 ruling했다. 이전 계획의 ‘V2 PASS 전 모든 스캐폴딩 금지’는 이 한정된 개발 승인에 대해서만 대체한다.
- 이유: 과거 경기 3건의 구조·기본 수치 증거가 있어 격리된 구현·테스트는 진행할 수 있지만 C01/C02/C07/C10의 실제 증거는 현재 획득할 수 없다. 접근 불가능을 LCU 기능 실패 또는 성공으로 단정하지 않는다.
- 경계: 운영 계약 확정·production readiness·단계 0 완료·Windows 설치/실기 성공을 주장하지 않는다. 단계 4–5 운영 배포 승인을 포함하지 않는다. 사용자 설정 경기의 무제한 보관·반영 기한·실시간 선행 수집·수동 통계 입력을 새 요구로 만들지 않는다. PR 생성·push는 코디네이터가 담당한다.
- 검증: 기존 Windows H2와 미완료 대기 세션의 기록 검토, 코디네이터 환경 발견 결과, [보고서](../../validation/lcu-report.md)와 [Windows 실행 절차](../../validation/lcu-windows-capture.md)의 결측 증거 목록. 새 Windows 연결/새 게임은 없음.
- 되돌리기 비용: 추후 실측이 후보 계약과 다르면 어댑터·fixture·draft 기능을 수정하고 테스트/마이그레이션을 재실행한다. 운영 배포 전이므로 운영 데이터 변경 비용은 아직 없다. 이 낮은 비용이 실기 gate 면제의 근거는 아니다.

## D02 — 공개 후보와 검증 완료 fixture 분리

- 결정: `fixtures/lcu/candidates/h2-20261021/`에 G1–G3의 최소 필드 부분집합과 공개 manifest를 추가한다. `verified/`는 만들지 않는다. 실제 계정·경기 ID와 시각은 가명/합성값으로 바꾸고 manifest에 경로별 변환을 명시한다. 통계 660개는 원본을 보존한다.
- 이유: 후속 Java/수집기 테스트의 공통 입력을 제공하면서 실측한 통계와 테스트용 식별/시각을 구분한다. 안전 정수보다 큰 합성 문자열 gameId는 정밀도 손실도 드러낸다.
- 검증: Node 24 감사 스크립트가 해시·허용 필드·10명 join·5+5·승패·660개 원본 수치·가명 일관성·실제 식별자 잔존을 확인했다. 실제 0은 objectives 1행, turrets 4행, 아이템 7슬롯이다. 원본/대응표/화면은 Git에 추가하지 않는다.
- 되돌리기 비용: 후보와 해시를 재생성하고 소비 테스트를 갱신한다. 원본이 보존되어 수치 복구가 가능하다. 공개 이력의 되돌림이 완전한 삭제를 보장하지 않으므로 검토 전 raw 자료는 공개하지 않는다.

## D03 — 실측 범위에 한정한 엄격한 정규화 초안

- 결정: [후보 계약](../../validation/lcu-candidate-contract.md)의 타입·필수 필드·문자열 ID·0/누락 구분·참가자/팀 join을 T01 권고 입력으로 사용한다. observed queueId=3130을 draft 지원 조합으로 제한하되 다른 큐도 동일 의미라고 추정하지 않는다. 역할은 명시적 확인, LCU와 공식 API PUUID는 별도 네임스페이스다.
- 이유: 숫자 문자열 자동 변환, 누락값 0 채우기, 표시 이름 join은 검증 실패를 정상 통계로 숨긴다. 후보는 raw 응답의 일부이므로 제품 파서가 raw의 모든 추가 필드를 거절하도록 잘못 확대하지 않는다.
- 검증: 감사기의 누락/null/문자열/음수/실수/unsafe integer, 잘못된 join·승패·팀 구성·식별자 누출 회귀 테스트 4개를 먼저 실패시킨 뒤 통과시켰다. 제품 정규화 구현/통합 테스트는 후속 단계다.
- 되돌리기 비용: schemaVersion별 어댑터와 테스트를 갱신한다. 원본과 정규화를 분리하면 재처리가 가능하며 필수 지표 정책을 조용히 완화하지 않는다.

## D04 — C07 HOLD와 중복 가중을 피하는 잠정 정책

- 결정: [1차 출처·표본 감사](../../validation/lcu-objective-semantics.md) 후에도 C07 HOLD. objectives/turrets는 원본 그대로 저장하고 합산/차감 파생값을 만들지 않는다. draft 평가의 `objective-provisional-v1`은 TOP=분당 포탑 피해, 나머지 네 역할=분당 오브젝트 피해로 단일 지표를 선택한다. 바깥 가중치는 그대로 유지한다. 코디네이터가 2026-10-22 이 권고를 명시적으로 채택했다.
- 변경점: 기존 계획의 MIDDLE/BOTTOM 오브젝트 항목 내부 50:50 혼합을 이 draft 버전에서 보류한다. 독립성이 확인되지 않은 두 수치를 섞어 포탑을 추가로 가중하지 않기 위한 기술적 권고 결정이며 최종 평가 가중치 변경 승인이나 Riot 공식 의미 선언이 아니다.
- 검증: LCU O≥T 30/30, 공식 API O−T−E=0 46/60·1 14/60을 재계산했다. 공식 명세의 정수 타입만으로 의미를 확정할 수 없다. 후속 평가 테스트는 선택한 필드만 점수에 영향을 주는지 확인하고 운영 전 규칙을 재검토한다.
- 되돌리기 비용: metricMix/algorithmVersion을 새 버전으로 만들고 모든 유효 경기를 재계산한다. 두 원본 필드를 보존하므로 데이터 손실은 없다. 운영 평가 승인과 C07 의미 확인 전까지 점수를 잠정으로 표시한다.

## 단계 0 검증 기록

- macOS arm64 / Node v24.22.1. 최초 sandbox 실행은 loopback `listen EPERM` 21개, 권한 확장 재실행은 probe **26/26 PASS**. Windows 신규 실측 결과가 아니다.
- 새 후보 감사 테스트 **5/5 PASS**, 최초 stub에서 4개 실패 확인 후 구현했고 중복 키에 숨은 식별자 회귀 1개도 실패를 확인한 뒤 canonical JSON 검사로 차단했다. 전체 Node 24 suite **31/31 PASS**. 감사 CLI는 `sourceStatsCompared:660`, `privateIdentityScan:passed`, `gate:HOLD`를 반환했다.
- Windows 재현 문서는 실제 도구 옵션·session/manifest 필드와 대조했다. PowerShell 실행은 현재 수행할 Windows 환경이 없으므로 미검증이다.
- 단계 0 미완료 항목: C01/C02 새 실행 조건 비교, C10 새 내전 지연·추가 LCU 페이지, C07 포함 관계. G1–G3 추가 수집·친구 목록·재시작·다른 PC는 요구하지 않는다.
- 이 dispatch는 코디네이터 작업 경계에 따라 nested worker 없이 자체 diff 검토를 수행한다. 후속 코드 리뷰/PR 처리는 코디네이터가 맡는다.

## D05 — 기존 증거 묶음의 버전 불일치 보존

- 결정: 기존 `.private/lcu/verify-h2-test-data.py`의 이번 실패를 그대로 보고하고 과거 ZIP/manifest를 덮어쓰지 않는다. 현재 공개 후보 감사와 구분한다.
- 이유·검증: 원본 ZIP과 source 파일 해시는 모두 일치했다. 가명화 묶음의 12개 파일 중 `screen-G1-review.md`만 불일치하며, 기존 ZIP 안 문서는 manifest와 일치한다. 차이는 C06 아이템 후속 대조를 설명하는 두 줄이다. 원본/통계 변경 증거는 없지만 과거 묶음의 전체 재검사가 성공했다고 기록할 수 없다.
- 되돌리기 비용: 필요 시 새 버전의 검토 문서·manifest·ZIP을 별도 경로로 만들고 재검사한다. 이번 공개 후보는 화면 문서에 의존하지 않아 데이터 재생성 비용은 없다.

## D06 — 두 실행 조건을 혼동하지 않는 Windows 비교

- 결정: C01은 도구가 전혀 실행되지 않은 정상 경기 A, C02는 다음 정상 경기 B 전 idle 요청 0건과 종료 후 명시 조회를 기록한다. C02의 B를 종료 후 새 프로세스로 조회해 동일 게임 수치를 비교한다. C01의 A와 C02의 B를 같은 경기로 비교하거나 B의 control을 도구 미실행 C01로 주장하지 않는다.
- 이유·검증: 한 경기에서 ‘어떤 도구도 미실행’과 ‘도구를 미리 실행’을 동시에 만족시킬 수 없다. 두 정상 경기와 B의 제어 조회로 조건을 분리했고 실제 도구 옵션/session 필드와 대조했다. 새 Windows 실행은 아직 없다.
- 되돌리기 비용: 관측 양식만 수정 가능하며 실측 결과의 의미를 소급 변경하지 않는다. 추가 비정상 게임이나 별도 PC는 필요 없다.

## D07 — 단계 1 도구와 계약 표현

- 결정: OpenJDK 25.0.1+8-27(현재 로컬 설치), Spring Boot 4.1.1, 공식 Gradle 9.8.2 Wrapper와 SHA-256, PostgreSQL 18.6 digest 고정, Boot BOM 관리 Flyway/Jackson 3/JUnit을 사용한다. 일반 저장/조회는 JPA, 필터는 Specification, JSON 계약은 언어 중립 문서와 Java records 및 공통 후보 fixture로 유지한다.
- 이유·검증: 사용자 지정 Java/Boot/JPA/Groovy와 일치한다. 공식 Boot 요구사항 페이지는 4.1.1·Java 26까지·Gradle 9.x 지원을 표시했다. Wrapper 공식 task 생성, 다운로드 checksum 검증 및 T01 8개 테스트 PASS. JDK 패치 업그레이드와 운영 이미지 검증은 배포 단계에서 별도 수행한다.
- 되돌리기 비용: 빌드 버전/CI 변경과 전체 테스트, JSON 어댑터 변경 시 계약 소비자 동시 갱신. raw/normalized는 PostgreSQL text JSON으로 분리하여 정밀도 손실 없는 원문 수치 재처리가 가능하다.

## D08 — 단계 1의 작은 규모 트랜잭션 직렬화

- 결정: 모든 데이터 mutation은 singleton `service_state` 행의 pessimistic write lock을 먼저 획득한다. DB `(platform_id,game_id)` UNIQUE를 함께 유지하고 읽기는 잠그지 않는다. 신규 임시 저장은 revision을 올리지 않으며 실제 확정/정정/취소/회원 팀 입력 변경만 revision과 durable job을 함께 저장한다.
- 이유: 30명 규모에서는 한 트랜잭션 경계가 명확하며 중복·확정·코드 소비·복구 경합의 결과가 결정적이다. 별도 브로커와 분산 락이 필요 없다.
- 되돌리기 비용: 요청량이 증가하면 행별 잠금/원자 upsert로 분리하고 동시성 회귀 테스트를 확장한다. 현재에는 mutation 처리량이 한 DB 트랜잭션씩 제한된다.

## 외부 실기 접근 후속 확인

코디네이터가 Chrome Remote Desktop 앱/탭을 나중에 발견했으나 Orca GUI는 OS 접근성 권한이 없었고 기존 원격 탭의 브라우저 접근은 사용자 origin 접근 거절로 정책상 차단되었다. 우회하지 않으며 Windows 실측 HOLD를 유지한다. 이전 ‘Orca에 연결된 Windows 호스트 없음’은 Orca inventory 확인 범위의 기록이다.

## D09 — 보존·마이그레이션·후속 평가 경계

- 결정: raw JSON과 정규화 JSON은 별도 `text` 열로 저장하고 JPA participant 행에는 회원/팀/챔피언/승패/최종 역할을 둔다. 원본은 추가 필드를 보존하되 중복 JSON 키는 거절한다. Flyway 표준 이름 `V1__core.sql`을 사용하며 이후 단계는 V2 이상 migration을 추가한다. `service_state`와 durable `recalculation_jobs`를 먼저 만들고 평가 세대/점수/참고 표본 테이블은 T08–T12에서 추가한다.
- 이유·검증: JSON 파싱이 큰 정수 토큰을 lossless 보존하며 30자리 ID 문자열과 원본 수치를 훼손하지 않는다. SQL 검색은 필요한 participant 열과 Specification EXISTS를 사용하므로 raw JSON 검색 인덱스가 필요 없다. 전체 원문 바이트/공백이 아니라 JSON 값의 보존이다. JUnit 실제 PostgreSQL 테스트에서 ingest/confirm 중 audit/job 실패를 주입해 전체 rollback을 확인했다.
- 되돌리기 비용: JSONB가 필요해지면 새 migration에서 캐스팅하고 기존 raw 보존 정책을 유지한다. job/세대 테이블 확장은 기존 revision 의미를 지켜야 한다. 아직 평가가 없어 공개 DTO는 계산 중으로만 표시한다.

## D10 — 인증과 HTTP 기본값의 명시적 운영 한계

- 결정: 고엔트로피 코드/토큰의 SHA-256만 DB 보관, 관리자 쿠키와 동일 origin+CSRF, 1 MiB write body cap, 직접 remote IP의 bounded 메모리 인증 실패 제한을 사용한다. 기본은 Secure `__Host-cw-admin`; dev/test profile과 명시 설정이 함께 있을 때만 HTTP `cw-admin-dev`를 쓴다. CSRF는 인증된 `GET /api/admin/session`에서 재확보한다. forwarded 헤더는 기본 비신뢰다.
- 이유·검증: 추가 로그인 제품 없이 한 운영자/친구 모임 모델에 맞는다. 동시 코드 소비 양 scope, 만료/폐기/계정 불일치, 실제 chunked HTTP, 쿠키 플래그, 코드/계정 로그 비노출, 실제 실행 JAR 복구를 검사했다. 로컬 복구는 웹 리스너 없이 종료하고 새 코드 1회 출력만 한다.
- 되돌리기 비용: 분산 인스턴스나 운영 proxy를 도입하면 중앙 rate-limit/신뢰 proxy 설정을 바꾸고 HTTP 보안 테스트를 재실행한다. 현재 limiter는 재시작 시 초기화되고 proxy 뒤 사용자가 같은 remote IP로 묶일 수 있으므로 T14에서 고정된 proxy 범위를 설정해야 한다.

## D11 — v1 소비자 계약과 안정적 조회

- 결정: 계약은 `docs/contracts/stage1-api.md`, JSON Schema `$defs`, Java records, 별도 독립 매핑 G1–G3 expected JSON으로 제공한다. 평가/팀 모델은 T08–T12 handoff 타입이며 stage 1에서 점수 계산을 수행하지 않는다. 공개 페이지는 `(startedAt,matchKey)` 내림차순 keyset cursor와 한 참가자에 대한 correlated EXISTS Specification을 사용한다. 내부 pending 큐는 소규모 전체 배열이다.
- 이유·검증: 서버 Java와 수집기 TypeScript의 구현을 공유하지 않고도 wire-format을 대조한다. 공개 DTO에서 PUUID/raw/auth를 제외하며 같은 timestamp와 여러 matching participant에서도 중복/누락 없이 페이지를 순회한다. allowedRoles의 순서만 바뀐 요청은 의미 있는 변경이 아니므로 역할 순서를 정규화하여 audit/revision/job을 만들지 않는다.
- 되돌리기 비용: API를 변경하면 schemaVersion/문서/기대값과 모든 소비 테스트를 함께 바꾼다. 내부 큐가 커지면 public과 같은 cursor 계약을 별도 버전으로 추가한다. cursor는 페이지 간 DB snapshot을 고정하지 않으며 새로 수정/취소된 자료는 최신 공개 상태를 따른다.

## D12 — 재현 빌드와 CI 범위

- 결정: Java dependencies는 Boot 4.1.1 BOM과 Gradle lockfile로 고정하고 Wrapper checksum을 기록한다. CI는 immutable action SHA, Java 25, 동일 Compose PostgreSQL, 전체 Gradle build를 실행한다. 운영 배포는 포함하지 않는다.
- 이유·검증: 로컬 OpenJDK 25.0.1과 CI Temurin 25.0.1은 같은 toolchain major와 update를 준수한다. 현재 로컬 전체 빌드/실DB 검증을 완료하고 GitHub Actions 실제 실행은 코디네이터 push 후 확인한다. mock-only/H2 skip 경로가 없다.
- 되돌리기 비용: 버전 업그레이드 때 lockfile/checksum/image digest와 전체 회귀 테스트를 갱신한다. CI는 Temurin 25.0.1과 ubuntu-24.04를 명시한다. 운영용 JDK patch 갱신과 배포판은 T14에서 다시 검증한다.

## 단계 1 마지막 검토 보완

- 인증 경로는 raw URI 문자열 접두사가 아니라 Spring MVC가 실제로 매핑하는 decoded path segments를 사용한다. matrix parameter/percent-encoded 경로의 인증 우회가 두 실패 테스트에서 재현되었고 수정 후 MockMvc와 실제 HTTP 회귀가 모두 통과했다. 이 검증은 일반 라우트 테스트만으로 인증 경계를 보장할 수 없다는 발견이며, canonical 경로 처리를 우회하는 새 라우팅 계층을 도입할 때 동일 테스트를 유지한다.
- 독립 리뷰 전 clean build는 서버 **63/63**, 기존 Node **31/31**, skipped 0이었다. CLI 복구의 sanitized 결과와 한계는 stage1-report에 보존했다. 역할 집합 순서만 바꾸는 요청과 일반 framework 오류 형식도 실패 후 수정했다. 후속 독립 리뷰와 수정 검증은 아래 D13에 기록한다.

## D13 — 독립 리뷰의 JSON 계약 결함 수정

- 발견·권한: 별도 리뷰 dispatch가 `727e2e0`의 실제 코드와 PostgreSQL 테스트를 검토하고 P2 두 건을 재현했다. 숫자 역할 0–4가 enum 순번으로 변환되어 확정/정정에 사용됐고, 추가 raw JSON의 고정밀 소수는 저장 전에 double로 반올림됐다. 코디네이터는 리뷰 종료 후 새 구현 dispatch로 두 수정을 승인했다. 조건부 draft·`objective-provisional-v1`은 승인된 결정이며 단계 0 HOLD는 유지한다.
- 결정: Jackson 3의 `EnumFeature.FAIL_ON_NUMBERS_FOR_ENUMS`와 `DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS`를 활성화한다. 역할 계약은 문자열만 받고 raw JSON tree는 임의 정밀도 소수의 수치값을 보존한다. 명시적으로 선언된 평가 `double`/`Double` 필드는 기존 타입을 유지한다. 원문 공백·소수 표기 형식 자체 보존이나 기존 저장값의 복원은 주장하지 않는다.
- 검증: 먼저 HTTP/실DB 회귀 5개를 추가해 숫자 역할 확정·정정의 200 응답과 raw 소수 손실로 정확히 3개 실패를 확인했다. 수정 후 5개 모두 통과했고, 거절 후 상태/역할/audit/revision/job 불변·정상 문자열 역할 처리·중첩 소수 저장/관리자 조회·큰 정수 ID·필수 통계의 소수 토큰 거절·평가 double 호환성을 검사했다. 관리자 정정 audit 실패와 취소 job 실패의 rollback 테스트 2개도 추가했다. 전체 재실행은 서버 **70/70**, Node **31/31**, skipped 0이다.
- CI 경계: 코디네이터가 이전 HEAD `727e2e0`의 Ubuntu 실PostgreSQL [CI 성공](https://github.com/SangHyeok0908/Civil-War/actions/runs/39643558919)을 확인했다. 이번 수정 커밋은 코디네이터 push 후 별도 CI 결과를 확인해야 하며, 이전 성공을 새 커밋 검증으로 대체하지 않는다.
- 되돌리기 비용: mapper 설정과 회귀 테스트를 함께 검토하면 된다. migration/API 버전/fixture 수정은 없다. 이미 정밀도를 잃은 raw 자료가 있다면 보존된 원본에서 재수집해야 하며 자동 복구하지 않는다. [리뷰 결과와 최종 검증](../../validation/stage1-report.md#independent-review-and-resolution)에 상세를 남긴다.
