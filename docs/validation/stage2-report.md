# Stage 2 — T05–T07 provisional collector verification

> **과거 기록 · 2026-10-22.** 현재 기준은 [정본](../status.md)을 따른다.

**2026-10-23 범위 보완:** 사용자가 C01/C02 조회 시점 비교·C10 지연/과거 범위 측정·T15 시범 운영을 제외했다. 제외를 측정 성공으로 보지 않는다. 결정 주체와 이유는 [D22](../superpowers/decisions/2026-10-22-overnight-decisions.md#d22--2026-10-23-사용자-요청에-따른-검증-작업-제외)에 있다.

> **2026-10-25 편집 보완:** 반복 설명을 정본 링크로 줄였다. 사건 날짜·실측값은 당시 기록이며 현재 링크로 갱신하지 않았다.

- Date: 2026-10-22 KST.
- Base: `8e48b3a` (stage 1 final reviewed head); branch `codex/stage-2-windows-collector`.
- Scope: client workspace, TypeScript contracts/LCU adapter, Windows Electron collector, SQLite outbox, Korean review UI, fixture tests and client CI.
- Status: implemented and locally verified with fixtures. **Actual Windows + League/LCU + DPAPI manual checks remain HOLD.** No installer, signing, production deployment, real match registration, or new Riot API access was performed.
- Independent branch review and stacked PR creation belong to the coordinator. This report records author verification, not an independent review verdict.

## Reproducible checks

Repository commands run with Node 24.22.1 and pnpm 11.5.0:

| Check | Result | Boundary |
| --- | --- | --- |
| `pnpm typecheck` | PASS | TypeScript client/main/preload/renderer/tests |
| `pnpm test` | **48/48**, 6 files, skipped 0 | Includes real file-backed SQLite, mocked remote boundaries |
| `pnpm build` | PASS | Bundled main.cjs, sandbox-compatible preload.cjs, Vite renderer |
| `pnpm test:e2e` | **7/7**, skipped 0 | Actual Electron 45 main/preload/renderer, fixture LCU/server, macOS |
| `pnpm test:probe` | **31/31**, skipped 0 | Existing audited loopback HTTPS transport/CLI tests |
| `pnpm format:check` | PASS | Pinned Prettier client formatting |
| Java 25 `./apps/server/gradlew -p apps/server clean build` | **70/70**, skipped 0, BUILD SUCCESSFUL | Real isolated PostgreSQL, HTTP and packaged recovery regression |

Local Java command used `JAVA_HOME=/Users/seosanghyeog/Library/Java/JavaVirtualMachines/openjdk-25.0.1/Contents/Home` and `GRADLE_USER_HOME=/tmp/cw-gradle-cache`. Tests used the existing isolated Compose PostgreSQL on loopback port 55432. Client changes do not modify the server contract or server source.

Observed Electron runtime: **Electron 45.0.0 / Node 24.22.0 / SQLite 3.53.4**. This was read from `process.versions`, and the Electron restart UI test reopened and drained its actual on-disk SQLite database. Repository CLI tests use the separate Node **24.22.1** toolchain. No better-sqlite3 native rebuild is needed.

The initial sandboxed dependency download and loopback HTTPS test server were blocked by sandbox networking/bind permissions; the authorized reruns succeeded. The Electron UI initially had a duplicate error locator; duplicate rendering was removed and the full suite passed. These are not Windows failures or Windows passes.

`.github/workflows/client.yml` adds exact Node 24.22.1 / pnpm 11.5.0 checks and Electron fixtures on `windows-2022`, with immutable action SHAs. **Its remote execution is pending coordinator push**; a hosted Windows fixture success will still not satisfy real League/DPAPI checks.

## Acceptance map

| Plan cases / requirement | Evidence |
| --- | --- |
| T05 clientStopped, portChanged, noHistoryFetchOnLaunch | `lcu-bridge.test.ts`, service launch test and actual Electron counters; `readConnection` runs before each transport call |
| T05 noTokenInRenderer, accountMismatch | safe account/snapshot tests, protected store tests, actual preload API snapshot and malformed IPC test; renderer has no `require` |
| T05 safeStorage unavailable / decryption failure | mocked protector encrypt/decrypt storage test, failure remains visible even if League is stopped; no plaintext fallback; Windows DPAPI itself HOLD |
| T05 independent normalization | all G1–G3 match independently mapped stage 1 fixtures; string IDs, huge numeric ID parsing, missing versus zero, tuple and identity checks |
| T05 soloReferenceOnly | `role-reference.test.ts`: queue 420 only, early endings excluded, official and LCU PUUIDs separate; export reports unavailable rather than generating misleading data |
| T06 survivesRestart, sending recovery, repeatedQueryCoalesces | real temporary SQLite file reopen; queue/roles retained and `sending` reset; unique unfinished index |
| T06 lostIngestAndConfirmAck, confirmWaitsForIngest, ingestDoesNotAutoConfirm | lost-response stateful fake server; first committed state is read before retry; only one effective confirmation; actual UI counter stays zero until click |
| T06 switchedAccountCannotAdopt / same-member rotation | actor fields remain original; wrong member/token blocked, verified same-member explicit resume recorded separately; enrollment rejects other pending owner before consuming a code |
| T06 canceledStopsRetry, revoked/mismatch/invalid | permanent status table tests, canceled dependency test; no scheduled retry for attention rows |
| T06 FIFO, backoff, concurrent drains | younger game blocked behind future head, 429 Retry-After, jitter capped at 15 minutes, one shared drain promise |
| T06 restartFlushDoesNotFetchLCU | actual Electron offline stage + explicit confirm + close + reopen: `['ingest','confirm']`, LCU history calls **0** on restart |
| T06 retention / disk failures | only aged registered succeeded raw payload cleared; pending payload survives; failed disk enqueue produces LOCAL_SAVE_FAILED and no saved card |
| T07 buttonFetchesAndStages / noAutoRegistration / allRolesConfirmed | service tests and Electron 5+5 selection + explicit checkbox; all ten roles validated again in main |
| T07 offlineThenResume / delayed server | cached roster collection persists while remote promises remain unresolved; window initializes from local state before remote refresh |
| T07 queryFailureIsNotPending / unregistered participant | detail/history failures do not enqueue, empty roster rejects unknown members, UI shows lookup error |
| T07 duplicateShowsExistingState / server pending after LCU expiry | pending API reload, fresh GET for saved keys, external registration/cancellation observed, server-confirmed roles win over drafts |
| Additional raw precision | original response text survives SQLite reopen and outgoing HTTP envelope; arbitrary raw decimal and huge extra integer tokens unchanged |
| Additional IPC/DTO boundary | malformed roles/unknown properties/wrong sender/subframe rejected; server private extra fields stripped using explicit DTO allowlist |

Meaningful regressions were observed failing before fixes: strict FIFO head delay, external state refresh, stopped-LCU explicit confirmation, delayed-server startup, local ownership rejection before code consumption, decryption error priority, bounded jitter, confirmation requiring a registered follow-up read, preserving a server record on first local ingest, and distinct LCU/official reference identities. The first implementation test suites also failed on missing modules before implementation.

## Behavior and preservation rules

당시 제품 동작을 다시 설명하던 목록은 [수집·확인·등록](../spec.md#경기-수집확인등록), [오프라인 대기·재시도](../spec.md#오프라인-대기와-재시도), [수집자 인증·보호 경계](../spec.md#수집자-기기-인증)로 연결한다. 각 동작을 어느 환경에서 확인했는지는 위 Acceptance map이 증거다.

보호 저장소의 오류 분기는 가상 보호기로 시험했다. 실제 Windows DPAPI(Data Protection API, 운영체제의 사용자별 데이터 보호 기능)는 이 실행에서 검증하지 않았다. 당시 검토한 [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)와 [프로세스 간 통신·화면 격리 안내](https://www.electronjs.org/docs/latest/tutorial/context-isolation)는 설계 근거이며 실제 Windows 실행 증거가 아니다.

## Screenshot review

![Synthetic fixture collector review screen](assets/stage2-collector.png)

Captured from the real Electron fixture UI and visually inspected by the implementer; the coordinator separately reported clear 5+5 layout, readable contrast and no visible clipping. All names/IDs/date in the image are synthetic fixture data. The screen shows 확인 대기, ten selected roles, and an unchecked inhouse confirmation with the registration button disabled. It is not a real match or Windows screenshot.

## Exact outstanding Windows manual run — HOLD

2026-10-22 이 보고서 작성 시점에는 실제 Windows의 설치·업데이트·자격 증명 보존을 실행하지 않았다. 아래는 당시 미실행 수용 계획의 고유 확인 항목이며, 시험 성공이나 실행 결과가 아니다. macOS Electron·가상 LCU·가상 서버 결과를 Windows 성공으로 확대하지 않는다.

1. 대상 파일시스템에서 기본 `%APPDATA%\Civil War Collector` 저장 위치와 SQLite 재열기, 설치·업데이트 뒤 기존 자격 증명·미완료 요청 보존을 확인할 계획이었다. 설치·빌드 명령은 [수집기 개발·실행](../development/setup.md#수집기-개발실행)에서 관리한다.
2. 버튼을 누르기 전 경기 목록·상세 요청 **0건**, 화면 개발 도구에 LCU 비밀값·기기 토큰·원본이 전달되지 않는지, Node·임의 프로세스 간 통신 접근이 차단되는지를 확인할 계획이었다. 제외된 실제 클라이언트 재시작 비교는 요구하지 않았다.
3. 운영자의 코드로 등록한 뒤 같은 Windows 사용자로 재시작해 실제 safeStorage 복호화를 확인할 계획이었다. 저장소 사용 불가·암호문 손상 시 재등록 안내, 계정 불일치 시 등록 코드 미소비도 확인 대상이었다. 실제 DPAPI·Windows 사용자 프로필 동작은 미확인이다.
4. 최초 온라인 등록·회원 목록 캐시 뒤 서버를 차단하고 버튼으로 수집해 전송 대기, **5+5** 포지션·내전 확인 뒤 등록 대기, 오프라인 종료·재시작·복구를 확인할 계획이었다. 재연결 시 임시 저장이 등록보다 먼저 처리되고, 별도로 확인하지 않은 두 번째 경기는 확인 대기에 남는지를 관찰할 예정이었다.
5. 서버의 임시 저장·등록 반영 직후 응답을 잃게 한 뒤 재연결해 단일 경기·단일 등록, 원래 포지션 보존, 재시도 중 경기 기록 요청 없음, 반복 조회·다른 참가자의 업로드에서 점수·포지션·원본을 덮어쓰지 않는지를 확인할 계획이었다.
6. 미완료 요청이 있는 상태에서 LCU 계정 변경·인증 폐기·같은 회원의 새 인증 발급을 수행하고, 다른 소유자의 전송 차단과 본인 확인 후 명시적 재개를 확인할 계획이었다. League 종료 뒤 원래 소유자의 저장 자료 전송·등록, 취소 응답, 디스크 부족 시 저장 실패, LCU 기록 만료 후 서버 확인 대기 재조회도 미실행 항목이었다.

2026-10-23에 제외한 조회 시점·과거 범위·시범 운영은 위 D22 기록으로 구분한다. 현재 필수 검증의 범위·상태는 [남은 작업 순서](../status.md#남은-작업-순서)에서 관리한다.

## Stage 3 handoff

2026-10-22 인계 당시 서버 경로·마이그레이션 변경은 없었다. 로컬 SQLite 스키마 버전은 **1**이었으며 `outbox-migrations.ts`에 기록했다. 현재 서버 통신은 [통합 계약](../contracts/api.md), 원본·계약 보존은 [명세](../spec.md#원본계약호환성)를 따른다. 내부 함수·화면 통신 메서드의 상세 목록은 원본 코드에서 관리한다.

당시 공식 참고 자료 내보내기는 `{available:false,code:'OFFICIAL_API_UNAVAILABLE',reason}`을 반환했다. C11의 포털 성공이 직접 HTTP 접근 해결을 뜻하지 않았고 실제 가져오기 성공 자료를 수집기가 만들지 못했다. 같은 사람의 LCU 식별자와 공식 API 식별자는 서로 달랐으며, 계정 연결 자체는 이 단계 어댑터의 검증 범위가 아니었다. 실제 외부 경로의 성공·실패는 [공식 API 검증 기록](riot-solo-reference.md#4-실제-시도와-성공-증거)에 있다.

T08–T12 인계 이후의 구현·검증 및 현재 남은 작업은 [진행 상태](../status.md#단계별-확인-범위)에서 관리한다. 이 보고서의 로컬 시험 결과로 운영 준비 완료를 주장하지 않는다.
