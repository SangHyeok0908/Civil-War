# C01/C02/C10 재현용 Windows 수집 절차

2026-10-22 준비. **이 문서의 새 실행은 아직 수행하지 않았다.** Node 테스트 성공·명령 라벨·파일 생성만으로 실기 PASS를 판단하지 않는다. 기존 G1–G3를 다시 수집하거나 제외된 친구 목록·다른 PC·클라이언트 재시작·G2/G3 화면을 요구하지 않는다. 정상 내전 일정에 맞춰 실행한다.

## 준비

저장소를 Windows로 복사하고 루트에서 PowerShell 두 창을 사용한다. 개발용 `.private`는 복사하지 않는다. LoL에 로그인하고 실제 설치 경로를 지정한다. 인증·lockfile 내용을 출력하지 않는다.

```powershell
$lcuLockfile = 'C:\Riot Games\League of Legends\lockfile'
node --version
node --test tools/lcu-probe/probe.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Probe tests failed' }
node tools/lcu-probe/probe.mjs --help
Test-Path -LiteralPath $lcuLockfile
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$evidenceDir = ".private/lcu/windows-evidence-$stamp"
New-Item -ItemType Directory -Path $evidenceDir -ErrorAction Stop | Out-Null
Get-CimInstance Win32_OperatingSystem |
  Select-Object Caption,Version,BuildNumber,OSArchitecture |
  ConvertTo-Json | Out-File -Encoding utf8 -NoClobber "$evidenceDir/os.json"
```

기대: Node v24.x, probe 1.0.2, 합성 테스트 26개 성공. 결과는 Windows LCU 조회 증거와 구분한다. PC/수집자는 PC-A/collector-A로만 기록하고 클라이언트 **표시 버전**, 지역, 경기 종료 시각(UTC offset 포함), 각 실행 조건을 비공개 observation에 기록한다. `gameCreation + duration`으로 계산한 시각을 실제 관찰한 종료 시각이라고 쓰지 않는다.

## C01 — 경기 중 도구를 실행하지 않은 경기 A

경기 A 중에는 probe를 실행하지 않는다. 종료 화면을 직접 확인한 뒤 다음을 실행한다. 화면이 필요하면 `.private`에만 저장한다. 같은 이름을 재사용하지 않는다.

```powershell
$gameEndedAt = [DateTimeOffset]::Parse((Read-Host '실제로 관찰한 경기 종료 시각 (예 2026-10-23T22:00:00+09:00)'))
$clientDisplayVersion = Read-Host '클라이언트 표시 버전 (알 수 없으면 Enter)'
$afterOut = ".private/lcu/c01-$stamp"
[ordered]@{
  case='C01'; pc='PC-A'; collector='collector-A'
  observedGameEndedAt=$gameEndedAt.ToString('o')
  observedAt=[DateTimeOffset]::Now.ToString('o')
  probeWasNotRunningDuringGame=$true
  clientDisplayVersion=$clientDisplayVersion
} | ConvertTo-Json | Out-File -Encoding utf8 -NoClobber "$evidenceDir/c01-observation.json"
node tools/lcu-probe/probe.mjs --lockfile $lcuLockfile --out $afterOut --region KR --label C01-after-game --begin 0 --count 3
$LASTEXITCODE | Out-File -NoClobber "$evidenceDir/c01-exit-code.txt"
```

위 boolean은 실제 조건을 확인한 사람의 진술이다. 사실이 아니면 true로 기록하지 않고 C01 실측을 별도 일정으로 남긴다. 시작 시각·최초 history 요청 시각·목록 포함·10명 상세·HTTP 상태를 manifest에서 읽는다. `after-game` 라벨은 종료나 미실행 조건의 독립 증명이 아니다.

## C02 — 다음 정상 경기 B 전에 대기

경기 A의 C01 실행을 완료한 뒤 **다음 경기 B** 전에 창 1에서 실행한다. 경기 A 중에는 미리 실행하지 않았다는 C01 조건을 훼손하지 않는다.

```powershell
$idleStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$idleOut = ".private/lcu/c02-$idleStamp"
$idleOut   # 창 2에서 아래 경로 변수로 복사; 개인 식별값이 없는 출력 경로
node tools/lcu-probe/probe.mjs --lockfile $lcuLockfile --out $idleOut --region KR --label C02-prestarted --begin 0 --count 3 --interactive
```

READY 후 경기 B를 진행하고, 명령을 입력하기 **직전** 창 2에서 현재 `session.json`을 새 파일로 복사한다. 창 2의 `$idleOut`에는 창 1이 출력한 경로를, `$evidenceDir`에는 준비 단계의 디렉터리를 지정한다.

```powershell
$sessionFile = Join-Path $idleOut 'session.json'
$before = Get-Content -Raw -LiteralPath $sessionFile | ConvertFrom-Json
if ($before.requestCount -ne 0 -or $before.captures.Count -ne 0) { throw 'Already queried: invalid idle observation' }
$beforePath = Join-Path $evidenceDir 'c02-before-command.json'
if (Test-Path -LiteralPath $beforePath) { throw 'Snapshot already exists; use a new evidence directory' }
Copy-Item -LiteralPath $sessionFile -Destination $beforePath -ErrorAction Stop
[ordered]@{case='C02'; observedBeforeCommandAt=[DateTimeOffset]::Now.ToString('o'); requestCount=0} |
  ConvertTo-Json | Out-File -Encoding utf8 -NoClobber "$evidenceDir/c02-observation.json"
```

이전 캡처와 구별되는 증거 디렉터리를 사용하고 기존 snapshot을 덮어쓰지 않는다. 창 1의 probe 프롬프트에서 다음을 **한 줄씩 수동 입력**한다.

```text
history 0 3
quit
```

종료한 session.json의 completedAt와 capture가 있어야 한다. 같은 경기 B를 종료 후 새로 시작한 프로세스로 한 번 더 명시 조회한다. 창 1은 `quit` 후 PowerShell 프롬프트로 돌아온 상태여야 한다.

```powershell
$controlStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
node tools/lcu-probe/probe.mjs --lockfile $lcuLockfile --out ".private/lcu/c02-control-$controlStamp" --region KR --label C02-fresh-process-control --begin 0 --count 3
```

두 캡처의 **B의 동일 platformId/gameId·10명 PUUID·팀·승패·길이·필수 통계**를 비교한다. B가 아직 목록에 없으면 비교 미완료로 남기고 지연을 관찰한다. C01의 A와 C02의 B는 다른 경기이므로 서로 같은 키라고 비교하지 않는다. A가 양쪽 목록에 함께 있으면 추가 일관성 대조만 가능하며 A에 대한 경기 전 실행 증거로 해석하지 않는다. C01은 도구 미실행 경기 A, C02는 선행 요청 0건인 대기 경기 B로 각각 검증한다. B에는 idle 프로세스가 있었으므로 fresh-process control을 ‘어떤 도구도 실행하지 않은 C01 경기’라고 기록하지 않는다. READY만 있었고 history를 입력하지 않은 기존 세션은 C02 PASS가 아니다.

## C10 — 지연과 추가 페이지

각 경기 종료 직후 C01/C02의 최초 조회를 관찰점으로 사용한다. 목표 경기가 없을 때만 약 1·5·15분 경과 시점에 다음 블록을 **한 번씩 명시적으로 실행**한다. 자동 루프나 자동 polling을 추가하지 않는다.

```powershell
$retryStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
node tools/lcu-probe/probe.mjs --lockfile $lcuLockfile --out ".private/lcu/c10-delay-$retryStamp" --region KR --label C10-observed-delay --begin 0 --count 3
```

명령 실제 시작·요청 시각으로 경과 시간을 계산하며 파일 이름이나 예정된 1/5/15분을 측정값으로 쓰지 않는다. 최초 성공이 5분이면 ‘이 관찰에서 1분에 부재, 5분에 존재’로 기록한다. 15분은 관찰 창이며 보장 한도가 아니다. HTTP 오류·unknown-schema는 정상 부재와 구분한다.

추가 과거 페이지는 별도 명령이다. 기존 0..2와 이어지는 3..5를 확인하며 관찰한 범위를 넘는 최대 보관 기간을 추정하지 않는다.

```powershell
$pageStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
node tools/lcu-probe/probe.mjs --lockfile $lcuLockfile --out ".private/lcu/c10-page-$pageStamp" --region KR --label C10-page-3-5 --begin 3 --count 3
```

`begIndex=3&endIndex=5`, 반환 gameIndexBegin/gameIndexEnd/gameCount·ID 중복 여부·상세 성공·가장 오래된 **원본** gameCreation을 기록한다. 요청한 3건보다 짧은 응답이나 빈 응답이 전체 서버 보관 한계를 입증하지는 않는다. 공식 API start/count 페이지를 LCU 페이지 실측으로 대체하지 않는다.

## 인계와 판정

| 항목 | 아직 필요한 증거 |
| --- | --- |
| C01 HOLD | 새 정상 경기 A의 실제 종료 시각·경기 중 도구 미실행 진술·종료 뒤 최초 명시 조회의 목록과 10명 상세 |
| C02 HOLD | B 전 READY·명령 직전 0건 snapshot·명시 history 및 정상 종료 session·B 종료 후 fresh-process control과 동일 키/핵심 기록 비교 |
| C10 HOLD | 종료 후 관찰점별 포함/부재/오류와 시각·추가 LCU 페이지·관찰된 최장 과거 범위와 제한 |
| C07 HOLD | 피해 지표의 대상·포함 범위를 설명하는 신뢰 가능한 정의 또는 이를 분리하는 적절한 측정. 추가 G2/G3 화면은 요구하지 않음 |

원본과 관측 메모는 `.private`에서만 검토한다. 압축할 때 lockfile, 토큰, auth 헤더, 로컬 API 키 파일을 넣지 않는다. Git에는 감사 후 가명화한 후보와 집계된 결과만 반영한다. 보고서의 gate를 바꾸는 것은 검토자의 실기 판정이며 CLI가 자동으로 PASS를 선언하지 않는다.
