# Stage 3 HTTP/JSON contract — provisional

This extends [the stage 1 authentication, member and collector contract](stage1-api.md). Ingest/confirmation `schemaVersion:1`, idempotency, role validation, identity and cookie/CSRF boundaries remain unchanged. [stage3.schema.json](stage3.schema.json) is the current schema; stage1.schema.json is a historical stage 1 snapshot and deliberately describes its then-unimplemented evaluation state.

All `/api/*` responses use `Cache-Control: no-store`. Public DTOs exclude PUUID, raw JSON, credentials and seed skills. Names join current profiles at read time, so name-only changes need no score recalculation.

| Route | Current response / behavior |
| --- | --- |
| `GET /api/matches[/:key]`, `GET /api/members/:id/matches` | Existing records and pagination, plus `generationId:null|string`, `scores:GameScore[]`, `evaluationStatus:ready|recalculating`; score list empty and scoringVersion null while unavailable. Records remain readable with HTTP 200. |
| `GET /api/rankings` | `{status:'ready',generationId,sourceRevision,scoringVersion,members:[{displayName,stats:MemberStats}]}` |
| `GET /api/members/:id/stats` | `{member:PublicMember,stats:MemberStats,generationId,sourceRevision,scoringVersion}`; unknown member 404 |
| `POST /api/teams/recommend` | `{memberIds:string[10]}` → `{candidates:[{teamA:[{memberId,role}],teamB:[{memberId,role}],skillDifference}],reason:null|string,sourceRevision}` |
| `GET /api/scoring-versions/:id` | Complete immutable rules used by a public score; unknown version 404 |
| `GET /api/assets` | Pinned Data Dragon 16.20.1 catalog with Korean champion/item names and image filenames; records do not depend on image success |
| `GET /api/admin/scoring-versions` | All immutable rule versions, oldest first |
| `POST /api/admin/scoring-versions` | Full `ScoringRuleSet`; new unique ID, role weights sum to 100, no negative weight, win ≤5, each metric pair sums to 1; changes desired version, revision and durable job atomically |
| `GET /api/admin/recalculation/jobs` | Latest 100 jobs: revision, status, desired version at claim, attempts, timestamps, sanitized errorCode |
| `POST /api/admin/recalculation/retry` | Requeues failed latest job, records audit; older failures remain historical |
| `GET /api/admin/codes` | Latest 100 safe code metadata rows, no code plaintext or hashes |
| `GET /api/admin/audit` | Latest 100 private audit entries |
| `GET /api/admin/matches/:key` | Existing `record,rawMatch,audit` plus `rawJson` canonical stored text for lossless readonly display; JSON number parsers can round `rawMatch`, so the UI uses rawJson |
| `POST /api/admin/member-references` | `{memberId,officialPuuid,confirmedMapping:true,samples:RoleReferenceSample[]}` → suggestion only; never changes preferences, revision or match statistics |
| `GET /api/admin/members/:id/role-suggestion` | `{primary:Role|null,secondary:Role|null,sampleCount,sources,reason}` from newest 20 known-role samples across imported solo420 and registered inhouse |

Rankings, member stats and team recommendation return **202** with the usual error envelope and `code:'RECALCULATING'` until a complete current generation exists. Every mutation that affects calculations clears the active pointer in its transaction. A read uses a repeatable-read transaction and accepts only a generation whose revision and scoring version equal its service-state snapshot. A transaction already in flight retains its coherent earlier snapshot; subsequent reads observe the committed invalidation.

`GameScore` has matchKey, memberId, role, scoringVersion, unrounded score, competition rank and all seven normalized category values in breakdown. Raw precision is retained for aggregation; display and ranking keys both use `Math.round(value*100)/100`. `MemberStats` includes games/wins/losses/winRate, total kills/deaths/assists, finite kda or null, perfect boolean, adjustedScore/rank nullable, status (`unrated`, `provisional`, `ranked`), and byRole/byChampion count and KDA aggregates. No-game scores and ranks are null; 1–2 games are provisional; 3+ games are ranked. Equal displayed scores use competition ranks.

The algorithm identifier remains `objective-provisional-v1`. All normalization constants, metric mixes and role weights are persisted for every immutable version. This supported implementation fixes normalization constants and cumulativePrior at the approved v1 values; owners may change weights and metric mixes, while a different algorithm/normalizer requires a separately implemented version. TOP uses turret damage and other roles use objective damage alone. C07 remains HOLD.

The worker owns PostgreSQL advisory lock `731954801` for one complete claim→snapshot→calculate→publish cycle. Snapshot input uses `REPEATABLE READ`; computation runs outside its transaction. The final transaction locks service state and verifies revision, desired version, running status and the exact claim attempt before storing all gameScores/memberStats/roleSkills together and replacing the active pointer. Recovery increments the attempt, fencing older work and failure reports. Interrupted running jobs recover after lock acquisition; failed jobs recover at web process restart or explicit retry. Non-web `admin:code` processes do not start the scheduler or recover jobs.

Team recommendations enumerate exactly 126 roster partitions with the first sorted ID fixed to team A, enumerate only playable role assignments, keep one best assignment per roster, and order by balance, preference cost, then stable role-ordered IDs. At most three candidates within best difference +5 are returned. Hall subset shortages explain overlapping role impossibility. Duplicate, unknown or inactive inputs return 422 `INVALID_TEAM_MEMBERS`; cache keys include revision, generation ID and sorted member IDs. Public calls allow 60 requests per direct remote IP per ten minutes, then 429 with Retry-After 600; this bounded in-process limiter resets on restart and forwarded headers are not trusted.

Reference imports require the LCU member PUUID in `sample.puuid` and the separately confirmed official PUUID in `sample.evidence.officialPuuid`. Evidence contains queueId 420, known teamPosition (or null role to ignore), integer durationSeconds ≥300, and earlyEnded false. Mapping changes/conflicts are rejected, repeated game imports are coalesced, unknown roles do not enter suggestions, and supplied inhouse samples are rejected: inhouse observations come only from registered database matches. Current stage 2 adapter emits the same additional evidence fields; live collector export still returns OFFICIAL_API_UNAVAILABLE. An import never proves identity by comparing the two kinds of PUUID. Applying a suggestion requires an explicit normal member PATCH after operator review.

Static web routes are served by the same Spring JAR. SPA fallback is limited to the enumerated public/admin page routes and never handles `/api`. CSP allows images only from self and `https://ddragon.leagueoflegends.com`; unknown assets and image errors retain numeric IDs.
