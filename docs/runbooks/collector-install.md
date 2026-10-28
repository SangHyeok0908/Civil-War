# Windows 수집기 설치·수동 업데이트

설치 파일로 수집기를 실행하면 Node.js·pnpm 같은 개발 도구를 사용자 PC에 설치할 필요가 없다. 설치·업데이트의 자료 보존 기준은 [제품 명세](../spec.md#설치운영-설계), 실제로 확인한 범위는 [현재 상태](../status.md)를 따른다.

기록일: 2026-10-26. 편집·보완일: 2026-10-28.

## 설치와 실행

1. Windows x64 PC에서 전달받은 `Civil-War-Collector-Setup-<버전>-x64.exe`를 실행한다. ARM용 설치 파일은 현재 제공하지 않는다.
2. 설치 안내를 마친 뒤 시작 메뉴 또는 바탕화면의 `Civil War Collector`를 실행한다. 현재 Windows 사용자에게 설치하며 설치 종료 직후 앱은 자동 실행하지 않는다.
3. 롤 클라이언트에 로그인하고 운영자가 발급한 개인별 코드를 입력해 기기를 등록한다. 서버가 준비되지 않았으면 인증·경기 등록은 할 수 없다.

현재 설치판은 서명하지 않은 시험 배포다. Windows 11 x64의 첫 설치 성공과 설치 시 경고를 사용자가 보고했다. 경고에 관한 확인 범위와 원문 설명은 [사용자 확인 기록](../validation/2026-10-26-windows-installer-report.md#후속-windows-기본-설치-사용자-확인)을 따른다. 경고가 나타났다는 사실만으로 배포 파일의 무결성이 확인되는 것은 아니다.

## 서버 연결

사용자는 2026-10-26에 운영 주소가 아직 없으므로 기존 로컬 주소로 제작하도록 선택했다. 기본 연결 대상은 앱을 실행하는 Windows PC의 서버다. 실제 기본값과 게임 설치 경로의 원본은 [main.ts](../../apps/collector/src/main/main.ts)에 있으며, 서버 실행은 [개발 안내](../development/setup.md#로컬-api-실행)를 따른다.

집 Windows·Docker Desktop·Cloudflare 시험 서버는 [서버 배포 안내](home-server.md)로 준비한다. 다른 시험 서버를 연결하려면 PowerShell에서 주소를 지정하고 앱을 실행한다. 아래 주소는 예시이므로 실제 서버 주소로 바꾼다. 외부 서버는 HTTPS가 필요하다.

```powershell
$env:CW_SERVER_ORIGIN = "https://your-service.example"
& "$env:LOCALAPPDATA\Programs\Civil War Collector\Civil War Collector.exe"
```

게임 설치 위치가 기본값과 다르면 같은 PowerShell에서 `CW_LCU_LOCKFILE`에 실제 접속 파일 경로를 지정한다. 환경변수는 그 PowerShell에서 실행하는 앱에만 적용된다. 주소 변경은 운영 서버 구축이나 접속 성공을 뜻하지 않는다.

## 수동 업데이트와 자료 위치

앱을 완전히 종료한 뒤 새 버전의 설치 파일을 실행한다. 설치 식별자와 사용자 자료 경로를 버전 사이에서 유지하도록 설정했다. 앱 제거에서도 자료 삭제 옵션을 사용하지 않는다. 이 설정의 근거 파일은 [설치 설정](../../apps/collector/electron-builder.json)이다.

경기·대기 요청은 `%APPDATA%\Civil War Collector\collector.sqlite`, 암호화된 기기 인증은 같은 폴더의 `credential.bin`에 있다. 사용자 자료 폴더를 직접 지우면 보존 시험이 되지 않는다. 시험 전 백업은 앱을 종료한 상태에서 폴더 전체를 복사한다. 인증이 유효하지 않으면 같은 회원의 새 코드로 기기를 등록하고 `본인 대기 요청 재개`를 사용한다. 자료 소유자 확인과 재개 기준은 [오프라인 보존 정본](../spec.md#오프라인-대기와-재시도)에 있다.

실제 PC에서 업데이트·제거 후 재설치·인증 손상 복구를 확인하는 작업은 설치 파일 생성과 별개다. 현재 실행 순서·백업·판정·결과 양식은 [Windows 실기 절차](collector-acceptance.md)에 있다. 과거 미실행 절차는 [당시 확인 항목](../validation/stage2-report.md#exact-outstanding-windows-manual-run--hold)으로 보존한다.

배포 검사에 통과한 정상 설치판을 보존 시험의 기준 버전으로 유지한다. 같은 설치 파일을 다시 실행한 결과를 서로 다른 버전 사이의 업데이트 성공으로 기록하지 않는다.

## 기존 제거 프로그램의 무결성 오류 복구

예전 시험판에서 `Installer integrity check has failed`로 제거가 실패하면, 업데이트 화면에 앱을 닫을 수 없다는 메시지가 대신 나올 수 있다. [제거 프로그램 오류 보고서](../validation/2026-10-28-uninstaller-integrity-report.md)의 해당 배포판은 다시 설치하는 기준판으로 사용하지 않는다. 현재 실행할 복구 묶음과 새 설치판을 담당자에게 받는다. `/NCRC`로 검사를 건너뛰거나 프로그램·자료 폴더와 설치 등록 정보를 수동으로 지우지 않는다.

1. 수집기와 설치·제거 화면을 모두 종료한다. 복구 묶음을 새 폴더에 풀고 전달받은 ZIP 해시를 대조한다.
2. 그 폴더에서 PowerShell을 연다. 이 복구 도구에 한해서 Node.js 24가 필요하다. 일반 수집기 설치에는 필요하지 않다.

   ```powershell
   node .\repair-uninstaller.mjs --repair
   ```

3. `status`가 `repaired` 또는 `already-repaired`이면 같은 묶음의 새 설치 파일을 실행한다. 도구는 인식한 기존 제거 파일만 복원하며, 기존 자료 폴더 전체와 원래 제거 파일은 별도 새 백업 폴더에 보관한다. 백업 경로가 출력되더라도 그 내용은 공유하지 않는다.
4. `stopped`이면 출력된 `code`를 담당자에게 전달한다. 알 수 없는 원본 해시·실행 중인 수집기·변경된 복구 파일·파일 접근 실패는 강제로 계속하지 않는다. 같은 Windows 사용자와 기존 자료 경로를 유지한다.

복구가 끝나도 Windows 설치·업데이트·자료 보존이 모두 통과한 것은 아니다. 설치 성공과 기존 인증·대기 요청의 유지 여부는 각각 [실기 절차](collector-acceptance.md)로 확인한다. 복구 파일의 허용 범위는 [도구](../../scripts/repair-uninstaller.mjs)와 전달받은 `recovery.json`, 빌드의 검사 기준은 [내부 무결성 검사](../../scripts/nsis-integrity.mjs)가 원본이다.

## 파일 확인과 재생성

설치 파일 옆의 `SHA256SUMS.txt`는 SHA-256 해시 목록이고 `release.json`은 버전·크기·런타임 정보다. 받은 파일의 해시는 PowerShell의 `Get-FileHash -Algorithm SHA256 -LiteralPath <설치파일경로>`로 구해 목록과 대조한다. 파일과 확인값은 신뢰할 수 있는 동일 배포 경로에서 받아야 한다. 해시 일치는 코드 서명이나 동작 검증을 대신하지 않는다.

배포 생성과 재검증은 설치 파일 자체와 그 안의 제거 프로그램에 대해 NSIS 내부 CRC(순환 중복 검사)도 확인한다. 무결성 검사가 꺼져 있거나 저장된 값과 실제 바이트가 다르면 배포를 실패시킨다. 해당 도구 수정은 [버전 한정 패치](../../patches/app-builder-lib@26.18.0.patch)와 [잠금 설정](../../pnpm-workspace.yaml)에 고정했다.

개발 환경에서는 [고정 도구 버전](../../package.json)으로 다음 명령을 실행한다. 처음 생성할 때 Windows 런타임과 설치 도구를 내려받으므로 네트워크 연결이 필요하다.

```sh
pnpm install --frozen-lockfile
pnpm test:collector-release
pnpm package:collector
pnpm verify:collector-release
```

출력은 저장소의 `dist/collector/`에 생성한다. 배포할 파일은 설치 실행 파일·`SHA256SUMS.txt`·`release.json`이다. `win-unpacked`와 디버그 파일을 전달할 필요는 없다. `package:collector`는 게시·업로드 없이 기존 수집기를 다시 빌드하며 사용자 자료 저장소를 열지 않는다.
