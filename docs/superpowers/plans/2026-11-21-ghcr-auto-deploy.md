# 서버 자동 배포(GHCR)와 수집기 설치 파일 자동 공개 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** master에 병합된 서버 변경은 집 서버에 자동으로 반영하고, 버전이 바뀐 수집기는 설치 파일을 GitHub Releases에 자동으로 공개한다.

**Architecture:** GitHub Actions가 기존 검사 통과 후 서버 이미지를 GHCR에 올린다. 집 PC의 교체 담당 컨테이너(`updater`)는 2분마다 이미지를 확인하고 백업 → 교체 → 정상 확인 → 실패 시 DB·이전 이미지 되돌림을 진행한다. 실패만 Discord로 알린다. 서버는 로컬 이름표 `civil-war-server:current`로 실행하므로 사람이 `docker compose up`을 해도 마지막 정상 이미지가 뜬다. 수집기는 Windows 검사 작업이 만든 파일을 그대로 `collector-v<버전>` Release로 올리며, 같은 버전이 이미 있으면 건너뛴다.

**Tech Stack:** GitHub Actions, Docker CLI·Compose 플러그인, Node.js 24(의존성 없는 `.mjs`와 `node --test`), `gh` CLI. 버전은 설정 파일이 원본이다.

**Spec:** [설계 문서](../specs/2026-11-21-ghcr-auto-deploy-design.md)

## Global Constraints

- 서버 이미지: `ghcr.io/sanghyeok0908/civil-war-server`, 이름표 `master`와 `sha-<커밋 앞 7자>`, 빌드 대상 `linux/amd64`, OCI 라벨 `org.opencontainers.image.revision`·`org.opencontainers.image.source`.
- 교체 담당 이미지: `ghcr.io/sanghyeok0908/civil-war-updater`, 이름표 `latest`와 `sha-<커밋 앞 7자>`. 교체 담당은 자기 자신을 교체하지 않는다.
- master 푸시에서 같은 커밋의 기존 검사가 모두 통과했을 때만 이미지·Release를 올린다. PR·다른 브랜치에서는 올리지 않는다.
- 이미지·Release를 올리는 작업만 `packages: write` 또는 `contents: write`를 갖고 `GITHUB_TOKEN`을 쓴다. 새 외부 작업은 `actions/upload-artifact`·`actions/download-artifact`만 쓰고, 기존 작업 파일처럼 커밋 해시로 고정한다(`gh api repos/actions/<이름>/commits/v4 --jq .sha`로 확인, 주석에 `# v4, resolved <날짜>`).
- 확인 주기 120초, 정상 대기 최대 300초, 교체 직전 백업 최근 10개 보관, 백업 형식 `pg_dump -Fc`.
- Compose 프로젝트 이름 `cw-collector-acceptance`, DB 볼륨·네트워크·환경값 이름을 바꾸지 않는다.
- 교체 담당은 서버 서비스만 다시 만든다(`--no-deps`). postgres·cloudflared는 `stop`/`start`만 하고 다시 만들지 않는다.
- Discord 알림 종류: 되돌림 성공, 되돌림 실패(수동 조치 필요), 백업 실패로 교체 안 함, GHCR 접속 실패 지속(1시간에 한 번). **교체 성공은 알리지 않는다.** 알림에 비밀값·DB 내용·로그 원문·웹훅 주소를 넣지 않는다.
- 수집기 Release 이름 `collector-v<버전>`, 첨부 `Civil-War-Collector-Setup-<버전>-x64.exe`·`SHA256SUMS.txt`·`release.json`. 이미 있는 Release는 덮어쓰지 않는다. 일반 Release(시험판 표시 없음).
- 수집기 버전을 `0.5.0-provisional`로 올린다.
- 커밋 메시지는 `영어 유형: 한글 제목` 형식이며 Co-Authored-By 등 Claude 표시를 넣지 않는다.
- 작업 브랜치: `feat/ghcr-auto-deploy`(master에서 분기).

## Review Focus

- 교체 담당이 Compose로 postgres·cloudflared까지 다시 만들면, 컨테이너 안 경로(`/deploy/...`)가 호스트 경로로 해석되어 Tunnel 토큰·볼륨 연결이 깨진다. 서버 재생성 명령에 `--no-deps`와 서비스 이름 `server`만 있어야 한다(T3 명령 인자 테스트).
- DB 복원 도중 실패하면 반쯤 지워진 DB가 남는다. 스키마 삭제와 복원이 한 트랜잭션이어야 한다(T3 복원 명령 테스트).
- 웹훅 주소가 틀리거나 Discord가 응답하지 않아도 되돌림은 끝까지 진행되고 주소는 로그에 남지 않는다(T1·T2 테스트).
- 되돌림 도중 교체 담당이나 PC가 재시작되면 다음 시작 때 되돌림을 다시 해도 결과가 같아야 한다(T2 재시작 복구 테스트).
- 짧은 간격의 연속 병합에서 늦게 끝난 이전 빌드가 `:master`를 덮으면 안 된다. 게시 작업은 `concurrency`(취소 없음)로 순서대로 실행한다(T4·T6 작업 파일). 같은 수집기 버전의 재병합은 Release를 바꾸지 않는다(T6 테스트).

---

### Task 1: 교체 담당의 상태·백업 이름·알림 모듈

**Files:**
- Create: `infra/home-server/updater/state.mjs`, `infra/home-server/updater/backups.mjs`, `infra/home-server/updater/alerts.mjs`
- Test: `infra/home-server/updater/state.test.mjs`, `infra/home-server/updater/backups.test.mjs`, `infra/home-server/updater/alerts.test.mjs`
- Modify: `package.json` — 스크립트 `"test:updater": "node --test infra/home-server/updater/*.test.mjs"` 추가

**Interfaces:**
- Produces:
  - `UpdaterState = { phase: "idle"|"backing-up"|"starting-new"|"halted", previousId: string|null, candidateId: string|null, candidateRevision: string|null, backupFile: string|null, failedImageId: string|null, pullFailingSince: string|null, lastRegistryAlertAt: string|null }` (시각은 ISO 문자열)
  - `DEFAULT_STATE: UpdaterState` — phase `"idle"`, 나머지 `null`
  - `loadState(path: string): Promise<UpdaterState>`, `saveState(path: string, state: UpdaterState): Promise<void>`
  - `backupFileName(at: Date, revision: string|null): string`, `selectBackupsToDelete(names: string[], keep: number): string[]`
  - `AlertKind = "rolled-back"|"rollback-failed"|"backup-failed"|"registry-unreachable"|"test"`
  - `formatAlert(kind: AlertKind, info: { revision: string|null, at: Date, step?: string }): { content: string, allowed_mentions: { parse: [] } }`
  - `readWebhookUrl(path: string): Promise<string|null>`, `sendAlert(url: string|null, payload, fetchImpl = fetch): Promise<boolean>`

- [ ] **Step 1: 실패하는 테스트 작성**

`state.test.mjs`
- `loadState`가 없는 파일에서 `DEFAULT_STATE`와 같은 값을 돌려준다.
- `saveState` 후 `loadState`가 같은 값을 돌려주고, 임시 파일이 남지 않는다(같은 폴더에 `.tmp` 없음).
- 깨진 JSON이면 `Error("STATE_UNREADABLE")`를 던진다. 빈 상태로 바꾸지 않는다.

`backups.test.mjs`
- `backupFileName(new Date("2026-11-21T03:04:05Z"), "abcdef1234")` → `"20261121-030405-abcdef1.dump"`, revision `null` → `"20261121-030405-unknown.dump"`.
- `selectBackupsToDelete`는 위 형식 이름 12개 중 오래된 2개만 돌려주고, `updater-state.json`·`manual.dump` 같은 다른 이름은 절대 돌려주지 않는다.

`alerts.test.mjs`
- `formatAlert("rolled-back", { revision: "abcdef1234567", at, step: "health" })`의 `content`에 `abcdef1`, `https://github.com/SangHyeok0908/Civil-War/commit/abcdef1234567`, `되돌림`이 들어 있다. `allowed_mentions.parse`는 빈 배열이다.
- 다섯 종류 모두 `content`가 2000자 이하이며 서로 다르다. `rollback-failed`에는 `수동 조치 필요`가 들어 있다.
- `readWebhookUrl`은 앞뒤 공백을 지우고 `https://discord.com/api/webhooks/` 또는 `https://discordapp.com/api/webhooks/`로 시작할 때만 값을 돌려준다. 그 밖의 값과 없는 파일은 `null`이다.
- `sendAlert`: 가짜 `fetchImpl`이 204면 `true`, 500이거나 예외를 던지면 `false`를 돌려주고 예외를 던지지 않는다. `url`이 `null`이면 `fetchImpl`을 부르지 않고 `false`다. 실패 시 `console.error`에 웹훅 주소가 포함되지 않는다(가로채서 확인).

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test:updater`
Expected: 세 모듈을 찾을 수 없어 FAIL

- [ ] **Step 3: 세 모듈 구현**

`saveState`는 같은 폴더의 임시 파일에 쓰고 `rename`한다. `formatAlert` 문구는 한국어로 결과·커밋 앞 7자·커밋 링크·UTC 시각·실패 단계만 담는다. `sendAlert`는 `POST`, `Content-Type: application/json`, 10초 제한(`AbortSignal.timeout(10000)`)을 쓴다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test:updater`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add infra/home-server/updater package.json
git commit -m "feat: 자동 교체 담당의 상태·백업 이름·실패 알림 모듈 추가"
```

### Task 2: 교체 순서와 되돌림

**Files:**
- Create: `infra/home-server/updater/replace.mjs`
- Test: `infra/home-server/updater/replace.test.mjs`

**Interfaces:**
- Consumes: Task 1의 `UpdaterState`, `DEFAULT_STATE`, `backupFileName`, `AlertKind`
- Produces:
  - `Ops` (Task 3이 실제 구현을 만든다):
    `pullSource(): Promise<void>`, `imageId(ref: string): Promise<string|null>`, `imageRevision(id: string): Promise<string|null>`, `tag(id: string, ref: string): Promise<void>`, `stop(services: string[]): Promise<void>`, `start(services: string[]): Promise<void>`, `recreateServer(): Promise<void>`(정상 상태가 안 되면 throw), `backup(fileName: string): Promise<void>`, `restore(fileName: string): Promise<void>`, `pruneBackups(keep: number): Promise<void>`, `alert(kind: AlertKind, info): Promise<void>`(절대 throw하지 않음), `saveState(state: UpdaterState): Promise<void>`, `now(): Date`, `log(message: string): void`
  - `Config = { sourceRef: string, currentRef: "civil-war-server:current", previousRef: "civil-war-server:previous", keepBackups: number }`
  - `runCycle(state: UpdaterState, ops: Ops, config: Config): Promise<UpdaterState>`
  - `recover(state: UpdaterState, ops: Ops, config: Config): Promise<UpdaterState>`

- [ ] **Step 1: 실패하는 테스트 작성**

호출을 `[이름, ...인자]` 배열로 기록하는 가짜 `Ops`를 만든다. `alert`가 throw하도록 바꿀 수 있게 한다. 모든 시나리오에서 `saveState` 호출 순서도 확인한다.

- `runCycle — 같은 이미지면 아무것도 멈추지 않는다`: `imageId(sourceRef) === imageId(currentRef)`이면 `pullSource` 외 호출이 없다.
- `runCycle — 되돌린 이미지는 다시 시도하지 않는다`: 새 이미지 ID가 `state.failedImageId`와 같으면 `stop`을 부르지 않는다.
- `runCycle — 멈춤 상태에서는 확인도 하지 않는다`: `phase: "halted"`이면 호출이 없고 상태가 그대로다.
- `runCycle — current 이름표가 없으면 교체하지 않는다`: `imageId(currentRef)`가 `null`이면 `log`만 하고 `stop`이 없다.
- `runCycle — 성공 순서`: 호출 순서가 정확히 `pullSource`, `saveState(phase "backing-up", previousId, candidateId, candidateRevision)`, `stop(["cloudflared","server"])`, `backup(<backupFileName>)`, `saveState(phase "starting-new", backupFile)`, `tag(previousId, previousRef)`, `tag(candidateId, currentRef)`, `recreateServer`, `start(["cloudflared"])`, `pruneBackups(10)`, `saveState(phase "idle")`다. `alert` 호출이 없다.
- `runCycle — 백업 실패`: `backup`이 throw하면 `tag`를 부르지 않고 `recreateServer`, `start(["cloudflared"])`, `alert("backup-failed")` 순으로 부른다. 결과 상태는 `phase "idle"`, `failedImageId = candidateId`.
- `runCycle — 새 버전 실패 후 되돌림`: `recreateServer`가 첫 호출에서만 throw하면 이어서 `stop(["server"])`, `tag(previousId, currentRef)`, `restore(backupFile)`, `recreateServer`, `start(["cloudflared"])`, `alert("rolled-back", { revision: candidateRevision, step: "health" })`. 결과 `phase "idle"`, `failedImageId = candidateId`.
- `runCycle — 되돌림 실패`: `restore`가 throw하면 `stop(["server"])`, `alert("rollback-failed")`. `start(["cloudflared"])`가 없고 결과 `phase "halted"`.
- `runCycle — 알림 실패가 되돌림을 막지 않는다`: `alert`가 throw해도 결과는 위 되돌림 시나리오와 같다.
- `runCycle — GHCR 접속 실패 알림 간격`: `pullSource`가 계속 throw할 때 0분·59분에는 알림이 없고 60분에 `registry-unreachable` 한 번, 90분에는 없음, 120분에 한 번 더 보낸다. 그 뒤 성공하면 `pullFailingSince`·`lastRegistryAlertAt`이 `null`이 된다. 접속 실패만으로는 `stop`을 부르지 않는다.
- `recover — 백업 중 재시작`: `phase "backing-up"`이면 `restore`·`tag` 없이 `recreateServer`, `start(["cloudflared"])`. 결과 `phase "idle"`. `failedImageId`는 바꾸지 않는다(다음 주기에 다시 시도).
- `recover — 새 버전 시작 중 재시작`: `phase "starting-new"`이면 "새 버전 실패 후 되돌림"과 같은 호출을 하며 `step`은 `"restart"`다.
- `recover — 되돌림 도중 재시작이 반복돼도 같은 결과`: `recover`를 두 번 연속 실행(첫 번째는 `restore` 직후 throw)해도 두 번째가 같은 백업으로 복원하고 `phase "idle"`로 끝난다.
- `recover — idle·halted는 아무것도 하지 않는다`.

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test:updater`
Expected: `replace.mjs`가 없어 FAIL

- [ ] **Step 3: `runCycle`·`recover` 구현**

되돌림은 내부 함수 하나(`rollBack(state, ops, config, step)`)로 두고 `runCycle`과 `recover`가 함께 쓴다. 단계마다 `saveState`를 먼저 하고 다음 동작을 한다. `ops.alert`는 `try/catch`로 감싸 실패를 `log`만 한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test:updater`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add infra/home-server/updater
git commit -m "feat: 서버 자동 교체의 백업·정상 확인·되돌림 순서 추가"
```

### Task 3: Docker 명령 연결, 실행 진입점, 이미지와 Compose

**Files:**
- Create: `infra/home-server/updater/commands.mjs`, `infra/home-server/updater/main.mjs`, `infra/home-server/updater/Dockerfile`, `infra/home-server/updater/.dockerignore`
- Test: `infra/home-server/updater/commands.test.mjs`, `infra/home-server/updater/main.test.mjs`
- Modify: `infra/home-server/compose.yml`, `infra/home-server/.env.example`, `.gitignore`(`infra/home-server/backups/`)

**Interfaces:**
- Consumes: Task 1의 상태·알림 함수, Task 2의 `Ops`·`Config`·`runCycle`·`recover`
- Produces:
  - `Run = (command: string, args: string[], io?: { stdinFile?: string, stdoutFile?: string }) => Promise<{ code: number, stdout: string }>`
  - `createDockerOps(options: { projectName: string, composeFile: string, projectDir: string, backupDir: string, sourceRef: string, waitTimeoutSeconds: number, webhookUrl: string|null, statePath: string, run: Run }): Ops`
  - `readConfig(env: Record<string,string|undefined>): { sourceRef, projectName, intervalSeconds, keepBackups, waitTimeoutSeconds, statePath, webhookFile, pull: "always"|"never" }` — 환경값 이름은 순서대로 `SOURCE_IMAGE`, `COMPOSE_PROJECT_NAME`, `CHECK_INTERVAL_SECONDS`, `BACKUP_KEEP`, `WAIT_TIMEOUT_SECONDS`, `STATE_FILE`, `WEBHOOK_FILE`, `UPDATER_PULL`. 기본값 `projectName "cw-collector-acceptance"`, `intervalSeconds 120`, `keepBackups 10`, `waitTimeoutSeconds 300`, `statePath "/backups/updater-state.json"`, `webhookFile "/run/secrets/discord_webhook"`, `pull "always"`. `SOURCE_IMAGE`가 없으면 throw.
  - CLI: 인자 없음 → `recover` 후 반복, `--reset` → `phase "halted"`이거나 `failedImageId`가 있을 때 `phase "idle"`·`failedImageId null`로 저장(교체 진행 중 상태면 거부하고 종료 코드 1), `--test-alert` → `test` 알림을 보내고 성공 0·실패 1로 종료

- [ ] **Step 1: 실패하는 테스트 작성**

`commands.test.mjs` — 가짜 `run`으로 실제 인자를 확인한다. 공통 앞부분 `C = ["compose", "-p", <projectName>, "-f", "/deploy/compose.yml", "--project-directory", "/deploy"]`.
- `recreateServer` → `docker [...C, "up", "-d", "--no-deps", "--force-recreate", "--wait", "--wait-timeout", "300", "server"]`. 종료 코드가 0이 아니면 throw.
- `stop(["cloudflared","server"])` → `docker [...C, "stop", "cloudflared", "server"]`. `start`도 같은 형태.
- `backup("x.dump")` → `docker [...C, "exec", "-T", "postgres", "sh", "-c", 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc']`, `stdoutFile "/backups/x.dump"`. 종료 코드 0이 아니거나 결과 파일이 0바이트면 throw.
- `restore("x.dump")` → `docker [...C, "exec", "-T", "postgres", "sh", "-c", <아래 셸 문장>]`, `stdinFile "/backups/x.dump"`. 스키마 삭제와 복원이 `psql` 한 트랜잭션 안에서 실행되므로 중간 실패 시 원래 DB가 남는다.

  ```sh
  { printf 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;\n'; pg_restore --no-owner -f -; } | psql -v ON_ERROR_STOP=1 --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"
  ```
- `pullSource` → `docker ["pull", "--quiet", sourceRef]`. `pull "never"`이면 아무 명령도 실행하지 않는다.
- `imageId(ref)` → `docker ["image", "inspect", "--format", "{{.Id}}", ref]`, 실패 시 `null`. `imageRevision(id)`는 `{{ index .Config.Labels "org.opencontainers.image.revision" }}`, 빈 값이면 `null`.
- `tag(id, ref)` → `docker ["tag", id, ref]`.
- 어떤 명령도 `postgres`·`cloudflared`·`updater`를 `up`·`create`·`rm` 대상으로 넣지 않는다(모든 기록을 훑어 확인).

`main.test.mjs`
- `readConfig({ SOURCE_IMAGE: "ghcr.io/sanghyeok0908/civil-war-server:master" })`가 위 기본값을 돌려준다. `CHECK_INTERVAL_SECONDS: "abc"`나 `"0"`이면 throw.
- `--reset`이 `halted` 상태를 `idle`로 바꾸고, `starting-new` 상태에서는 거부한다(임시 폴더의 상태 파일로 확인).

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test:updater`
Expected: FAIL

- [ ] **Step 3: `commands.mjs`·`main.mjs` 구현**

`run`의 실제 구현은 `child_process.spawn`이며 `stdinFile`·`stdoutFile`은 파일 스트림으로 연결한다. `pruneBackups`는 `/backups`의 이름 목록에 `selectBackupsToDelete`를 적용해 지운다. 반복은 한 주기가 끝난 뒤 `setTimeout`으로 다음 주기를 잡아 교체가 겹치지 않게 한다. `SIGTERM`을 받으면 진행 중인 주기가 끝난 뒤 종료한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test:updater`
Expected: PASS

- [ ] **Step 5: 교체 담당 이미지 작성**

`Dockerfile`: `docker:<현재 안정판>-cli@sha256:...` 단계에서 `/usr/local/bin/docker`와 Compose 플러그인을 복사하고, 최종 단계는 `node:24.22.1-alpine@sha256:...`다. `*.mjs`(테스트 제외)만 `/app`에 복사하고 `ENTRYPOINT ["node", "/app/main.mjs"]`. `.dockerignore`는 `*`, `!*.mjs`, `*.test.mjs`. 태그·digest는 작성일에 `docker buildx imagetools inspect`로 확인해 주석에 날짜를 남긴다. 복사 경로는 `docker run --rm <docker cli 이미지> sh -c 'ls /usr/local/libexec/docker/cli-plugins'`로 확인한다.

Run: `docker build -t cw-updater:local infra/home-server/updater && docker run --rm --entrypoint docker cw-updater:local compose version`
Expected: Compose 버전 출력

- [ ] **Step 6: Compose 변경**

`compose.yml`
- `server`: `build: .`와 기존 `image`를 지우고 `image: civil-war-server:current`, `pull_policy: never`로 바꾼다.
- `updater` 서비스 추가: `image: ghcr.io/sanghyeok0908/civil-war-updater:latest`, 환경 `SOURCE_IMAGE: ghcr.io/sanghyeok0908/civil-war-server:master`, `COMPOSE_PROJECT_NAME: cw-collector-acceptance`, 볼륨 `/var/run/docker.sock:/var/run/docker.sock`, `./:/deploy:ro`, `./backups:/backups`, 비밀값 `discord_webhook`, 네트워크 `updater`(새로 정의, internal 아님), `restart: unless-stopped`, 포트 없음.
- 최상위 `secrets`에 `discord_webhook: { file: ./secrets/discord-webhook-url.txt }`, `networks`에 `updater: {}` 추가.

`.env.example`에는 바뀌는 값이 없음을 확인하고 웹훅은 `secrets` 파일에 둔다는 주석 한 줄만 추가한다.

Run: `cd infra/home-server && POSTGRES_PASSWORD=x ADMIN_LOGIN_CODE=xxxxxxxx SERVER_ORIGIN=https://example.test docker compose config --quiet`
Expected: 오류 없음(비밀값 파일이 없다는 경고만 허용)

- [ ] **Step 7: 형식 검사와 커밋**

Run: `pnpm format:check && pnpm test:updater`
Expected: PASS

```bash
git add infra/home-server .gitignore
git commit -m "feat: 집 서버 자동 교체 담당 컨테이너와 Compose 구성 추가"
```

### Task 4: 서버·교체 담당 이미지의 GHCR 게시

**Files:**
- Modify: `.github/workflows/server.yml`
- Create: `.github/workflows/updater.yml`

**Interfaces:**
- Consumes: 기존 `server` 작업의 `bootJar` 결과(`apps/server/build/libs/civil-war-server-*-provisional.jar`, `-plain.jar` 제외), Task 3의 `infra/home-server/updater/Dockerfile`
- Produces: GHCR의 `civil-war-server:master`·`:sha-<7자>`, `civil-war-updater:latest`·`:sha-<7자>`

- [ ] **Step 1: `server.yml` 변경**

- `paths` 두 목록에 `infra/home-server/Dockerfile`, `infra/home-server/.dockerignore`를 추가한다.
- `server` 작업 끝에 `if: github.event_name == 'push' && github.ref == 'refs/heads/master'`인 `actions/upload-artifact` 단계를 추가한다(이름 `server-jar`, 경로는 위 실행 JAR 하나, `retention-days: 1`, 파일이 없으면 실패).
- 새 작업 `publish-image`: `needs: server`, 같은 `if`, `runs-on: ubuntu-24.04`, `permissions: { contents: read, packages: write }`, `concurrency: { group: server-image, cancel-in-progress: false }`. 단계는 checkout → `server-jar` 내려받기 → 임시 폴더에 `infra/home-server/Dockerfile`·`.dockerignore`와 `server.jar` 배치 → `docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin` → `docker build --platform linux/amd64 --label org.opencontainers.image.revision=$GITHUB_SHA --label org.opencontainers.image.source=https://github.com/SangHyeok0908/Civil-War -t ...:master -t ...:sha-${GITHUB_SHA::7}` → 두 이름표 `docker push`.

- [ ] **Step 2: `updater.yml` 작성**

- 트리거: `push`·`pull_request`, `paths: ["infra/home-server/updater/**", ".github/workflows/updater.yml"]`, `permissions: contents: read`.
- `test` 작업: checkout, `actions/setup-node`(기존 고정 해시, `24.22.1`), `node --test infra/home-server/updater/*.test.mjs`.
- `publish` 작업: `needs: test`, master 푸시에서만, `packages: write`, `concurrency: { group: updater-image, cancel-in-progress: false }`, `infra/home-server/updater`를 빌드해 `civil-war-updater:latest`·`:sha-<7자>`를 같은 라벨로 올린다.

- [ ] **Step 3: 검사**

Run: `pnpm format:check`
Expected: PASS. `actionlint`가 설치돼 있으면 `actionlint .github/workflows/server.yml .github/workflows/updater.yml`도 오류 없음.

로컬 대조: `./apps/server/gradlew -p apps/server bootJar` 뒤 Step 1과 같은 폴더 구성으로 `docker build`를 한 번 실행하고, `docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}'`가 넣은 값을 돌려주는지 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add .github/workflows/server.yml .github/workflows/updater.yml
git commit -m "ci: 검사를 통과한 서버·교체 담당 이미지를 GHCR에 게시"
```

### Task 5: 실제 Docker를 쓰는 로컬 모의 교체 시험

**Files:**
- Create: `scripts/updater-simulation.mjs`, `scripts/updater-simulation/bad-server.Dockerfile`, `scripts/updater-simulation/compose.sim.yml`
- Modify: `package.json` — `"test:updater-sim": "node scripts/updater-simulation.mjs"`

**Interfaces:**
- Consumes: Task 3의 교체 담당 이미지(`cw-updater:local`)·Compose, 서버 실행 JAR
- Produces: 시나리오별 통과/실패 출력과 종료 코드

임시 폴더에 `compose.yml`을 복사하고 `compose.sim.yml`로 덮어쓴다. 덮어쓰는 내용은 `updater` 이미지 `cw-updater:local`, `SOURCE_IMAGE: cw-sim/server:master`, `UPDATER_PULL: never`, `COMPOSE_PROJECT_NAME: cw-updater-sim`, `CHECK_INTERVAL_SECONDS: 5`, `WAIT_TIMEOUT_SECONDS: 60`, 그리고 cloudflared를 `busybox` 대기 컨테이너로 바꾸는 것이다. 웹훅 파일에는 Discord가 아닌 주소를 넣어, 알림이 보내지지 않고 로그에 `alert skipped: <kind>`만 남게 한다. 모든 명령은 `-p cw-updater-sim`을 쓰며, 끝나면 `down -v`로 이 프로젝트만 지운다. 실제 운영 프로젝트 이름은 쓰지 않는다.

- [ ] **Step 1: 시나리오 작성**

1. 정상 이미지 A를 `civil-war-server:current`로 두고 시작 → DB에 표식 테이블 `sim_keep`과 행 1개를 넣는다.
2. 성공: 이미지 B(A에 라벨만 다르게)를 `cw-sim/server:master`로 태그 → 30초 안에 실행 중 서버의 이미지가 B, `backups/`에 덤프 1개, 로그에 `alert`가 없다.
3. 되돌림: `bad-server.Dockerfile`(`postgres:18.6` 고정 이미지 기반, 시작하면 `psql`로 `sim_bad` 테이블을 만든 뒤 `exit 1`)을 master로 태그 → 서버 이미지가 B로 돌아오고 `sim_bad`가 없고 `sim_keep` 행이 남아 있다. 로그에 `alert skipped: rolled-back`이 있다.
4. 같은 나쁜 이미지는 다시 시도하지 않는다: 2주기 동안 서버 컨테이너가 다시 만들어지지 않는다.
5. 재시작 복구: 30초 대기 후 실패하는 나쁜 이미지 C를 태그하고, 교체 담당이 `starting-new` 상태일 때 교체 담당 컨테이너를 `docker kill`한 뒤 다시 시작 → 서버가 B로 돌아오고 `sim_bad`가 없다.

- [ ] **Step 2: 실행**

Run: `./apps/server/gradlew -p apps/server bootJar && docker build -t cw-updater:local infra/home-server/updater && pnpm test:updater-sim`
Expected: 다섯 시나리오 모두 PASS, 종료 코드 0. Docker가 없는 환경이면 실행하지 않았다고 보고서에 적고 성공으로 쓰지 않는다.

- [ ] **Step 3: 커밋**

```bash
git add scripts/updater-simulation.mjs scripts/updater-simulation package.json
git commit -m "test: 실제 Docker로 서버 자동 교체·되돌림 모의 시험 추가"
```

### Task 6: 수집기 설치 파일의 GitHub Release 자동 공개

**Files:**
- Create: `scripts/collector-release-publish.mjs`
- Test: `scripts/collector-release-publish.test.mjs`
- Modify: `.github/workflows/client.yml`, `package.json`(`test:collector-release`에 새 테스트 추가), `apps/collector/package.json`(`version` → `0.5.0-provisional`)

**Interfaces:**
- Consumes: `scripts/collector-release.mjs`의 `verifyRelease(directory)` → `{ version, files: [{ name, bytes, sha256 }] }`
- Produces:
  - `releaseTag(version: string): string` → `collector-v<version>`
  - `releaseNotes(info: { version: string, commit: string, installer: { name: string, sha256: string } }): string`
  - `Gh = (args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>`
  - `publishCollectorRelease(options: { directory: string, commit: string, gh: Gh }): Promise<"created"|"exists">`
  - CLI: `node scripts/collector-release-publish.mjs <dir>`. 커밋은 `GITHUB_SHA`에서 읽으며 없으면 종료 코드 1

- [ ] **Step 1: 실패하는 테스트 작성**

- `releaseTag("0.5.0-provisional") === "collector-v0.5.0-provisional"`.
- `releaseNotes`에 커밋 전체 값, 설치 파일 SHA-256, `코드 서명`, `https://github.com/SangHyeok0908/Civil-War/blob/master/docs/runbooks/collector-install.md`가 들어 있다.
- `publishCollectorRelease — 이미 있으면 만들지 않는다`: 가짜 `gh`가 `["release","view","collector-v0.5.0-provisional"]`에 0을 돌려주면 결과는 `"exists"`이고 `release create` 호출이 없다.
- `publishCollectorRelease — 새 버전이면 세 파일로 만든다`: `view`가 1이면 `["release","create","collector-v0.5.0-provisional", <dir>/Civil-War-Collector-Setup-0.5.0-provisional-x64.exe, <dir>/SHA256SUMS.txt, <dir>/release.json, "--target", <commit>, "--title", "Civil War Collector 0.5.0-provisional", "--notes-file", <임시 파일>]`을 부르고 결과는 `"created"`다. `--prerelease`가 없다.
- `publishCollectorRelease — 파일이 변조되면 gh를 부르지 않는다`: 설치 파일 1바이트를 바꾸면 `CHECKSUM_MISMATCH`를 던지고 `gh` 호출이 없다.
- `publishCollectorRelease — 생성 실패`: `create`가 1이면 `Error("RELEASE_CREATE_FAILED")`.

시험 폴더는 `writeReleaseManifest`로 가짜 설치 파일에서 만든다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test scripts/collector-release-publish.test.mjs`
Expected: FAIL

- [ ] **Step 3: 구현**

`gh`의 실제 구현은 `spawn("gh", args)`이다. 노트는 운영체제 임시 폴더에 쓰고 끝나면 지운다. Node 내장 모듈과 `./collector-release.mjs`만 가져온다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test:collector-release`
Expected: PASS

- [ ] **Step 5: `client.yml` 변경과 버전 올림**

- `client` 작업 끝에 master 푸시에서만 실행하는 `actions/upload-artifact` 단계(이름 `collector-release`, 파일은 설치 파일·`SHA256SUMS.txt`·`release.json` 세 개, `retention-days: 1`)를 추가한다.
- 새 작업 `publish-release`: `needs: client`, master 푸시에서만, `runs-on: ubuntu-24.04`, `permissions: { contents: write }`, `concurrency: { group: collector-release, cancel-in-progress: false }`. checkout → `actions/setup-node`(`24.22.1`) → 아티팩트를 `dist/collector`로 내려받기 → `node scripts/collector-release-publish.mjs dist/collector`(환경 `GH_TOKEN: ${{ github.token }}`).
- `apps/collector/package.json`의 버전을 `0.5.0-provisional`로 바꾼다.

Run: `pnpm format:check && pnpm test:collector-release && pnpm typecheck && pnpm test`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add scripts/collector-release-publish.mjs scripts/collector-release-publish.test.mjs .github/workflows/client.yml package.json apps/collector/package.json
git commit -m "ci: 새 수집기 버전의 설치 파일을 GitHub Release로 자동 공개"
```

### Task 7: 운영 문서·현재 상태·검증 보고서

**Files:**
- Modify: `docs/spec.md`(설치·운영 설계), `docs/runbooks/home-server.md`, `docs/runbooks/collector-install.md`, `docs/development/setup.md`, `docs/status.md`, `docs/ssot.json`, `docs/README.md`(생성)
- Create: `docs/validation/2026-11-21-auto-deploy-report.md`

- [ ] **Step 1: 정본 갱신**

- `spec.md`: 서버는 master 병합마다 자동 교체(교체 전 백업·자동 되돌림·실패만 Discord 알림), 수집기는 새 버전만 Release 자동 공개·앱 자동 업데이트 없음, PostgreSQL은 수동 갱신을 짧게 추가한다. 세부 절차는 운영 문서로 연결한다.
- `home-server.md`: 최초 전환(패키지 공개 설정 확인, 웹훅 파일, 백업, 새 `compose.yml`을 저장소에서 받아 기존 폴더에 배치, `docker pull`·`docker tag ...:master civil-war-server:current`, `docker compose up -d --wait`, `docker compose run --rm updater --test-alert`), 평소 확인 방법(`docker compose logs --tail 50 updater`, 실행 중 이미지의 커밋 라벨), 되돌림 실패 후 수동 조치와 `docker compose run --rm updater --reset`, 교체 담당 수동 갱신(`docker compose pull updater && docker compose up -d updater`), 기존 ZIP 절차를 수동 대체 절차로 표시. 성공 알림이 없다는 제한을 적는다.
- `collector-install.md`: 설치 파일을 GitHub Releases의 `collector-v<버전>`에서 받고 같은 Release의 `SHA256SUMS.txt`로 대조한다. 개발 절차에 "공개하려면 수집기 버전을 올린다"를 추가한다.
- `setup.md`: `pnpm test:updater`, `pnpm test:updater-sim`(Docker 필요) 실행법을 문서 검사 절과 같은 형식으로 추가한다.

- [ ] **Step 2: 검증 보고서와 상태**

보고서에는 실행 환경(OS·Node·Docker 버전), 각 명령과 결과, 센 테스트의 종류와 수(단위 테스트 수는 `node --test` 요약의 pass 값), 로컬 모의 시험 결과를 쓴다. 실제 GitHub·GHCR 게시와 실제 집 PC 교체를 구분해 "PR 병합 후 확인 예정" 또는 "사용자 실행 필요"로 적고 성공으로 쓰지 않는다. `status.md`에는 날짜 절 하나로 요약하고 보고서를 연결한다.

- [ ] **Step 3: 등록과 검사**

`ssot.json`에 이 계획(`reference`)과 보고서(`historical`, `date: "2026-11-21"`, `current: "docs/status.md"`)를 등록한다.

Run: `pnpm docs:index && pnpm test:docs && pnpm docs:check && pnpm format:check`
Expected: 모두 통과

- [ ] **Step 4: 커밋**

```bash
git add docs
git commit -m "docs: 서버 자동 교체와 수집기 Release 공개 운영 절차 추가"
```
