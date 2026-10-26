# 문서 안내

<!-- docs/ssot.json에서 생성합니다. pnpm docs:index로 갱신하세요. -->

주제별 원본과 문서 역할은 [문서 등록부](ssot.json)에서 관리합니다. 내용은 아래 원본에서 확인하고, 안내·이력 문서는 원본으로 연결합니다.

## 주제별 원본

| 주제 | 원본 |
| --- | --- |
| writing-review-policy | [공통 작성·검토 원칙](../AGENTS.md#공통-작성검토-원칙) |
| documentation-policy | [문서 관리 절차](../AGENTS.md#문서-관리-절차) |
| commit-policy | [커밋 메시지 작성](../AGENTS.md#커밋-메시지-작성-원칙) |
| pr-policy | [PR 추가 조건](../AGENTS.md#pr-추가-조건) |
| product-scope | [제품 범위·사용자·참가자](spec.md#제품-범위와-사용자) |
| collection-policy | [경기 수집·확인·등록](spec.md#경기-수집확인등록) |
| offline-policy | [오프라인 대기·재시도·보존](spec.md#오프라인-대기와-재시도) |
| scoring-policy | [경기별 활약 점수·가중치·정규화](spec.md#경기별-활약-점수) |
| ranking-policy | [누적 랭킹·보정·동점 표시](spec.md#누적-랭킹과-점수-표시) |
| team-policy | [팀 편성용 실력·후보 선택](spec.md#팀-편성용-실력과-팀-추천) |
| consistency-policy | [변경·재계산·일관성 보장](spec.md#변경재계산일관성) |
| operation-design | [설치·운영·백업 설계](spec.md#설치운영-설계) |
| project-status | [현재 구현·검증·남은 작업·범위 제외](status.md) |
| development-workflow | [개발·실행·테스트·로컬 복구](development/setup.md) |
| code-style | [코드 형식·가독성·에디터](development/code-style.md) |
| http-lcu-contract | [현재 수집·API 계약](contracts/api.md) |
| probe-usage | [읽기 전용 LCU 도구 사용법](../tools/lcu-probe/README.md) |
| contract-fixtures | [정규화 계약 기대값의 용도](../fixtures/contracts/v1/README.md) |
| node-package-versions | [Node.js·pnpm·프런트엔드 의존성 버전](../package.json) |
| node-lockfile | [전이 의존성 고정 값](../pnpm-lock.yaml) |
| server-toolchain | [JDK·서버·Java 형식 검사 도구 버전](../apps/server/build.gradle) |
| gradle-distribution | [Gradle 배포판·검증 해시](../apps/server/gradle/wrapper/gradle-wrapper.properties) |
| test-database | [테스트 DB·이미지·포트 기본값](../infra/compose.test.yml) |
| wire-schema | [현재 요청·응답 자료 구조](contracts/stage3.schema.json) |
| ssot-registry | [정본 목록과 문서 역할](ssot.json) |
| documentation-checker | [문서 검사·안내표 생성 동작](../scripts/docs.mjs) |

## 기준 문서

- [AGENTS.md](../AGENTS.md)
- [docs/spec.md](spec.md)
- [docs/status.md](status.md)
- [docs/development/setup.md](development/setup.md)
- [docs/development/code-style.md](development/code-style.md)
- [docs/contracts/api.md](contracts/api.md)
- [tools/lcu-probe/README.md](../tools/lcu-probe/README.md)
- [fixtures/contracts/v1/README.md](../fixtures/contracts/v1/README.md)

## 안내·근거 문서

- [README.md](../README.md)
- [docs/README.md](README.md)
- [docs/superpowers/plans/2026-10-26-confirmed-objective.md](superpowers/plans/2026-10-26-confirmed-objective.md)

## 이력 문서

- [docs/contracts/stage1-api.md](contracts/stage1-api.md) — 2026-10-22, 현재: [docs/contracts/api.md](contracts/api.md)
- [docs/contracts/stage3-api.md](contracts/stage3-api.md) — 2026-10-22, 현재: [docs/contracts/api.md](contracts/api.md)
- [docs/superpowers/decisions/2026-10-21-tech-stack-decisions.md](superpowers/decisions/2026-10-21-tech-stack-decisions.md) — 2026-10-21, 현재: [docs/spec.md](spec.md)
- [docs/superpowers/decisions/2026-10-22-overnight-decisions.md](superpowers/decisions/2026-10-22-overnight-decisions.md) — 2026-10-22, 현재: [docs/spec.md](spec.md)
- [docs/superpowers/plans/2026-10-21-lcu-probe-recheck.md](superpowers/plans/2026-10-21-lcu-probe-recheck.md) — 2026-10-21, 현재: [docs/spec.md](spec.md)
- [docs/superpowers/plans/2026-10-21-lcu-validation-plan.md](superpowers/plans/2026-10-21-lcu-validation-plan.md) — 2026-10-21, 현재: [docs/spec.md](spec.md)
- [docs/superpowers/plans/2026-10-21-lol-inhouse-development-plan.md](superpowers/plans/2026-10-21-lol-inhouse-development-plan.md) — 2026-10-21, 현재: [docs/spec.md](spec.md)
- [docs/superpowers/plans/2026-10-23-code-readability.md](superpowers/plans/2026-10-23-code-readability.md) — 2026-10-23, 현재: [docs/spec.md](spec.md)
- [docs/superpowers/specs/2026-10-21-lol-inhouse-design.md](superpowers/specs/2026-10-21-lol-inhouse-design.md) — 2026-10-21, 현재: [docs/spec.md](spec.md)
- [docs/validation/lcu-candidate-contract.md](validation/lcu-candidate-contract.md) — 2026-10-22, 현재: [docs/contracts/api.md](contracts/api.md)
- [docs/validation/lcu-field-map.md](validation/lcu-field-map.md) — 2026-10-21, 현재: [docs/status.md](status.md)
- [docs/validation/lcu-objective-semantics.md](validation/lcu-objective-semantics.md) — 2026-10-24, 현재: [docs/status.md](status.md)
- [docs/validation/lcu-report.md](validation/lcu-report.md) — 2026-10-21, 현재: [docs/status.md](status.md)
- [docs/validation/lcu-test-data.md](validation/lcu-test-data.md) — 2026-10-21, 현재: [docs/status.md](status.md)
- [docs/validation/lcu-windows-capture.md](validation/lcu-windows-capture.md) — 2026-10-23, 현재: [docs/status.md](status.md)
- [docs/validation/riot-solo-reference.md](validation/riot-solo-reference.md) — 2026-10-22, 현재: [docs/status.md](status.md)
- [docs/validation/stage1-report.md](validation/stage1-report.md) — 2026-10-22, 현재: [docs/status.md](status.md)
- [docs/validation/stage2-report.md](validation/stage2-report.md) — 2026-10-22, 현재: [docs/status.md](status.md)
- [docs/validation/stage3-report.md](validation/stage3-report.md) — 2026-10-22, 현재: [docs/status.md](status.md)
- [docs/validation/2026-10-24-ssot-report.md](validation/2026-10-24-ssot-report.md) — 2026-10-24, 현재: [docs/development/setup.md](development/setup.md)
- [docs/validation/2026-10-25-historical-ssot-report.md](validation/2026-10-25-historical-ssot-report.md) — 2026-10-25, 현재: [AGENTS.md](../AGENTS.md)
- [docs/validation/2026-10-26-confirmed-objective-report.md](validation/2026-10-26-confirmed-objective-report.md) — 2026-10-26, 현재: [docs/status.md](status.md)

## 보존한 과거 기록 구간

이력 문서도 중복을 검사합니다. 당시 결정·측정·근거를 남겨야 하는 아래 구간만 등록한 내용 해시가 일치할 때 중복 비교에서 제외합니다. 링크와 제목 연결은 계속 검사합니다.

| 문서 | 구간 ID | 보존 이유 |
| --- | --- | --- |
| [docs/superpowers/decisions/2026-10-22-overnight-decisions.md](superpowers/decisions/2026-10-22-overnight-decisions.md) | `d01-development-authorization` | 2026-10-22 당시 사용자가 위임한 개발 시간·단계 범위와 코디네이터의 조건부 진행 판단을 보존한다. |
| [docs/superpowers/decisions/2026-10-22-overnight-decisions.md](superpowers/decisions/2026-10-22-overnight-decisions.md) | `d22-user-scope-exclusion` | 2026-10-23 사용자가 검증·시범 운영을 범위에서 제외한 지시 내용을 고정 근거로 보존한다. |
| [docs/superpowers/decisions/2026-10-22-overnight-decisions.md](superpowers/decisions/2026-10-22-overnight-decisions.md) | `d24-user-confirmation` | 2026-10-24 최종 평가 지표를 채택한 사용자의 원문과 당시 결정 주체를 보존한다. |
| [docs/validation/lcu-candidate-contract.md](validation/lcu-candidate-contract.md) | `candidate-source-audit-command` | 2026-10-22 후보 수치·식별자 잔존 감사를 재현하는 당시 비공개 원본 경로와 명령을 보존한다. |

## 조건부 근거

공개 저장소에 없는 근거는 아래 경로가 Git에서 제외된 경우에만 파일 존재 검사를 생략합니다. 공개 문서의 링크와 제목 연결은 계속 검사합니다.

| 경로 | 이유 |
| --- | --- |
| `.private/` | 보유자만 확인할 수 있는 비공개 원본·대응표·실측 자료이며 공개 저장소에는 포함하지 않는다. |
| `apps/server/build/` | Gradle 실행으로 생성되는 테스트 결과·패키지이며 공개 저장소에 고정하지 않는다. |
| `test-results/` | 테스트 실행에서 생성되는 합성 DB 전용 로그·추적·인증 상태다. |
