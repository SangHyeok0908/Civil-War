# 실제 Riot 키 조회 확인과 키 교체 뒤 PUUID 갱신 검증

운영 서버에서 팀 추천을 요청해 실제 Riot 키로 솔로랭크가 조회되는지 확인했다. 키는 Riot에 도달했지만 등급은 한 명도 새로 반영되지 않았고, 원인은 운영 키 교체였다. 키를 바꿔도 다음 팀 추천부터 등급이 다시 반영되도록 서버를 고쳤다. 이 수정은 로컬 시험까지만 확인했으며 운영 서버에는 아직 반영되지 않았다.

기록일: 2026-11-27. PUUID는 Riot이 계정마다 주는 식별값이다. 결정 이유와 대안 비교는 [설계 기록의 보완](../superpowers/specs/2026-11-25-team-live-solo-rank-design.md#2026-11-27-보완--api-키-교체-뒤-저장된-puuid-갱신), 현재 규칙은 [API 계약](../contracts/api.md#점수순위와-팀-추천), 현재 상태는 [상태 정본](../status.md)을 따른다.

| 분류·주체 | 상태 | 지금 판단할 사항 |
| --- | --- | --- |
| 조사 및 검증 · 개발 담당자 | 운영 서버의 실제 조회 1회 관측, Riot의 해독 실패 응답 관측 | 없음 |
| 사실(사용자 제공) | 2026-11-24 이후 운영 서버의 Riot 키를 교체함 | 없음 |
| 오류 수정 · 개발 담당자 | 저장된 PUUID 갱신 구현, 로컬 시험 통과 | 운영 반영 뒤 실제 등급 반영 확인 필요 |

## 변경 전후

| 상황 | 변경 전 | 변경 후 |
| --- | --- | --- |
| Riot이 돌려준 PUUID가 저장 값과 다름 | 항상 `conflict`, 등급 저장 안 함 | 저장 값을 Riot에 한 번 더 확인 |
| 저장 값을 Riot이 해독하지 못함(다른 키가 발급) | `conflict`가 계속됨 | 저장 값을 새 PUUID로 바꾸고 이번 등급을 반영, 감사 기록 남김 |
| 저장 값이 현재 키에서 유효함(Riot ID가 다른 계정 것) | `conflict` | `conflict` 유지 |
| 저장 값 확인 실패, 또는 새 PUUID를 다른 계정이 보유 | `conflict` | `conflict` 유지 |

## 운영 서버 관측(실제 연동)

2026-11-27 13:48 UTC에 이 Mac에서 운영 서버의 공개 API로 참가자 10명 전원의 팀 추천을 한 번 요청했다. 운영 DB는 열지 않았고 응답만 읽었다.

| 항목 | 결과 |
| --- | --- |
| 응답 | 200, 0.68초. 대기 상한을 넘긴 조회 없음 |
| 이번 조회가 반영된 사람(`live`) | 0명 |
| `conflict` | 9명. 모두 2026-11-24에 저장된 값 사용 |
| `not_found` | 1명. 2026-10-30에 저장된 값 사용 |
| 팀 후보 | 0개. 10명 모두 가능한 포지션이 비어 있음. Riot 키와 무관 |

`conflict`는 Riot의 계정 조회가 성공해야 나오므로, 운영 키가 Riot에 도달해 응답을 받는다는 점은 확인됐다. 9명이 함께 충돌한 원인을 키 교체로 본 근거는 사용자의 교체 확인과 아래 응답 관측이다. 운영 DB의 저장 값을 직접 대조하지는 않았다.

## Riot 응답 관측(실제 연동)

로컬에 보관한 키로 Account-v1의 PUUID 조회를 호출했다. 이 키와 운영 키가 같은지는 확인하지 않았다.

| 요청 | 결과 |
| --- | --- |
| 같은 키로 받은 PUUID | 200 |
| 같은 PUUID의 두 글자를 바꾼 값 | 400, 본문에 `Exception decrypting` |
| League-v4에 같은 변조 값 | 400, 같은 본문 |

다른 키가 발급한 실제 PUUID로는 시험하지 못했다. 해독할 수 없는 값에 대한 응답이 같을 것이라는 점은 변조 값 관측에 근거한 추정이다.

## 로컬 시험(가상 Riot 응답)

macOS arm64, 저장소 테스트 Compose의 PostgreSQL(`cw_test`)에서 실행했다. 아래 수는 시험 사례 수다.

| 환경·검사 | 결과 |
| --- | --- |
| `./apps/server/gradlew -p apps/server clean build` | 통과. JUnit 시험 사례 196개(33개 클래스), 실패·오류·건너뜀 0. 이번에 5개 추가 |
| `pnpm format:check`, `pnpm format:java:check` | 통과 |

| 상황 | 기대 결과 | 근거 시험 |
| --- | --- | --- |
| 저장 값이 다른 키의 것 | `live`, 새 등급 반영, 저장 값 교체, 감사 기록 1건 | `LiveRankLookupIntegrationTest.storedPuuidFromAnotherKeyIsReplaced` |
| 저장 값이 유효(다른 계정) | `conflict`, 이전 등급·저장 값 유지 | `riotIdNowOwnedByAnotherAccountStaysConflict` |
| 저장 값 확인 실패 | `conflict`, 저장 값 유지 | `uncheckedStoredPuuidStaysConflict` |
| 새 PUUID를 다른 계정이 보유 | `conflict`, 두 계정의 저장 값 유지 | `replacementHeldByAnotherAccountStaysConflict` |
| Riot 응답 200·400 해독 실패·그 밖의 400·500 | 각각 `valid`·`foreign_key`·`unavailable`·`unavailable` | `HttpRiotGatewayTest.puuidStateSeparatesAnotherKeysPuuidFromOtherFailures` |

구현을 넣기 전에는 첫째와 다섯째 시험이 실패했고, 나머지 셋은 기존 동작(`conflict`)을 지키는 시험이라 통과했다. 웹·수집기 시험은 이번 변경이 서버 내부에 한정되어 다시 실행하지 않았다.

## 한계와 미확인 사항

- **운영 반영 뒤의 실제 등급 반영은 미확인이다.** 병합해 서버가 교체된 뒤 팀 추천을 한 번 요청해 `live`가 나오는지 확인해야 한다.
- **`not_found` 1명은 이 수정으로 해결되지 않는다.** Riot이 그 Riot ID를 찾지 못한 경우이며, 운영자가 참가자의 현재 Riot ID를 확인해야 한다.
- **프로필 사진 조회는 영향이 없다.** 저장된 PUUID를 쓰지 않고 매번 Riot ID로 새로 찾는다.
- 호출 한도 대책이 없다는 기존 한계는 그대로다. 키 교체 뒤 첫 추천은 추천 1번의 Riot 호출이 최대 30번이다.
