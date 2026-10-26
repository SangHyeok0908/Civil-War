# 현재 HTTP/JSON 계약

이 문서는 수집기·웹 화면·서버가 주고받는 요청, 응답과 검증 경계를 설명한다. 경기 수집과 내전 등록은 별도 요청이며, 계산 중에도 등록된 경기 기록은 읽을 수 있다. 외부에 공개하는 응답에는 계정 식별자나 인증 정보를 넣지 않는다.

2026-10-24에 기존 [단계 1 계약](stage1-api.md), [단계 3 계약](stage3-api.md), [LCU 후보 매핑](../validation/lcu-candidate-contract.md)을 통합했다. 새 정책 결정이나 구현 변경은 없다. JSON(데이터 교환 형식)의 구조·필수 필드·허용 값은 [현재 JSON Schema](stage3.schema.json)가 기준이다. [stage1.schema.json](stage1.schema.json)은 당시 구조를 남긴 과거 자료다. 필드 사이의 관계와 서버 검사는 이 문서도 함께 적용한다.

| 구분 | 주체·현재 상태 | 지금 판단할 사항 |
| --- | --- | --- |
| 조사 및 검증 | 기존 계약·스키마·서버 코드를 이 문서에 정리 | 추가 결정 없음 |
| 임시 선택 | 현재 지원하는 원본 어댑터·계산 버전의 입력 범위만 계약으로 기록 | 제품 기준은 [제품 명세](../spec.md), 최신 구현·검증 상태는 [현재 상태](../status.md) 참고 |

HTTP(웹 요청·응답 규약)의 경로 표에서 `:id`, `:key`는 경로에 넣는 값이다. LCU(League Client API, 로컬 게임 클라이언트 인터페이스)는 로컬 경기 데이터를 제공한다. PUUID(플레이어 고유 식별자)는 표시 이름과 다른 비공개 계정 키다. LCU PUUID와 Riot 공식 API(프로그램용 인터페이스)의 PUUID는 별도 식별 체계로 취급한다.

## 공통 형식과 오류

- 본문은 UTF-8 JSON, 시각은 UTC(협정 세계시) ISO 8601 형식이다. ID는 내부 구조를 해석하지 않는 문자열이다. 예외적으로 `gameId`의 형식은 1~30자리 십진 문자열이며, `platformId`는 `[A-Z0-9]{1,16}`, 경기 키는 `platformId + ':' + gameId`다.
- `schemaVersion`은 정수 `1`이다. 문자열 `"1"`, 실수 `1.1`을 변환해서 받지 않는다. 새 스키마를 추가하더라도 보존된 v1 기록을 읽는 디코더는 유지한다.
- 원본 경기 ID의 정수 토큰은 정밀도 손실 없이 읽는다. 자바스크립트 수집기는 일반 `JSON.parse`가 큰 정수를 반올림하기 전에 보존하고 문자열로 보낸다. 이미 정밀도를 잃은 `Number`나 실수 경기 ID를 허용하지 않는다.
- 요청의 바깥 구조에 선언하지 않은 필드, 중복 JSON 키, 자동 타입 변환, JSON 뒤의 추가 값은 거절한다. `rawMatch` 안의 추가 원본 필드는 비공개로 보존할 수 있다.
- 쓰기 요청 본문은 최대 **1,048,576바이트**다. `Content-Length`가 없는 분할 전송도 실제로 읽은 크기를 검사한다.
- **모든 `/api/*` 응답**은 `Cache-Control: no-store`를 사용한다. 공개 응답에도 적용한다.

오류는 [Error 구조](stage3.schema.json#/$defs/Error)로 보낸다. `message`는 번역할 수 있는 고정 코드이며 요청 원본 값이나 PUUID를 반사하지 않는다. 예를 들어 필수 시야 점수가 없으면 다음과 같다.

```json
{"code":"INVALID_MATCH","message":"INVALID_MATCH","retryable":false,"details":[{"path":"participants.0.visionScore","code":"REQUIRED"}]}
```

누락은 `REQUIRED`, null·잘못된 타입은 `INVALID_TYPE`, 범위 오류는 `OUT_OF_RANGE`다. 참가자·팀 모순은 `INVALID_MATCH`, 역할 배치 오류는 `rolesByPuuid / INVALID_ROLES` 상세로 구분한다.

| HTTP 상태 | 코드·처리 |
| --- | --- |
| 202 | `RECALCULATING`; 현재 계산 결과가 준비되지 않음. 일반 오류 구조를 쓰며 `retryable:false`다. |
| 400 | `INVALID_REQUEST`, `INVALID_FILTER`, `INVALID_CURSOR`; 요청 수정 |
| 401 | `AUTH_REVOKED`; 없거나 만료·소비·철회된 코드, 토큰, 세션. 다시 인증 |
| 403 | `ACCOUNT_MISMATCH`, `FORBIDDEN`, `ORIGIN_REJECTED`, `CSRF_REJECTED`; 자동 재시도하지 않음 |
| 404 | `NOT_FOUND`; 공개 조회에서 대기·취소 경기는 없는 경기와 구분하지 않음 |
| 409 | `MATCH_CANCELED`, `INVALID_STATE`, `CONFLICT`, `REFERENCE_MAPPING_CONFLICT`; 취소된 경기 등록 재시도 중단 |
| 413 | `BODY_TOO_LARGE`; 본문 크기 수정 |
| 422 | `INVALID_MATCH`, `UNREGISTERED_PARTICIPANT`, `UNSUPPORTED_SCHEMA`, `INVALID_MEMBER`, `INVALID_SCOPE`, `INVALID_TEAM_MEMBERS`, `INVALID_SCORING_RULES`, `INVALID_REFERENCE_MAPPING`, `INVALID_REFERENCE_SAMPLE`; 입력·등록 상태 확인 |
| 429 | `RATE_LIMITED`, `retryable:true`, `Retry-After: 600`; 대기 후 재시도 |
| 500 | `INTERNAL_ERROR`, `retryable:true`; 저장한 같은 요청을 대기 시간을 늘려 재시도 |

## 인증과 권한

Riot 비밀번호나 LCU 인증 토큰을 서버로 보내지 않는다. LCU에서 현재 계정을 찾았다는 사실은 서버 인증을 대신하지 않는다.

코드와 수집기·관리자 세션 토큰은 임의의 32바이트를 패딩 없는 base64url로 인코딩한 43자 문자열이다. 데이터베이스에는 SHA-256(단방향 해시 함수) 해시만 저장한다. 코드 범위 검사와 1회 소비는 하나의 트랜잭션(함께 성공하거나 취소되는 처리)으로 수행한다. 관리자 코드는 30분, 수집기 코드는 24시간 유효하다. 관리자 세션은 7일 미사용 또는 생성 후 30일에 만료하며, 수집기 자격은 철회할 때까지 유지한다.

| 메서드·경로 | 요청·권한 | 응답 |
| --- | --- | --- |
| `POST /api/admin/session` | `{code}` + 정확한 `Origin` | 200 `{sessionId,csrfToken}` + 관리자 쿠키 |
| `GET /api/admin/session` | 관리자 쿠키 | 200 `{sessionId,csrfToken}`; 새로고침 후 CSRF 복구 |
| `POST /api/admin/logout` | 관리자 쓰기 인증 | 204; 쿠키 제거·서버 세션 철회 |
| `POST /api/collector/enroll` | `{code,currentPuuid}` | 200 `{token,memberId,credentialId,puuid}` |
| `POST /api/admin/codes` | 관리자 쓰기 인증. `{scope:"admin"}` 또는 `{scope:"collector",memberId}` | 200 `{id,code,scope,expiresAt}`; 평문 코드는 이때 한 번만 제공 |
| `GET /api/admin/codes` | 관리자 쿠키 | 최신 100개 `{id,scope,memberId,expiresAt,consumed,revoked}`; 평문·해시 제외 |
| `DELETE /api/admin/codes/:id` | 관리자 쓰기 인증 | 204; 코드 철회 |
| `GET /api/admin/sessions` | 관리자 쿠키 | `[{id,revoked,createdAt,lastSeenAt}]` |
| `DELETE /api/admin/sessions/:id` | 관리자 쓰기 인증 | 204; 세션 철회 |
| `GET /api/admin/collector-credentials` | 관리자 쿠키 | `[{id,memberId,revoked,createdAt}]` |
| `DELETE /api/admin/collector-credentials/:id` | 관리자 쓰기 인증 | 204; 수집기 자격 철회 |
| `GET /api/admin/audit` | 관리자 쿠키 | 최신 100개 비공개 감사 기록 |

관리자 쓰기 인증은 관리자 쿠키, 설정과 정확히 같은 `Origin`, `X-CSRF-Token` 세 가지다. CSRF(다른 사이트에서 인증된 사용자의 쓰기 요청을 유도하는 공격)를 막기 위한 경계다. 관리자 경로는 수집기 토큰으로 접근할 수 없으며 `Authorization` 헤더가 있으면 거절한다. 쿠키는 `__Host-cw-admin`, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, Domain 없음으로 설정한다. 명시적인 개발·테스트 HTTP 모드에서만 `Secure` 없는 `cw-admin-dev`를 쓴다. CORS(다른 출처의 웹 페이지 접근 허용)를 넓게 열지 않으며, 읽기 전용 세션 복구도 쿠키 인증과 브라우저의 동일 출처 제한을 따른다.

수집기 요청은 `Authorization: Bearer <token>`을 쓴다. 요청 주체의 `memberId`, `credentialId`, `puuid`는 서버가 토큰에서 정하며, 요청 본문의 주체 정보를 믿지 않는다. 등록 시 `currentPuuid`가 코드에 연결된 회원의 변경 불가능한 LCU PUUID와 같아야 한다. 불일치하면 코드를 소비하지 않는다. 수집기는 토큰을 화면 렌더러 코드에 노출하지 않고 저장한 작업을 원래 회원·자격에 묶는다.

코드 교환 실패는 직접 연결한 원격 IP별로 10분에 5회까지 허용하고 이후 429로 제한한다. 성공하면 해당 실패 기록을 초기화한다. 이 제한은 메모리에만 있어 서버 재시작 시 초기화되지만 코드·자격·세션은 데이터베이스에 남는다. 전달된 IP 헤더는 신뢰하지 않으므로 프록시 뒤의 여러 사용자가 같은 제한을 공유할 수 있다. 신뢰 프록시 설정의 최신 상태는 [현재 상태](../status.md)를 따른다.

## 회원

역할은 `TOP`(탑), `JUNGLE`(정글), `MIDDLE`(미드), `BOTTOM`(바텀), `UTILITY`(서포터) 중 하나다. 인증된 [Member](stage3.schema.json#/$defs/Member)는 다음 필드를 갖는다.

```json
{"id":"opaque-member-id","puuid":"private-lcu-puuid","riotId":"Name#KR1","displayName":"Name","active":true,"primaryRole":"TOP","secondaryRole":"JUNGLE","allowedRoles":["JUNGLE","TOP"],"seedSkill":50,"profileRevision":1}
```

| 메서드·경로 | 동작 |
| --- | --- |
| `GET /api/admin/members` | 관리자 쿠키로 전체 Member 배열 조회 |
| `GET /api/collector/members` | 수집기 토큰으로 전체 Member 배열 조회 |
| `GET /api/admin/members/:id` | 관리자 쿠키로 Member 1명 조회 |
| `POST /api/admin/members` | 관리자 쓰기 인증. `puuid`, `riotId`, `displayName`, `seedSkill` 필수, active·역할 선택. 생성한 Member, 200 |
| `PATCH /api/admin/members/:id` | 관리자 쓰기 인증. displayName·riotId·active·primaryRole·secondaryRole·allowedRoles·seedSkill 일부 변경, 변경된 Member 반환 |
| `GET /api/members` | 공개 [PublicMember](stage3.schema.json#/$defs/PublicMember) 배열: `{id,displayName,active,primaryRole,secondaryRole,allowedRoles}` |

`seedSkill`(초기 실력값)은 정수 0~100이며 랭크로 자동 추정하지 않는다. primary·secondary는 null일 수 있지만 둘 다 있으면 달라야 하고 `allowedRoles`에 포함되어야 한다. 생성 시 `allowedRoles`를 생략하면 null이 아닌 primary·secondary에서 만들며, 역할이 전혀 없으면 빈 배열로 둔다. 이 회원을 팀 추천에 쓰려면 운영자가 가능한 역할을 정해야 한다.

PATCH에서 생략한 필드는 유지하고 PUUID·ID 변경은 거절한다. 이름 변경은 안정적인 회원 ID나 과거 연결을 바꾸지 않는다. 비활성화도 과거 기록은 보존하되 이후 팀 추천에서 제외한다. 이름·Riot ID만 실제로 바뀌면 `profileRevision`(프로필 변경 번호)만 증가한다. 역할·활성 상태·seedSkill이 실제로 바뀌거나 회원이 생성되면 `sourceRevision`(계산 입력 변경 번호)과 재계산 작업도 생성한다. 아무 값도 바뀌지 않은 PATCH는 재계산을 만들지 않는다.

## LCU 원본을 정규화하는 규칙

`rawMatch`는 원본 경기 객체다. 서버와 수집기는 필요한 경로를 읽어 [NormalizedMatch](stage3.schema.json#/$defs/NormalizedMatch)와 [ParticipantRecord](stage3.schema.json#/$defs/ParticipantRecord)로 바꾼다. 공개 후보 자료의 닫힌 필드 목록은 실제 전체 LCU 응답에 강제하는 제품 스키마가 아니다. 필요한 필드의 누락·타입 변화는 거절하되 추가 원본 필드는 비공개로 보존할 수 있다.

| 정규화 출력·검사 | 원본 경로·규칙 |
| --- | --- |
| `schemaVersion` | 정수 `1`; 지원하지 않는 버전은 `UNSUPPORTED_SCHEMA` |
| `platformId`, `gameId`, 경기 키 | 공통 형식 적용. 원본 정수 gameId 토큰은 정밀도를 보존해 문자열로 변환 |
| `startedAtUtc` | `gameCreation`의 epoch(1970-01-01 UTC 기준 경과 시간) **밀리초**를 UTC로 변환. 정수 1~253402300799999 |
| `durationSeconds` | `gameDuration` 양의 안전 정수, 단위는 초. 1,000으로 다시 나누지 않음 |
| 경기 적격성 | 현재 어댑터는 `gameType:CUSTOM_GAME`, `gameMode:CLASSIC`, `mapId:11`, `queueId:3130`, `endOfGameResult:GameComplete` 조합만 지원. 다른 조합은 `UNSUPPORTED_SCHEMA` |
| `patch` | 비어 있지 않은 `gameVersion` 문자열 보존. 다른 패치의 실제 필드 호환성은 별도 검증 |
| 참가자 연결 | `participantIdentities`, `participants` 각각 정확히 10명. 각 배열의 양의 정수 `participantId`가 중복되지 않고 두 집합이 같아야 함. `participantIdentities[].player.puuid`는 비어 있지 않은 고유 값 10개. 배열 순서·이름으로 연결하지 않음 |
| 팀·승패 | 팀 100·200 각 5명. `teams`는 두 팀을 중복 없이 포함하며 `Win`·`Fail` 한 팀씩. 각 `stats.win` boolean이 해당 팀 결과와 일치 |
| 챔피언·통계 | championId는 1~2147483647 정수. 필수 통계는 모두 0~9007199254740991의 안전 정수. 문자열·실수·음수·null·누락을 0으로 대체하지 않음 |
| 아이템 | `item0`~`item6` 7개가 모두 필요. 0은 빈 슬롯, 누락은 오류. 알 수 없는 ID는 숫자를 보존하고 이미지 대체 표시 |
| 실제 역할 | 원본 lane·role·timeline 힌트로 확정하지 않음. 별도 등록 확인 요청의 `rolesByPuuid`로 각 팀 5역할 검사 |

필수 통계는 아래처럼 `participants[].stats`에서 읽는다.

| 정규화 필드 | 원본 필드 |
| --- | --- |
| `kills`, `deaths`, `assists` | `kills`, `deaths`, `assists` |
| `championDamage` | `totalDamageDealtToChampions` |
| `damageTaken` | `totalDamageTaken` |
| `laneCs`, `neutralCs` | `totalMinionsKilled`, `neutralMinionsKilled` |
| `goldEarned`, `visionScore` | `goldEarned`, `visionScore` |
| `objectiveDamage`, `turretDamage` | `damageDealtToObjectives`, `damageDealtToTurrets` |
| `items[0..6]` | `item0`~`item6` |

CS(처치한 미니언·몬스터 수)는 `laneCs + neutralCs`만 더하며 아군·적 정글 하위값을 다시 합산하지 않는다. 후보에 있는 `wardsKilled`, `wardsPlaced`, 정글 하위값은 참고 필드이며 평가 필수 항목을 늘리는 근거가 아니다. 목표물·포탑 피해는 각각 원본대로 저장하고 합계·차감으로 새 피해 필드를 만들지 않는다. `objectiveDamage >= turretDamage`를 입력 불변식으로 강제하지 않는다. 평가에 사용하는 지표의 의미는 [제품 명세](../spec.md)를 따른다. `GameComplete`만으로 내전 적격성을 확정하지 않아 수집자의 등록 확인을 유지한다.

### 원본 매핑의 측정 근거와 한계

현재 지원 조합은 관찰된 응답을 바탕으로 한 어댑터 범위다. 큐 3130을 모든 내전의 영구 식별자로 일반화하거나, 구조 검증 통과를 Windows 운영 검증 완료로 해석하지 않는다. 최신 적용·검증 상태는 [현재 상태](../status.md)에 둔다.

2026-10-21의 실제 H2 Windows 응답에서 만든 [G1~G3 후보](../../fixtures/lcu/candidates/h2-20261021/manifest.json)는 필드 부분집합이다. 22개 수치 × 30행 = 660개, 챔피언·팀·승패·경기 길이·패치·맵·큐·완료 표시는 당시 원본을 유지한다. 관찰된 패치는 `16.20.824.8524`다. G1 화면 대조는 [기존 실측 보고서](../validation/lcu-report.md)와 [필드 맵](../validation/lcu-field-map.md)의 근거이며 이 계약 통합 때 새로 측정한 결과가 아니다.

후보의 `gameId` 9000000000000000000001~3, `gameCreation`의 2000-01-01~03 UTC, `puuid`의 `fixture-player-01`~`10`은 **합성·가명 값**이다. 배열 순서가 달라도 가명 연결은 유지한다. 실제 ID·계정명·태그·보조 계정 ID·스크린샷·원본 경로·대응표·자유 문자열을 포함하지 않는다. 이 후보로 조회 지연·실제 경기 순서를 검증하지 않으며 완전한 익명성을 보장하지 않는다. 공개 서비스의 데모 선수·경기 초기 데이터로 넣지 않는다.

공개 후보 감사기는 닫힌 구조·정규 인코딩·가명 연결을 확인한다. 비공개 원본을 함께 제공한 실행만 원본 수치·식별자 잔존을 대조한 결과다. 원본 없는 지속 통합(CI) 실행을 원본 대조로 표시하지 않는다. 당시 감사 명령과 결과는 [후보 계약의 재현 감사](../validation/lcu-candidate-contract.md#재현-감사), [테스트 자료 보고서](../validation/lcu-test-data.md)에 남긴다.

## 경기 수집·등록과 중복 처리

네트워크·5xx 재시도는 저장한 같은 제출 내용과 원래 참가자 신원으로 수행한다. `clientSubmissionId`는 공백이 아닌 최대 100자의 제출 시도 ID다. 실제 중복 방지 기준은 platform/game 조합이며 제출 시도 ID가 아니다. 수집 성공을 등록 성공으로 추정하지 않는다.

1. 수집기는 `POST /api/collector/matches/ingest`에 `{rawMatch:<원본 객체>,clientSubmissionId:"saved-attempt",schemaVersion:1}`을 보낸다.
2. 200 [IngestMatchAck](stage3.schema.json#/$defs/IngestMatchAck)는 `{matchKey,state,disposition}`이다. state는 `pending|registered|canceled`, disposition은 `created_pending|already_pending|already_registered|already_canceled`다.
3. 수집기는 대기 경기를 보여주고 참가자가 내전임을 확인하며 10명 전원의 실제 역할을 지정하게 한다.
4. `POST /api/collector/matches/:key/confirm`에 `{rolesByPuuid:{"private-puuid":"TOP",...},clientSubmissionId:"saved-confirmation"}`을 보낸다. `matchKey`는 경로에만 있고 본문에 넣지 않는다. 두 팀 각각 5역할을 중복 없이 갖춰야 한다.
5. 200 [RegistrationAck](stage3.schema.json#/$defs/RegistrationAck)는 `{matchKey,disposition:"created"|"already_registered",sourceRevision}`이다. 반복 확인에는 이후 다른 변경이 있었어도 최초 등록 때 확정된 revision을 반환한다.

ingest는 등록하거나 `sourceRevision`을 늘리지 않는다. 최초 수집 시 10명의 LCU PUUID가 모두 사전 등록된 회원이어야 한다. 기존 경기 재제출은 원본·정규화 값·참가자·역할·상태를 바꾸지 않는다. 들어온 원본은 다시 검증하되 권한은 **저장된 참가자** 기준으로 검사한다. 취소된 경기 ingest는 `already_canceled`, 확인 요청은 409 `MATCH_CANCELED`다. 먼저 확정된 역할을 반복 확인으로 덮어쓸 수 없다.

수집한 사람과 달라도 저장된 참가자이면 확인할 수 있다. 비참가자는 해당 경기의 수집기 상세·확인에 접근할 수 없다.

| 메서드·경로 | 동작 |
| --- | --- |
| `GET /api/collector/matches?state=pending` | 호출자가 참가한 경기 배열, 최신순. state는 pending·registered·canceled, 기본 pending |
| `GET /api/collector/matches/:key` | [CollectorMatch](stage3.schema.json#/$defs/CollectorMatch): `{matchKey,state,match:<NormalizedMatch>,confirmedRoles:null|{puuid:Role}}` |

원본·정규화 JSON, 참가자 10행, 감사 기록, 상태·revision·작업 변경은 같은 트랜잭션에 참여한다. 응답이 유실되면 보존한 같은 요청을 재시도하며 최초 등록이 이긴다. 이 규모에서는 전체 서비스 상태 행 잠금으로 변경을 직렬화하고 데이터베이스 고유 제약으로 platform/game 중복도 막는다. 수집기·관리자의 비공개 목록은 소규모 친구 모임을 위한 상태별 전체 배열이며 공개 목록만 페이지로 나눈다.

## 공개 기록과 관리자 정정

공개 경기는 등록 상태만 조회된다. 공개 전달 객체(DTO)는 PUUID, 원본 JSON, 인증 정보, seedSkill을 제외한다. 참가자 이름은 조회 시점의 현재 프로필을 연결하므로 이름 변경만으로 점수를 재계산하지 않는다.

| 메서드·경로 | 응답 |
| --- | --- |
| `GET /api/matches` | [MatchPage](stage3.schema.json#/$defs/MatchPage): `{items:[PublicMatch],nextCursor:null|string}` |
| `GET /api/members/:id/matches` | 같은 MatchPage, 경로의 회원으로 참가자 필터 지정 |
| `GET /api/matches/:key` | [PublicMatch](stage3.schema.json#/$defs/PublicMatch) 1건. 없음·대기·취소는 모두 404 |

목록 필터는 `memberId`(첫 경로만), 양의 정수 `championId`, `role`, boolean `win`, `cursor`, `limit`이다. limit 기본값은 20, 범위는 1~100이다. 모든 참가자 필터는 **같은 참가자 한 행**에서 충족해야 하며, 일치하는 참가자가 여럿이어도 경기를 중복 반환하지 않는다. 서버 쿼리는 연관된 존재 검사(`EXISTS`)를 사용한다.

순서는 `(startedAtUtc,matchKey)` 내림차순이며 같은 시각은 문자열 경기 키로 안정적으로 정렬한다. 내부 내용을 해석하지 않는 base64url 커서는 이 쌍을 담는다. 다음 페이지에서도 같은 필터를 유지한다. 더 최신 경기가 추가되어도 앞에서 읽은 항목이 다음 페이지로 밀리지 않는다.

PublicMatch에는 `matchKey`, `startedAtUtc`, `durationSeconds`, `mapId`, `patch`, 10명 `participants`, `evaluationStatus`, `scoringVersion`, `sourceRevision`, `generationId`, `scores`가 있다. 공개 참가자는 ParticipantRecord의 PUUID를 빼고 `memberId`, `displayName`, 확정 `role`을 더한다. 현재 계산 결과가 없으면 `evaluationStatus:"recalculating"`, `scoringVersion:null`, `generationId:null`, `scores:[]`로 **HTTP 200을 유지**한다. 준비되면 `ready`와 같은 세대의 점수를 보낸다.

| 관리자 메서드·경로 | 동작 |
| --- | --- |
| `GET /api/admin/matches?state=pending` | 상태별 CollectorMatch 전체 배열. 세 상태 지원, 기본 pending |
| `GET /api/admin/matches/:key` | `{record:<CollectorMatch>,rawMatch:<원본 객체>,rawJson:<저장된 정규 JSON 문자열>,audit:[{id,action,actorId,createdAt,details}]}` |
| `PATCH /api/admin/matches/:key/roles` | `{rolesByPuuid}`. 등록 경기만 허용, 10명 역할 검사 후 `{matchKey,state,sourceRevision}` |
| `POST /api/admin/matches/:key/cancel` | registered → canceled, 취소 상태 재요청은 같은 결과. `{matchKey,state,sourceRevision}` |

`rawMatch`를 일반 JSON 숫자로 읽으면 큰 원본 ID가 반올림될 수 있어 읽기 전용 원본 화면은 `rawJson`을 쓴다. 실제 역할 변경은 안정적인 회원 ID를 키로 변경 전후를 감사 기록에 남긴다. 같은 역할 PATCH·반복 취소는 revision·작업을 만들지 않는다. pending 취소는 409 `INVALID_STATE`다. 취소 기록은 내부에 남고 공개 조회에서 빠진다. 원본 통계 수정·복원 경로는 없다. 회원의 선호 역할을 바꿔도 과거 경기의 확정 역할은 바꾸지 않는다.

## 점수·순위와 팀 추천

계산 세대(`generationId`)는 같은 입력 revision과 계산 규칙으로 한 번에 만든 경기 점수·회원 통계·역할 실력 묶음이다. `sourceRevision`은 계산에 영향을 준 원본 상태의 변경 번호, `scoringVersion`은 변경 불가능한 규칙 묶음의 ID다. 점수 계산식·가중치·지표 혼합 비율의 제품 의미는 [제품 명세](../spec.md)를 따른다.

| 메서드·경로 | 응답·동작 |
| --- | --- |
| `GET /api/rankings` | [Rankings](stage3.schema.json#/$defs/Rankings): `{status:"ready",generationId,sourceRevision,scoringVersion,members:[{displayName,stats:MemberStats}]}` |
| `GET /api/members/:id/stats` | [Profile](stage3.schema.json#/$defs/Profile): `{member:PublicMember,stats:MemberStats,generationId,sourceRevision,scoringVersion}`. 알 수 없는 회원은 404 |
| `POST /api/teams/recommend` | [TeamInput](stage3.schema.json#/$defs/TeamInput) `{memberIds:string[10]}` → `{candidates:[{teamA:[{memberId,role}],teamB:[{memberId,role}],skillDifference}],reason:null|string,sourceRevision}` |
| `GET /api/scoring-versions/:id` | 공개 점수에 쓴 변경 불가능한 전체 [ScoringRuleSet](stage3.schema.json#/$defs/ScoringRuleSet). 알 수 없는 버전은 404 |

현재 세대가 없으면 순위·회원 통계·팀 추천은 202 `RECALCULATING`을 반환한다. 이는 경기 기록을 200으로 읽는 동작과 구분한다.

[GameScore](stage3.schema.json#/$defs/GameScore)는 matchKey·memberId·role·scoringVersion·반올림 전 score·순위 rank와 7개 정규화 항목(damage·growth·combat·vision·objective·deaths·win)의 `breakdown`을 담는다. 화면 반올림과 동점 순위의 기준은 [제품 명세](../spec.md)를 따른다.

[MemberStats](stage3.schema.json#/$defs/MemberStats)는 games·wins·losses·winRate(0~100), 총 kills·deaths·assists, 유한한 KDA(킬·어시스트와 데스의 비율) 또는 null, perfect, null 가능한 adjustedScore·rank, status(`unrated|provisional|ranked`), byRole·byChampion 집계를 포함한다. 경기 수별 상태·점수·순위 적용 기준은 [제품 명세](../spec.md)를 따른다. 역할별·챔피언별 [RecordStats](stage3.schema.json#/$defs/RecordStats)는 경기·승패·K/D/A 합계와 kda·perfect를 담는다.

팀 추천은 10명 미충족·중복·알 수 없는 회원·비활성 회원이면 422 `INVALID_TEAM_MEMBERS`다. 가능한 역할 배치가 없으면 candidates를 비우고 reason으로 이유를 전달한다. 후보 탐색·정렬·선택 범위는 [제품 명세](../spec.md)를 따른다. 캐시 키에는 revision·generationId·정렬한 회원 ID를 포함한다. 공개 추천은 직접 원격 IP별 10분 60회 제한이며 초과 시 429·`Retry-After: 600`이다. 이 메모리 제한은 재시작 시 초기화되고 전달된 IP 헤더는 신뢰하지 않는다.

## 계산 규칙 검증·게시·복구

| 관리자 메서드·경로 | 동작 |
| --- | --- |
| `GET /api/admin/scoring-versions` | 변경 불가능한 전체 규칙 버전, 생성 시각·ID의 오래된 순서 |
| `POST /api/admin/scoring-versions` | 전체 [NewScoringRuleSet](stage3.schema.json#/$defs/NewScoringRuleSet) 생성. 고유한 새 ID 필요. desired 버전·revision·영속 작업을 함께 변경하고 생성 규칙 반환 |
| `GET /api/admin/recalculation/jobs` | 최신 100개 작업: id, sourceRevision, status, 생성·점유·완료 시각, 점유 시 scoringVersion, attempts, 정제한 errorCode |
| `POST /api/admin/recalculation/retry` | 현재 최신 revision의 실패 작업만 pending으로 돌리고 감사 기록. `{status:"pending"}` 반환, 과거 실패는 이력 유지 |

ScoringRuleSet의 필드·숫자 상수는 [현재 스키마](stage3.schema.json#/$defs/ScoringRuleSet)를 따른다. ID는 `[A-Za-z0-9_-]{1,100}`이고 중복이면 409 `CONFLICT`다. 서버는 다섯 역할의 7개 가중치가 빠짐없이 있고 유한한 0 이상 값인지, 역할별 합이 100인지, win이 5 이하인지 검사한다. `metricMix`는 모든 값이 0~1이고 세 쌍(damagePerMinute+damageShare, csPerMinute+goldPerMinute, supportParticipation+supportAssists)이 각각 1이어야 한다. 합 검사의 허용 오차는 `1e-8`이다. 지원하지 않는 규칙은 422 `INVALID_SCORING_RULES`다.

새 규칙 생성의 `algorithmVersion`은 `objective-position-v1`만 받는다. 이전 `objective-provisional-v1` 규칙은 과거 기록 조회·재현을 위해 유지하지만 신규 생성 요청은 `422 INVALID_SCORING_RULES`로 거절한다. normalization·cumulativePrior는 [검증 코드](../../apps/server/src/main/java/cw/domain/ScoringRulesV1.java)의 고정값만 받고, 운영자는 가중치·metricMix를 조정할 수 있다. 포지션별 원시 지표의 의미는 [제품 명세](../spec.md#항목-내부-지표)를 따른다.

[V4 DB 이전](../../apps/server/src/main/resources/db/migrations/V4__confirmed_objective.sql)은 서버 시작 중 현재 선택된 임시 규칙을 새 ID로 복사한다. 새 ID는 `objective-position-v1-` 뒤에 이전 ID의 MD5 해시(문자열을 고정 길이로 바꾼 식별용 값)를 붙이며 보안 용도로 쓰지 않는다. 가중치·내부 비율·고정 상수는 유지하고, sourceRevision 증가·활성 세대 비우기·pending 작업 생성·이전 버전을 담은 감사 기록을 한 트랜잭션으로 처리한다. 이전 규칙·세대·두 원본 피해 필드는 수정하지 않는다. 빈 DB는 확정 기본 규칙으로 시작하며 이미 확정 규칙을 선택했다면 다시 이전하지 않는다. 계산 중 공개 응답은 아래의 기존 세대 정책을 따른다.

`service_state(id=1,source_revision,desired_scoring_version,active_generation_id)`가 변경 번호의 기준이다. 계산에 영향을 주는 변경은 같은 트랜잭션에서 revision을 올리고 활성 세대 포인터를 비우며 `recalculation_jobs`에 영속 pending 작업을 만든다. 작업의 source_revision에는 고유 제약이 있고 메모리 큐만으로 처리하지 않는다. `MutationCoordinator.lock/changed/audit`는 호출자의 트랜잭션에 참여하며 변경은 상태 잠금부터 잡고, 실질 변경이 없으면 `changed`를 건너뛴다.

공개 계산 조회는 `REPEATABLE READ`(읽기 트랜잭션 동안 같은 데이터 상태를 보는 격리 수준)로 서비스 상태를 읽고 revision·scoringVersion이 모두 같은 세대만 허용한다. 이미 시작된 조회는 일관된 이전 스냅샷(그 시점의 데이터 묶음)을 볼 수 있고, 변경 커밋 뒤 시작한 조회는 무효화를 본다.

작업자는 PostgreSQL의 세션 단위 협력 잠금 `731954801`을 점유 → 스냅샷 → 계산 → 게시 전체 동안 유지한다. 입력 스냅샷도 REPEATABLE READ로 읽고 실제 계산은 그 트랜잭션 밖에서 한다. 최종 게시 트랜잭션은 서비스 상태를 잠근 뒤 revision·desired 버전·running 상태·정확한 attempts(점유 시도 번호)를 확인한다. 일치할 때만 모든 gameScores·memberStats·roleSkills를 함께 저장하고 활성 포인터를 바꾼다. 오래된 입력은 게시하지 않고 stale로 처리한다.

복구는 attempts를 올려 이전 작업자의 게시·실패 보고가 새 작업을 덮어쓰지 못하게 한다. 중단된 running 작업은 협력 잠금을 얻은 뒤 복구한다. 실패 작업은 웹 프로세스 재시작 또는 명시적인 retry로 재처리한다. `admin:code` 같은 비웹 프로세스는 스케줄러나 작업 복구를 시작하지 않는다. 상세 근거는 [작업 점유·실패 처리](../../apps/server/src/main/java/cw/evaluation/EvaluationRepository.java), [게시 검사](../../apps/server/src/main/java/cw/evaluation/GenerationPublisher.java)에 있다.

## 공식 기록 참고 자료 가져오기

참고 자료는 선호 역할의 **제안**을 만드는 용도다. 경기 통계·회원 선호·revision을 직접 바꾸지 않으며 제안을 적용하려면 운영자가 검토한 뒤 일반 회원 PATCH를 별도로 해야 한다.

| 관리자 메서드·경로 | 요청·응답 |
| --- | --- |
| `POST /api/admin/member-references` | [ReferenceImport](stage3.schema.json#/$defs/ReferenceImport) `{memberId,officialPuuid,confirmedMapping:true,samples:RoleReferenceSample[]}` → 역할 제안 |
| `GET /api/admin/members/:id/role-suggestion` | `{primary:Role|null,secondary:Role|null,sampleCount,sources,reason}` |

한 번에 최대 200개 표본을 받는다. `officialPuuid`는 공백이 아닌 최대 255자이며 운영자가 `confirmedMapping:true`로 별도 연결을 확인해야 한다. 저장한 공식 PUUID 연결을 다른 값으로 바꾸면 409 `REFERENCE_MAPPING_CONFLICT`다. 같은 공식 PUUID를 다른 회원에게 연결하는 데이터베이스 충돌도 409 `CONFLICT`로 거절한다. 두 종류의 PUUID 값을 비교하는 것으로 동일 인물임을 증명하지 않는다.

[RoleReferenceSample](stage3.schema.json#/$defs/RoleReferenceSample)은 다음 경계를 따른다.

- `sample.puuid`는 해당 회원의 **LCU PUUID**, `sample.evidence.officialPuuid`는 별도 확인한 **공식 PUUID**와 같아야 한다.
- `source`는 `solo420`만 받는다. gameId는 공백 아닌 최대 100자, playedAt은 epoch 이상·현재 이하의 시각이다.
- evidence는 `queueId:420`, 역할 값 또는 null인 `teamPosition`, 300초 이상 정수 `durationSeconds`, `earlyEnded:false`를 포함한다. role이 있으면 teamPosition과 같아야 한다.
- role을 모르는 null 표본은 제안에 넣지 않는다. 같은 회원·source·gameId를 다시 가져오면 중복 저장하지 않는다.
- 외부에서 넣은 inhouse 표본은 거절한다. 내전 표본은 데이터베이스의 등록 경기와 확정 역할에서만 가져온다.

제안은 imported solo420과 등록 내전의 알려진 역할 표본을 합쳐 최신 20개로 만든다. 소스·경기 중복을 합치며 빈도, 가장 최근 시각, 역할의 안정적인 순서로 primary·secondary를 고른다. 가져오기는 감사 기록을 남기지만 초기 실력이나 확정 선호를 자동 변경하지 않는다. 수집기 어댑터도 같은 추가 evidence 필드를 내보내는 구조이며, 실제 공식 API 내보내기 지원의 최신 상태와 당시 실측 근거는 [현재 상태](../status.md), [공식 솔로랭크 참고 조사](../validation/riot-solo-reference.md)를 구분해 읽는다.

## 정적 화면과 이미지

`GET /api/assets`는 Data Dragon(공식 게임 이미지·이름 자료) `16.20.1`에 고정한 한국어 챔피언·아이템 이름과 이미지 파일명을 반환한다. 이미지 성공 여부가 경기 기록 조회의 조건은 아니다. 알 수 없는 ID나 이미지 오류에서는 숫자 ID를 유지한다.

정적 웹 화면은 서버와 같은 Spring JAR(자바 실행 묶음)에서 제공한다. 단일 페이지 앱(SPA)의 index fallback은 `/`, `/matches`, `/matches/:key`, `/members`, `/members/:id`, `/rankings`, `/teams`, `/admin`, `/admin/:page`에만 적용하며 `/api`는 처리하지 않는다. CSP(브라우저 콘텐츠 보안 정책)는 이미지 출처로 자기 서버와 `https://ddragon.leagueoflegends.com`만 허용한다.
