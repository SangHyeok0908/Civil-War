# LoL 내전 서비스 기술 스택 선택 근거

**2026-10-25 편집 보완:** 선택 당시의 주체·비교·제약·미확정 항목을 보존하고 공통 동작 설명은 정본 링크로 정리했다. 아래의 지원 상태·미확정은 원래 기록 날짜 기준이며 현재 링크의 값은 당시 값의 재현 자료가 아니다.

> **기록일 2026-10-21.** 현재: [정본](../../spec.md).

- 작성일: 2026-10-21
- 결정 주체: 사용자. 비교와 추천은 대화에서 제시한 기술 검토를 바탕으로 정리한다.
- 관련 문서: [서비스 기획서](../specs/2026-10-21-lol-inhouse-design.md), [개발 계획](../plans/2026-10-21-lol-inhouse-development-plan.md), [LCU 검증 계획](../plans/2026-10-21-lcu-validation-plan.md)

현재 확정한 서버 구성은 **Java 25 + Spring Boot 4.1.x의 최신 정식 패치 버전 + PostgreSQL + Spring Data JPA + Specification + Gradle Groovy DSL(`build.gradle`)**이다.

선택의 중심은 사용자가 이미 익숙한 Java·Spring Boot·JPA·Gradle을 활용하고, 새 프로젝트에 적합한 DB와 지원 중인 실행 환경을 조합하는 데 있다. 각 절의 사용자 결정은 실제 합의이며, 선택 근거는 그 결정을 뒷받침하는 기술적 판단이다. 사용자가 이유까지 직접 밝힌 경우에는 별도로 명시한다. 대안 표에는 선택을 이해하기 위한 보완 비교도 포함하며, 표에 등장하는 도구를 새로 채택한다는 의미는 아니다.

## 1 배경과 결정 과정

결정 당시의 제품 요구는 [승인 기획 기록](../specs/2026-10-21-lol-inhouse-design.md), 현재 적용할 범위와 데이터 일관성은 [제품 명세](../../spec.md)를 따른다.

초기 계획의 Fastify·TypeScript 등은 작성자가 제안한 기술이었다. 사용자는 이를 그대로 확정하지 않고 자신의 기존 경험과 대안을 비교한 뒤 직접 결정하기를 원했다.

| 순서 | 대화에서 확인한 내용 | 결정 또는 상태 |
| --- | --- | --- |
| 1 | 사용자는 기존 Spring Boot·Java·MySQL 경험을 밝히고, 대안의 실사용 장단점과 LCU JSON 원본 보존 이유를 질문했다. | 기술 비교와 원본 보존의 목적·비용을 설명. `jsonb`를 별도 기술 선택으로 확정한 것은 아님 |
| 2 | 서버 프레임워크·언어와 DB 비교 후 구성을 선택했다. | Spring Boot + Java + PostgreSQL 확정 |
| 3 | 기존 JPA 경험을 바탕으로 동적 조회와 MyBatis 등의 대안을 비교했다. | JPA + Specification 확정 |
| 4 | Gradle과 Maven을 비교했다. | 사용자가 기존 Gradle 경험을 이유로 `build.gradle` 확정 |
| 5 | Java 21과 25의 장단점, 호환되는 Spring Boot 버전과 추천을 비교했다. | Java 25 + Spring Boot 4.1.x의 최신 정식 패치 버전 확정 |

## 2 서버 프레임워크와 언어

**결정: Spring Boot + Java. 주요 대안: Fastify + TypeScript.**

| 선택지 | 사용했을 때의 장점 | 사용했을 때의 단점과 비용 |
| --- | --- | --- |
| Spring Boot + Java | 기존 개발 경험을 그대로 활용한다. Spring의 데이터 접근·트랜잭션·인증·운영 기능을 함께 사용하기 편하다. 경기 등록과 평가 같은 도메인 규칙을 익숙한 방식으로 유지보수할 수 있다. | 자동 설정과 프레임워크 동작을 이해해야 한다. 작은 Node.js 서버와 비교하면 기동 시간·기본 메모리 사용이 부담이 될 수 있다. 웹을 TypeScript로 선택하면 서버와 클라이언트의 모델을 따로 관리해야 한다. |
| Fastify + TypeScript | 필요한 기능을 골라 작은 API 서버로 시작하기 좋다. 웹과 수집기도 TypeScript를 선택한다면 언어·모델·일부 도구를 공유할 수 있다. 비동기 I/O 중심 작업에 적합하다. | 사용자는 Node.js 서버 운영과 생태계를 새로 익혀야 한다. DB 접근·트랜잭션·인증 등 주변 구성을 선택하고 통합할 부담이 있다. 긴 동기 계산이 이벤트 루프를 막지 않도록 작업을 나누거나 별도 실행 경로를 마련해야 한다. |

Spring Boot는 자동 설정과 운영용 상태 확인·메트릭 등을 제공하며, Fastify는 TypeScript 타입과 플러그인 기반 구성을 지원한다. Node.js의 이벤트 루프 제약은 긴 작업을 배치하는 방식의 고려 사항이다. 두 서버의 실제 메모리·응답 속도 우열은 애플리케이션 구성과 측정 조건에 따라 달라진다. [Spring Boot 기능](https://spring.io/projects/spring-boot/), [Fastify TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/), [Node.js 이벤트 루프](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop)

### 선택 근거

사용자가 직접 밝힌 기존 경험은 Spring Boot와 Java다. 이 프로젝트에서는 경기 상태 전환·중복 방지·재계산을 사용자가 이해하고 수정하기 쉬운 구조로 만드는 것이 중요하다. 익숙한 서버 기술을 유지하면 기능 개발과 오류 해결에 집중하기 좋다는 판단이다.

Fastify 제안의 장점이었던 TypeScript 공유는 웹·수집기의 기술까지 TypeScript로 정했을 때 성립하는 이점이다. 그 선택이 아직 확정되지 않았으므로 서버 선택의 결정적 근거로 삼지 않았다.

### 선택에 따른 영향

정규화·평가·팀 추천의 기준 구현은 Java 서버에 둔다. 웹·수집기와의 일치는 HTTP/JSON 계약과 공통 검증 데이터로 확인한다. 서버와 클라이언트가 동일한 TypeScript 코드를 직접 공유한다는 초기 전제는 제거한다. API 타입 생성 도구는 별도 선택 사항이다.

## 3 서버 데이터베이스

**결정: PostgreSQL. 주요 대안: 사용자가 기존에 사용한 MySQL.**

| 선택지 | 사용했을 때의 장점 | 사용했을 때의 단점과 비용 |
| --- | --- | --- |
| PostgreSQL | 관계형 테이블과 JSON 자료를 한 DB에서 함께 관리하기 좋다. `jsonb`의 연산·인덱스를 활용해 수집 응답을 조사할 수 있다. 필요한 경우 SQL로 집계·분석을 확장하기 좋다. | 사용자는 MySQL과 다른 SQL 세부 동작·자료형·백업·운영 방식을 익혀야 한다. PostgreSQL 전용 기능을 많이 사용하면 다른 DB로 이전하는 비용이 커진다. |
| MySQL | 기존 경험을 활용해 개발·장애 대응을 시작하기 쉽다. InnoDB 기반 관계형 저장과 트랜잭션으로 현재 서비스 요구를 구현할 수 있다. JSON 자료도 저장·조회할 수 있다. | PostgreSQL의 `jsonb` 연산과 같은 설계를 그대로 옮길 수는 없다. JSON 인덱스나 DB별 쿼리는 MySQL 방식으로 구성해야 한다. 이 프로젝트를 구현할 수 없을 정도의 기능 부족이 있다는 판단은 아니다. |

PostgreSQL은 `jsonb` 인덱스를 지원한다. MySQL도 네이티브 JSON 타입과 JSON에서 추출한 값의 인덱싱 등을 지원한다. 따라서 JSON을 보관한다는 요구만으로 PostgreSQL이 필수가 되지는 않는다. [PostgreSQL JSON 타입](https://www.postgresql.org/docs/current/datatype-json.html), [MySQL JSON 타입](https://dev.mysql.com/doc/refman/8.4/en/json.html)

### 선택 근거

사용자는 서버 구성과 함께 PostgreSQL을 명시적으로 선택했다. 이를 뒷받침하는 기술적 판단은 경기·참가자·등록 상태를 관계형으로 관리하면서, 수집 응답의 조사와 향후 집계 확장도 같은 DB 안에서 처리하기 좋다는 점이다.

현재 데이터 규모에서는 DB 제품 간 최대 처리량보다 테이블 구조·인덱스·트랜잭션·백업 운영이 더 큰 선택 기준이다. PostgreSQL 선택에 따라 MySQL 경험을 일부 새롭게 익혀야 하는 비용을 받아들인다. PostgreSQL의 정확한 메이저·패치 버전은 아직 정하지 않았다.

## 4 LCU 응답을 JSON으로 보존하는 이유

**상태: 원본 보존은 기존 설계에 포함돼 있다. PostgreSQL의 저장 타입을 `jsonb`로 확정한 결정과는 구분한다.**

원본 보존의 목적은 수집 당시 자료를 다시 해석할 수 있게 하는 것이다. 예를 들어 CS 합산이나 피해량 필드 해석에 오류가 있었을 때, 당시 응답이 남아 있으면 정규화 로직을 수정해 다시 처리할 수 있다. 나중에 필요한 지표가 생겨도 그 필드가 당시 보존한 응답에 포함돼 있었다면 추출할 수 있다. 당시 응답에 없었던 정보를 복원할 수는 없다.

| 보관 방식 | 장점 | 단점과 비용 |
| --- | --- | --- |
| 필요한 관계형 컬럼만 저장 | 조회와 제약 조건이 명확하고 중복 저장이 적다. | 추출하지 않은 필드는 사라진다. 정규화 오류를 고치려면 원본을 다시 수집해야 할 수 있다. |
| JSON만 저장 | 응답 구조 변화와 아직 사용하지 않는 필드를 수용하기 쉽다. | 일반 조회·집계마다 JSON 해석이 필요해지고, 관계·제약·인덱스 설계가 복잡해진다. |
| 원본 JSON과 정규화 컬럼을 함께 저장 | 일반 조회는 컬럼으로 처리하고, 오류 분석·재정규화에는 원본을 사용할 수 있다. | 저장·백업 용량이 늘고, 원본과 파생 자료의 관계를 관리해야 한다. 기존 계획이 지향하는 방식이다. |

**평가 가중치만 바꾸는 재계산에는 원본 JSON이 항상 필요한 것은 아니다.** 계산에 필요한 수치가 이미 정규화 컬럼에 모두 있다면 그 자료로 재계산할 수 있다. 원본의 추가 가치는 잘못 해석한 필드의 재처리와 미사용 필드의 추출에 있다.

저장 형식에는 별도의 차이가 있다. `jsonb`는 공백·객체 키 순서·중복 키를 보존하지 않으므로 HTTP 응답을 바이트 단위로 보관한 것과 다르다. 정확한 응답 바이트가 필요하면 별도 파일이나 바이너리 보존 방식을 검토해야 한다. `json`은 입력 텍스트를 보존하고, `jsonb`는 검색·처리에 유리한 형태로 변환한다. 실제 요구에 맞춰 저장 타입과 JPA 매핑을 결정한다. [PostgreSQL의 json과 jsonb 차이](https://www.postgresql.org/docs/current/datatype-json.html)

원본 경기 수치와 사용자가 확인한 포지션은 구분한다. 동일 경기 재전송은 기존 원본을 덮어쓰지 않으며, 원본 LCU 응답 전체를 공개 API에 내보내지 않는다. 이러한 동작은 기존 기획과 개발 계획의 요구다.

## 5 데이터 접근과 동적 조회

**결정: Spring Data JPA + Specification.**

동적 쿼리는 특정 제품명이 아니라 입력 조건에 따라 조회 조건을 조합하는 방식이다. JPA Specification, Querydsl, MyBatis 등으로 구현할 수 있다. 이번 선택은 JPA의 저장·변경 방식을 유지하면서 선택적 조회 조건을 Specification으로 조합하는 것이다.

| 선택지 | 사용했을 때의 장점 | 사용했을 때의 단점과 비용 |
| --- | --- | --- |
| JPA 쿼리 메서드·JPQL 중심 | 기존 JPA 경험을 활용하기 쉽고, 형태가 고정된 조회를 간결하게 표현한다. | 선택 조건의 조합이 많아지면 메서드나 쿼리가 늘어난다. 조건 조합을 재사용하기 번거로울 수 있다. |
| **JPA + Specification** | Spring Data JPA 안에서 조건을 분리·재사용·조합한다. Querydsl의 Q 클래스 생성 설정 없이 시작할 수 있다. | Criteria API 표현이 길어지기 쉽다. 문자열로 속성명을 지정하면 오타를 컴파일 단계에서 잡기 어렵다. 복잡한 조인·집계·DTO 조회는 읽기 어려워질 수 있다. |
| JPA + Querydsl | Java 코드로 복잡한 조건과 조인을 읽기 좋게 표현하고, 생성된 Q 타입으로 속성 참조를 검사한다. JPA 저장 방식을 유지할 수 있다. | Q 클래스 생성과 빌드 설정이 추가된다. 채택할 배포판·버전과 JDK·JPA 호환성을 관리해야 한다. |
| MyBatis | 실행할 SQL을 직접 보고 조정하기 쉽다. DB 특화 쿼리와 복잡한 조회에 적합하고 동적 SQL을 지원한다. | CRUD SQL과 결과 매핑을 직접 관리하는 일이 늘어난다. JPA의 변경 감지·객체 상태 관리에 익숙한 개발 방식에서 전환 비용이 발생한다. |
| Spring JDBC의 JdbcTemplate·JdbcClient | SQL 실행 흐름을 명시적으로 다루면서 연결·자원 처리의 반복 작업을 줄인다. 특정 SQL 작업에 도입하기 쉽다. | SQL과 결과 매핑, 동적 조건 구성의 책임이 애플리케이션에 더 많이 남는다. |
| jOOQ | SQL 중심으로 복잡한 조회를 표현하고, 스키마에서 생성한 코드로 타입 검사를 강화할 수 있다. | 별도 DSL과 코드 생성 흐름을 익혀야 한다. 초기 CRUD·검색 요구에 비해 도입 요소가 늘어날 수 있다. |

Specification의 조건 조합은 Spring Data JPA가 제공하는 기능이다. 속성 참조의 타입 검사를 강화하려면 JPA 메타모델 생성도 가능하지만, 별도 생성 설정이 필요하다. Querydsl 역시 생성 도구를 사용하며, Spring Data 문서는 원 프로젝트의 유지보수 둔화와 OpenFeign 포크 지원 상태를 안내한다. 이는 도구 선택 시 확인할 사항이지 Querydsl이 사용 불가능하다는 의미는 아니다. [Specification](https://docs.spring.io/spring-data/jpa/reference/jpa/specifications.html), [Querydsl 통합](https://docs.spring.io/spring-data/jpa/reference/repositories/core-extensions.html)

SQL 중심 대안의 기능은 [MyBatis 동적 SQL](https://mybatis.org/mybatis-3/dynamic-sql.html), [Spring JDBC](https://docs.spring.io/spring-framework/reference/data-access/jdbc/core.html), [jOOQ 코드 생성](https://www.jooq.org/doc/latest/manual/getting-started/use-cases/jooq-as-a-sql-builder-with-code-generation/)을 기준으로 비교했다. JDBC와 jOOQ는 선택한 방식의 범위를 이해하기 위한 보완 대안이며 채택 대상은 아니다.

### 선택 근거

사용자는 기존 JPA 경험을 밝힌 뒤 JPA + Specification을 선택했다. 현재 동적 조회의 핵심은 선수·챔피언·포지션·승패 같은 선택 조건의 조합이다. 이를 위해 새 SQL 매퍼나 쿼리 생성 도구를 도입하기보다, 기존 JPA 안에서 필요한 조건을 조합하는 구성이 적절하다는 판단이다.

선택한 도구의 현재 책임 분담은 [시스템 구성](../../spec.md#구성과-책임)을 따른다. 아래에는 이 선택에서 감수한 비용을 남긴다.

### 받아들이는 비용과 보완 범위

JPA를 사용해도 N+1 조회, 불필요한 엔티티 로딩, 조인 후 중복 경기, 페이지 누락을 직접 점검해야 한다. Specification이 SQL 성능이나 트랜잭션 정확성을 자동으로 보장하지는 않는다. 특히 여러 참가자 조건이 같은 참가자에게 적용되는지 확인해야 한다.

PostgreSQL 전용 연산이나 복잡한 집계가 필요할 때 제한적 Native SQL을 검토할 수 있다는 제안은 남아 있다. 이것은 MyBatis·jOOQ 등을 함께 채택했다는 결정이 아니다. 실제 쿼리의 복잡성이나 성능 문제가 드러나면 해당 범위에서 보완한다.

## 6 빌드 도구와 설정 언어

**결정: Gradle + Groovy DSL(`build.gradle`). 주요 대안: Maven.**

| 선택지 | 사용했을 때의 장점 | 사용했을 때의 단점과 비용 |
| --- | --- | --- |
| Gradle | 사용자의 기존 경험을 활용한다. 작업 간 의존 관계와 별도 빌드 절차를 유연하게 구성할 수 있다. 증분 실행과 빌드 캐시로 반복 작업을 줄일 수 있다. | 자유도가 높아 빌드 스크립트가 복잡해지기 쉽다. 설정·실행 단계와 플러그인 호환성을 이해해야 한다. |
| Maven | 정해진 빌드 생명주기와 관례가 있어 다른 프로젝트의 흐름을 파악하기 쉽다. 일반적인 Java 프로젝트의 빌드 규칙을 일정하게 유지하기 좋다. | XML 설정이 길어질 수 있다. 특수한 작업 연결에는 플러그인 설정이나 추가 도구가 필요할 수 있다. 사용자에게는 기존 Gradle 경험을 바꾸는 비용이 생긴다. |

Maven은 표준 생명주기를 중심으로 동작하고, Gradle 빌드 캐시는 입력이 같은 작업의 결과 재사용을 지원한다. 캐시는 별도 활성화와 올바른 작업 설정이 필요하며, Gradle 선택만으로 모든 빌드가 더 빨라지는 것은 아니다. [Maven 빌드 생명주기](https://maven.apache.org/guides/introduction/introduction-to-the-lifecycle.html), [Gradle 빌드 캐시](https://docs.gradle.org/current/userguide/build_cache.html)

### 선택 근거

초기 비교에서는 두 도구에 똑같이 익숙하지 않다면 규칙이 정해진 Maven도 적합하다고 설명했다. 이후 사용자는 **기존에 Gradle을 사용해 왔으므로 `build.gradle`로 결정한다**고 이유를 명시했다. 실제 경험을 활용하는 이점이 도구의 일반적인 단순성 비교보다 중요하다는 결정이다.

Gradle을 고르는 것과 설정 언어를 고르는 것은 별개다. 이번에 지정한 `build.gradle`은 Groovy DSL이며, Kotlin DSL의 파일명은 `build.gradle.kts`다.

| 설정 언어 | 장점 | 단점과 선택 결과 |
| --- | --- | --- |
| **Groovy DSL** | 간결하고 유연하게 설정할 수 있다. 사용자가 선택한 `build.gradle` 형식이다. | 동적 참조의 일부 오류는 스크립트 평가 시 드러난다. 빌드 로직을 과하게 늘리지 않는 관리가 필요하다. |
| Kotlin DSL | 타입 검사와 IDE 자동 완성·리팩터링 지원이 강점이다. | DSL에 익숙해지는 비용이 있다. 이번 선택에 포함하지 않는다. Java 애플리케이션에도 사용할 수 있는 별도 대안이다. |

두 DSL의 타입 검사와 모델 접근 차이는 [Gradle Kotlin DSL 안내](https://docs.gradle.org/current/userguide/kotlin_dsl.html)에 설명돼 있다.

서버는 `apps/server/`의 Gradle 프로젝트로 관리한다. Wrapper로 실행 버전을 고정하고 Java toolchain과 서버 실행 환경을 Java 25로 맞춘다. Java 25에서 Gradle을 실행하는 지원은 9.1.0부터이며, Spring Boot 4.1이 지원하는 Gradle 9.x 범위에서 세부 버전을 정한다. Gradle의 정확한 버전은 아직 확정하지 않았다. [Gradle Java 호환성](https://docs.gradle.org/current/userguide/compatibility.html), [Spring Boot 요구사항](https://docs.spring.io/spring-boot/4.1/system-requirements.html)

## 7 Java 버전

**결정: Java 25. 주요 대안: Java 21.**

| 선택지 | 사용했을 때의 장점 | 사용했을 때의 단점과 비용 |
| --- | --- | --- |
| Java 21 | 2023년 출시된 LTS로 기존 도구·프로젝트와 맞추기 좋다. 가상 스레드 등 현대적인 서버 기능을 이미 제공한다. | 25보다 지원 일정이 먼저 끝나며, 이후 버전의 실행 환경 개선을 활용하지 못한다. 새 프로젝트가 이전 LTS에서 출발한다. |
| **Java 25** | 2025년 출시된 LTS로 장기 유지보수 여유가 더 크다. GC·컴파일러·실행 환경 개선을 활용할 수 있다. 기존 Java 개발 방식을 유지하면서 필요한 새 기능만 도입할 수 있다. | Gradle·IDE·라이브러리를 Java 25 지원 버전으로 맞춰야 한다. 구형 도구를 재사용할 때 추가 확인이 필요하다. 성능 개선의 실제 크기는 작업 특성에 따라 다르다. |

예를 들어 Eclipse Temurin의 현재 제공 계획은 Java 21이 최소 2029년 12월, Java 25가 최소 2031년 9월까지다. 이는 배포판별 일정의 예시이며 Temurin 채택을 확정한 것은 아니다. [Temurin 지원 일정](https://adoptium.net/support/)

가상 스레드는 Java 21에서 정식화됐고, Java 25에는 GC·컴파일러 개선 및 `ScopedValue` 정식화 등이 포함된다. 새 버전을 사용한다고 새 기능을 모두 도입할 필요는 없다. [Java 21 가상 스레드](https://openjdk.org/jeps/444), [JDK 25 개선 사항](https://inside.java/2025/10/20/jdk-25-performance-improvements/)

### 선택 근거

Java 25를 추천한 근거는 새 프로젝트라 기존 코드·구형 의존성과의 호환 부담이 작고, 더 긴 유지보수 여유를 확보하기 좋다는 점이다. 사용자는 이 추천 조합을 명시적으로 선택했다.

약 30명 규모의 서비스에서는 Java 21과 25의 성능 차이를 결정적 이유로 삼기 어렵다. 선택의 중심은 지원 기간과 새 프로젝트의 출발점이다. JDK 배포판과 Java 25의 정확한 업데이트 버전은 후속 환경 구성에서 정한다.

## 8 Spring Boot 버전

**결정: Spring Boot 4.1.x의 최신 정식 패치 버전. 대안: 4.0.x와 3.5.x.**

| 선택지 | 사용했을 때의 장점 | 사용했을 때의 단점과 이번 판단 |
| --- | --- | --- |
| **4.1.x** | Java 21·25와 호환되며 현재 유지보수되는 계열이다. 새 프로젝트를 현행 계열에서 시작할 수 있다. | 기존 Boot 3.x 예제와 설정의 차이를 익혀야 한다. 추가 라이브러리의 4.1 호환성을 확인해야 한다. |
| 4.0.x | Java 21·25와 호환된다. 특정 의존성이 4.0에 맞춰져 있다면 대안이 된다. | 신규 프로젝트에서 4.1보다 먼저 이전 계열을 택해야 할 요구가 현재 없다. |
| 3.5.x | 기존 Boot 3.x 코드와 라이브러리를 유지할 때 전환 부담을 줄인다. 최신 패치의 Java 호환 범위에는 25도 포함된다. | 공식 안내의 현재 적극 유지보수 계열은 4.1·4.0이다. 기존 코드가 없는 프로젝트를 3.5로 시작할 근거가 약하다. |

Java 호환 범위는 [Boot 4.1](https://docs.spring.io/spring-boot/4.1/system-requirements.html), [Boot 4.0](https://docs.spring.io/spring-boot/4.0/system-requirements.html), [Boot 3.5](https://docs.spring.io/spring-boot/3.5/system-requirements.html)의 공식 요구사항을 따른다. 현재 유지보수 계열은 [Spring Boot 공식 저장소 안내](https://github.com/spring-projects/spring-boot/wiki/)를 기준으로 한다. Boot 3.5의 Java 25 실행 호환성과, Gradle까지 포함한 전체 빌드 조합의 호환성은 별도로 확인해야 한다.

### 선택 근거와 받아들이는 변화

Java 25가 Boot 4.1만 요구하는 것은 아니다. 사용자는 Java와 Boot의 호환성·지원 상태를 함께 비교한 뒤 두 버전을 조합해 선택했다. 새 서비스에 기존 Boot 3.x 코드를 이전할 부담이 작다는 점이 4.1 선택을 뒷받침한다.

Boot 4에서는 JSON 처리의 기본 방향이 Jackson 3으로 바뀌는 등 기존 예제와 다른 부분이 있다. 이 차이는 Java 21을 선택하더라도 Boot 4를 쓰면 발생한다. JSON 처리·테스트 등 세부 도구 선택 때 반영한다. [Spring Boot 4 전환 안내](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide)

### 최신 패치의 적용 기준

서버 프로젝트를 만드는 T01에서 당시 최신 정식 4.1.x 릴리스를 확인하고, 정확한 버전을 `build.gradle`에 고정한다. `4.1.+`처럼 빌드마다 해석 결과가 바뀌는 동적 버전은 사용하지 않는다. Milestone·RC·SNAPSHOT은 이번 결정에 포함하지 않는다. 4.1.x 안의 패치 갱신은 변경 후 검증하며, 4.2 이상으로 계열을 바꾸는 선택은 별도 논의한다.

## 9 기존 운영 환경 합의

Docker와 Cloudflare Tunnel은 이번 서버 기술 비교 이전에 기획서에서 합의한 운영 조건이다. 아래 대안의 장단점은 기존 운영 선택을 이해하기 위한 보완 비교다.

| 영역과 기존 선택 | 선택을 뒷받침하는 장점 | 받아들이는 비용 | 대안의 장점과 단점 |
| --- | --- | --- | --- |
| 집 Windows 서버 | 기존 장비를 활용해 서버 임대 비용을 줄인다. | 집의 전원·인터넷·재부팅·절전 상태에 가용성이 영향을 받는다. | 외부 VPS는 집 장비와 가용성을 분리할 수 있지만 임대 비용과 별도 서버 관리가 필요하다. |
| Docker | 애플리케이션과 DB의 실행 환경을 정의하고 재현하기 좋다. 개발·운영 설치 절차의 차이를 줄인다. | 이미지·볼륨·컨테이너 네트워크와 Docker 실행 환경을 관리해야 한다. 호스트 장애와 DB 백업은 별도 과제다. | 호스트에 JDK·DB를 직접 설치하면 컨테이너 계층을 줄일 수 있지만 버전·서비스·설정 재현을 직접 관리해야 한다. |
| Cloudflare Tunnel | 서버가 외부로 연결을 만들어 서비스를 제공하므로 집 공유기의 인바운드 포트 개방 부담을 줄인다. | Cloudflare와 터널 프로세스에 의존한다. 터널이 끊기면 외부 접속에 영향을 준다. | 포트 포워딩과 리버스 프록시는 접속 경로를 직접 관리하지만 공인 접속 환경·인증서·방화벽·주소 변경 대응을 관리해야 한다. |

Docker의 실행 환경 패키징과 Tunnel의 아웃바운드 연결 방식은 각각 공식 문서에 설명돼 있다. 이 비교로 비용이나 가용성을 수치로 보장하지는 않는다. [Docker 개요](https://docs.docker.com/get-started/docker-overview/), [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)

## 10 LCU 검증 도구

**사용자 결정 (2026-10-21): Node.js 24. Windows PC는 나중에 실행 가능.**

당시 도구를 작게 배포하기 위해 Node 내장 기능과 별도 빌드 없는 구성을 선택했다. 서버 Java 선택이나 최종 Windows 수집기 기술을 바꾸는 결정은 아니었다. 구체적인 실행 방법은 [도구 정본](../../../tools/lcu-probe/README.md)을 따른다.

Mac의 가상 HTTPS 검사와 실제 Windows 실측을 구분하기로 했다. 이 결정 당시에는 Windows 실측이 남아 있었으며, 그 사실을 현재 미완료 상태로 해석하지 않는다. 실제 실행·관측은 [검증 기록](../../validation/lcu-report.md), 최신 진행 상태는 [상태 정본](../../status.md)에 연결한다.

## 11 아직 결정하지 않은 항목

| 항목 | 현재 상태 |
| --- | --- |
| JDK 배포판과 Java 25 업데이트 버전 | 별도 결정. Temurin 지원 일정은 비교 예시다. |
| PostgreSQL 메이저·패치 버전 | 별도 결정. 초기 계획의 PostgreSQL 17 제안을 확정으로 보지 않는다. |
| Gradle 정확한 버전 | Java 25 실행을 지원하는 9.1.0 이상의 9.x에서 선택한다. |
| DB 마이그레이션·서버 테스트 도구 | 별도 결정. JPA·Gradle 선택으로 자동 확정되지 않는다. |
| JSON 저장 타입·JPA 매핑 | 원본 보존 목적에 맞춰 별도 구체화한다. `jsonb`는 검토 대상이다. |
| 웹 | React/Vite + TypeScript는 기존 제안이다. |
| Windows 수집기와 로컬 저장 | Electron/TypeScript + SQLite/better-sqlite3는 기존 제안이다. |
| 클라이언트 프로젝트 관리·테스트 | pnpm workspace, Vitest, Playwright는 기존 제안이다. |
| API 계약 표현·클라이언트 타입 생성 | 별도 결정. Java 서버와 클라이언트가 동일 소스를 공유한다는 전제는 없다. |

기술 선택과 실제 구현은 구분한다. 제품 구현은 기존 [LCU 검증 계획](../plans/2026-10-21-lcu-validation-plan.md)의 Windows 실기 검증과 PASS 조건을 충족한 뒤 진행한다.
