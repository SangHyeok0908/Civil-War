# 코드 형식과 가독성

TypeScript·JavaScript·JSON·YAML·CSS·HTML은 저장소에 고정한 Prettier를 사용하며 들여쓰기는 공백 2칸이다. Java는 Gradle Spotless와 google-java-format의 AOSP 스타일을 사용하며 들여쓰기는 공백 4칸이다. 포맷터 버전과 설정은 저장소에서 함께 관리한다.

저장소 루트에서 다음 명령을 사용한다. Java 명령에는 서버 빌드와 동일한 Java 25가 필요하다.

```sh
pnpm format
pnpm format:java
pnpm format:check
pnpm format:java:check
```

`format`과 `format:check`는 클라이언트·공유 패키지·테스트·도구 스크립트·개발 설정을 다룬다. Java 명령은 서버의 실제 코드와 테스트 코드를 모두 다룬다. `./apps/server/gradlew -p apps/server check`와 `build`에도 Java 포맷 검사가 포함된다. 별도의 Code formatting CI 작업은 모든 push와 pull request에서 두 포맷 검사를 실행하며 데이터베이스가 필요하지 않다.

과거 검증 문서, 캡처한 경기 자료, 계약 스키마, 잠금 파일과 생성물은 일괄 포맷 대상에서 제외한다. 문자열 안의 SQL은 Prettier가 정렬하지 않으므로 문장과 열을 나누어 직접 작성한다.

## 에디터

VS Code에서 저장소를 열고 `.vscode/extensions.json`의 권장 확장을 설치하면 저장 시 포맷을 사용할 수 있다. Java는 Java 25로 Gradle 프로젝트 `apps/server`를 가져오고 Spotless Gradle 확장을 사용한다. 프런트엔드에는 Prettier 확장을 사용한다. 다른 에디터도 `.editorconfig`를 읽도록 하고, Java에는 AOSP 스타일로 설정한 google-java-format 또는 Spotless 연동을 사용한다. 최종 기준은 위 명령의 검사 결과다.

## 코드 작성

- 한 줄에는 하나의 문장을 작성하고, 여러 대입문을 세미콜론으로 이어 쓰지 않는다.
- 변수명은 `participant`, `match`, `teamA`처럼 역할을 드러낸다. 짧은 반복 인덱스를 제외하면 의미 없는 축약을 피한다.
- 조건문과 반복문에는 중괄호를 사용하고, 중첩이 깊어지면 이름을 붙인 작은 메서드로 나눈다.
- 메서드는 하나의 작업을 설명하도록 구성한다. 긴 조건이나 변환은 의미가 드러나는 변수와 메서드로 분리한다.
- 주석은 코드의 동작을 반복하기보다 점수 우선순위, 동률 처리, 외부 자료 해석처럼 이유를 설명한다.
- 대규모 자동 정렬과 이름 변경·메서드 분리는 커밋을 나누고, 구조 변경은 기존 테스트로 동작을 확인한다.
