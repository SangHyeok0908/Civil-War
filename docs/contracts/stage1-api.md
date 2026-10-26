# Stage 1 HTTP/JSON contract — v1 provisional

Applies to `apps/server`, stage 1 T01–T04. Stage 0 remains **HOLD**; the observed LCU adapter is provisional, not a claim of Windows verification. [Candidate mapping](../validation/lcu-candidate-contract.md) is the raw-path authority. [JSON Schema](stage1.schema.json) defines request/response models. Server validation remains authoritative.

## Encoding and errors

- UTF-8 JSON; timestamps are UTC ISO 8601. All IDs are opaque strings. `gameId` is 1–30 decimal digits and `matchKey = platformId + ':' + gameId`.
- The server accepts raw integer game-ID tokens losslessly. A JavaScript collector must preserve them before ordinary `JSON.parse` can round them; send the string. Floating-point game-ID tokens are rejected. Raw extra fields are preserved privately; envelope unknown properties, duplicate keys, coercions, and trailing JSON are rejected.
- `schemaVersion` is integer **1**, not `"1"` or `1.1`. Unsupported adapters/observed game tuples return `UNSUPPORTED_SCHEMA`. v1 decoders remain available when a new schema is introduced.
- Maximum request body: 1,048,576 bytes for writes, including chunked bodies without Content-Length. Responses to private endpoints use `Cache-Control: no-store`.
- Error shape: `{"code":"INVALID_MATCH","message":"INVALID_MATCH","retryable":false,"details":[{"path":"participants.0.visionScore","code":"REQUIRED"}]}`. Messages are stable codes, not reflected raw values. Clients localize them. Missing fields are `REQUIRED`, null/wrong types `INVALID_TYPE`, invalid ranges `OUT_OF_RANGE`.

| HTTP | Codes / handling |
| --- | --- |
| 400 | `INVALID_REQUEST`, `INVALID_FILTER`, `INVALID_CURSOR`; correct the request |
| 401 | `AUTH_REVOKED`; invalid/expired/consumed/revoked code, token, or session; re-enroll |
| 403 | `ACCOUNT_MISMATCH`, `FORBIDDEN`, `ORIGIN_REJECTED`, `CSRF_REJECTED`; do not auto-retry |
| 404 | `NOT_FOUND`; public pending/canceled keys are deliberately indistinguishable from missing keys |
| 409 | `MATCH_CANCELED`, `INVALID_STATE`, `CONFLICT`; stop retrying canceled registration |
| 413 | `BODY_TOO_LARGE`; correct payload |
| 422 | `INVALID_MATCH`, `UNREGISTERED_PARTICIPANT`, `UNSUPPORTED_SCHEMA`, `INVALID_MEMBER`, `INVALID_SCOPE`; needs attention |
| 429 | `RATE_LIMITED`, `retryable:true`, `Retry-After: 600`; respect delay |
| 500 | `INTERNAL_ERROR`, `retryable:true`; retry the preserved request after backoff |

Network/5xx retries use the same saved submission and participant identity; they never infer registration from a successful ingest. `clientSubmissionId` is a nonblank opaque string of at most 100 characters used to identify a client attempt; the authoritative idempotency key is the platform/game tuple. A retry's roles cannot replace the first committed roles.

## Authentication

No Riot password or LCU token is sent to the server. LCU account discovery is not server authentication. Codes and device/session tokens have 32 random bytes, base64url without padding (43 characters); the DB stores only SHA-256 hashes. Scope and code consumption are transactional. Admin code TTL 30 minutes; collector code TTL 24 hours. Admin sessions expire after 7 inactive days or 30 absolute days. Collector credentials persist until revoked.

| Method/path | Request | Response |
| --- | --- | --- |
| `POST /api/admin/session` | `{code}` and exact `Origin` | 200 `{sessionId,csrfToken}` and admin cookie |
| `GET /api/admin/session` | admin cookie | 200 `{sessionId,csrfToken}`; restores CSRF after reload |
| `POST /api/admin/logout` | admin cookie + Origin + CSRF | 204, cookie cleared and DB session revoked |
| `POST /api/collector/enroll` | `{code,currentPuuid}` | 200 `{token,memberId,credentialId,puuid}` |
| `POST /api/admin/codes` | `{scope:"admin"}` or `{scope:"collector",memberId}` | 200 `{id,code,scope,expiresAt}`; plaintext shown once |
| `DELETE /api/admin/codes/:id` | admin auth | 204, code revoked |
| `GET /api/admin/sessions` | admin cookie | `[{id,revoked,createdAt,lastSeenAt}]` |
| `DELETE /api/admin/sessions/:id` | admin auth | 204 |
| `GET /api/admin/collector-credentials` | admin cookie | `[{id,memberId,revoked,createdAt}]` |
| `DELETE /api/admin/collector-credentials/:id` | admin auth | 204 |

Admin auth for writes is the cookie, exact configured `Origin`, and `X-CSRF-Token`; no collector token grants admin access. Cookie is `__Host-cw-admin` with Secure/HttpOnly/SameSite=Strict/Path=/ and no Domain. Explicit dev/test HTTP mode uses `cw-admin-dev` without Secure. There is no permissive CORS. Read-only session recovery is cookie authenticated and same-origin browser policy prevents another origin from reading it.

Collector requests use `Authorization: Bearer <token>`. `memberId`, `credentialId`, and `puuid` in the principal come from that token, never a supplied actor object. Enrollment compares `currentPuuid` to the code owner's immutable LCU PUUID; mismatch does not consume the code. The collector must keep the token out of renderer code and bind saved work to the original member/credential.

Code-entry failures share a bounded in-process limiter per direct remote IP: five failures in ten minutes, then 429; a successful exchange resets the bucket. Forwarded headers are not trusted. A trusted Cloudflare proxy/IP configuration must be established in stage 4; current default may group clients behind a proxy. The limiter resets on server restart, while all credential/code/session state is durable.

## Members

Role is one of `TOP`, `JUNGLE`, `MIDDLE`, `BOTTOM`, `UTILITY`.

Authenticated member representation:

```json
{"id":"opaque-member-id","puuid":"private-lcu-puuid","riotId":"Name#KR1","displayName":"Name","active":true,"primaryRole":"TOP","secondaryRole":"JUNGLE","allowedRoles":["JUNGLE","TOP"],"seedSkill":50,"profileRevision":1}
```

| Method/path | Behavior |
| --- | --- |
| `GET /api/admin/members` / `GET /api/collector/members` | array of authenticated member representations |
| `GET /api/admin/members/:id` | one authenticated member |
| `POST /api/admin/members` | requires `puuid`, `riotId`, `displayName`, `seedSkill`; optional active/roles; returns created member, 200 |
| `PATCH /api/admin/members/:id` | partial displayName/riotId/active/primaryRole/secondaryRole/allowedRoles/seedSkill; returns member |
| `GET /api/members` | array of `{id,displayName,active,primaryRole,secondaryRole,allowedRoles}`; no PUUID, Riot ID, seed, or auth |

`seedSkill` must be integer 0–100 and is never inferred from rank. Role fields can be null; primary/secondary must differ and belong to allowedRoles. If allowedRoles is omitted at creation it is derived from non-null primary/secondary; no roles means an empty list requiring owner attention for team recommendations. PATCH preserves omitted fields and rejects PUUID/ID changes. Names never change the stable member ID. Deactivation preserves all historical links; later team recommendation excludes inactive members. Name-only changes increment profileRevision, not sourceRevision; actual role/active/seed changes also schedule recalculation. No-op patches schedule nothing.

## Normalized match

```json
{"schemaVersion":1,"platformId":"KR","gameId":"9000000000000000000001","startedAtUtc":"2000-01-01T00:00:00Z","durationSeconds":1942,"mapId":11,"gameType":"CUSTOM_GAME","patch":"16.20.824.8524","participants":["ten ParticipantRecord objects"]}
```

The timestamp and game ID above are explicitly synthetic fixture values. ParticipantRecord has:

```json
{"puuid":"private-lcu-puuid","teamId":100,"win":false,"championId":14,"kills":4,"deaths":4,"assists":12,"championDamage":26173,"damageTaken":44760,"laneCs":176,"neutralCs":6,"goldEarned":12000,"visionScore":20,"objectiveDamage":8263,"turretDamage":7933,"items":[1,2,3,4,5,0,3364]}
```

The participant example illustrates shape; it is not an assertion about an actual player's values. The exact candidate statistics are in fixture files. All statistic/item values are nonnegative safe integers; zero item ID means empty slot, while a missing slot is invalid. There must be ten distinct joined participant IDs/PUUIDs, exactly five players per team 100/200, one winning team, and participant/team win agreement. Required stats are never filled with zero. Objective/turret values remain separate, without an assumed inequality or additive relationship. No role is inferred as final from LCU lane/timeline hints.

## Collector match workflow

1. `POST /api/collector/matches/ingest` with `{rawMatch:<raw JSON object>,clientSubmissionId:"saved-attempt",schemaVersion:1}`.
2. Response 200: `{matchKey,state,disposition}`. States: `pending|registered|canceled`. Dispositions: `created_pending|already_pending|already_registered|already_canceled`.
3. The collector displays the pending record and asks the participant to confirm that this is an inhouse match and assign all ten actual roles.
4. `POST /api/collector/matches/:key/confirm` with `{rolesByPuuid:{"private-puuid":"TOP",...},clientSubmissionId:"saved-confirmation"}`. `matchKey` is the URL key, not a body field. Each team's five roles must be distinct.
5. Response 200 `{matchKey,disposition:"created"|"already_registered",sourceRevision}`. Revision is the original registration's committed revision for a repeat confirmation, even after later mutations.

An ingest never confirms or increments source revision. All ten identities must already be members. Existing records retain the original raw/normalized values, participants, roles and state; valid retry bodies cannot alter them. Incoming raw data is still validated, and authorization is checked against the stored participants. Canceled ingest returns `already_canceled`; canceled confirmation returns 409. Any authenticated stored participant may confirm, even if another participant ingested. Nonparticipants cannot read or confirm.

- `GET /api/collector/matches?state=pending` returns an array of the caller's matching records, latest first. Supported states pending/registered/canceled; default pending.
- `GET /api/collector/matches/:key` returns `{matchKey,state,match:<NormalizedMatch>,confirmedRoles:null|{puuid:Role}}`.
- Collector and owner private queues currently return the complete state-filtered list, intended for the small friend group. Public lists are paginated.

Raw and normalized JSON, ten participant rows, audit, state transitions, revision changes, and jobs commit transactionally. A lost response is retried with the same saved request; first confirmation wins. A global service-state row lock serializes mutations at this scale; database uniqueness also enforces platform/game identity.

## Public records and owner corrections

`GET /api/matches` and `GET /api/members/:id/matches` return `{items:[PublicMatch],nextCursor:null|string}`. Query parameters: `memberId` (first route), positive integer `championId`, `role`, boolean `win`, `cursor`, `limit` (default 20, range 1–100). All participant filters must match **one participant row**. Specification uses a correlated EXISTS, so several qualifying players never duplicate a match. Order is descending `(startedAtUtc,matchKey)`; opaque base64url cursor uses that pair and avoids offset drift. Equal timestamps have a stable string-key tie break. Continue with the same filters. Newer inserts do not push already-read entries into later pages.

`GET /api/matches/:key` returns a PublicMatch, or 404 for missing/pending/canceled. PublicMatch is:

```json
{"matchKey":"KR:9000000000000000000001","startedAtUtc":"2000-01-01T00:00:00Z","durationSeconds":1942,"mapId":11,"patch":"16.20.824.8524","participants":["ten public participant objects"],"evaluationStatus":"recalculating","scoringVersion":null,"sourceRevision":1}
```

Public participants have all ParticipantRecord statistics/items, plus `memberId`, `displayName`, and confirmed `role`; they **omit puuid**. There is no raw JSON, credentials, or authentication data in public DTOs. Stage 1 does not publish scores; T08–T09 consumes the pending jobs and adds versioned evaluation.

| Admin route | Behavior |
| --- | --- |
| `GET /api/admin/matches?state=pending` | private array of CollectorMatch; any of three states |
| `GET /api/admin/matches/:key` | `{record:<CollectorMatch>,rawMatch:<raw object>,audit:[{id,action,actorId,createdAt,details}]}` |
| `PATCH /api/admin/matches/:key/roles` | body `{rolesByPuuid}`; registered only, ten roles validated; response `{matchKey,state,sourceRevision}` |
| `POST /api/admin/matches/:key/cancel` | registered→canceled, idempotent on canceled; response `{matchKey,state,sourceRevision}` |

Real role changes audit before/after roles keyed by stable member ID. No-op role updates and repeated cancellation create no revision/job. Pending cancellation is 409/INVALID_STATE. Canceled data stays available internally and disappears from public queries. There are no raw-stat editing or restore endpoints. Member preference changes never rewrite historical confirmed roles.

## Stage 3 integration points

- `service_state(id=1,source_revision,desired_scoring_version,active_generation_id)` is the mutation revision authority.
- `recalculation_jobs(id,source_revision UNIQUE,status,created_at)` contains durable pending work. No in-memory-only queue.
- `MutationCoordinator.lock/changed/audit` participates in the caller's transaction. Mutations take this lock first; no-op operations skip `changed`.
- `MatchRepository` is JpaRepository + JpaSpecificationExecutor. Registered-only access is explicit; `MatchViews.normalized` decodes preserved v1 JSON; participant rows link stable member IDs and confirmed roles.
- Members retain allowed roles, seedSkill, profileRevision; the next migration can add scoring versions/generations/reference samples. No scoring algorithm or solo-reference data silently enters stage 1 statistics.
