# ADR-0020 — Cloudflare transport, staging and production behind Cloudflare Access

- Status: accepted, amends ADR-0011 (hibernation) and ADR-0007 (hibernation wording) and ends ADR-0018 once production runs; tracks issue #233
- Date: 2026-11-14
- Deciders: Benoît Bremaud

## Context

Brick 9 moves asv from the Node transport behind a tester tunnel (ADR-0018) to Cloudflare Workers with the
single Hub Durable Object of ADR-0007, on asvchat.fr. Facts checked on 2026-11-14 in the Cloudflare docs
(Context7, `cloudflare-docs`):

- A WebSocket accepted with the standard API (`server.accept()`) pins the Durable Object in memory: duration is
  billed while any socket is open. Workers Free includes 13,000 GB-s a day, the paid plan 400,000 GB-s a month;
  one object at 128 MB for a full day is about 11,060 GB-s.
- A code update disconnects sockets accepted with the standard API. Sockets accepted with the hibernation API
  (`ctx.acceptWebSocket`) stay connected across an update only if the object hibernates before the update's
  `max_delay`; a forced update disconnects them too, and the object's memory is reset either way, so its state
  must be rebuilt.
- `setWebSocketAutoResponse` exists only for sockets accepted with `ctx.acceptWebSocket`; with `server.accept()`
  the transport must answer `ping` itself.
- Workers Free allows 100,000 SQLite rows written a day, and two pinned objects (staging and production) bill about
  22,100 GB-s a day against 13,000 included. Free limits fail operations hard once exceeded.
- `src/domain/` and `src/server/` import nothing from Node: WebCrypto only (ADR-0017), Hono, Zod and
  SimpleWebAuthn run on Workers. Only `src/transports/node/` is Node specific.

## Options and MCDA

### D1 — Hub state and hibernation

Criteria: simplicity and risk 35, conformity to ADR-0011 15, resilience (hibernation and deploys) 20, cost 15,
parity with the Node transport and testability 15.

| Option | Simplicity | Conformity | Resilience | Cost | Parity | Total /500 |
|---|---|---|---|---|---|---|
| **B. No hibernation: the hub stays in memory, standard WebSockets, one alarm** | 5 | 2 | 2 | 4 | 5 | **380** |
| A. ADR-0011 as written: hibernation, rebuild from attachments and stored away records | 2 | 5 | 5 | 5 | 3 | 365 |
| C. Hibernation with a full state snapshot in SQLite after every command | 3 | 3 | 4 | 5 | 1 | 320 |

Sensitivity: with resilience 35 and simplicity 20, A gets 410 and B 335. C writes gender, age and city to disk
unless filtered, against the personal data invariant. Owner choice B on 2026-11-14 after a deeper analysis;
A stays the target once traffic or deploy frequency makes the reset costly (follow-up #235).

### D2 — Owner routes in production (invite, revoke, filed; BR-093)

Criteria: security 40, simplicity 30, cost 15, reuse of the brick 8b CLI 15.

| Option | Security | Simplicity | Cost | Reuse | Total /500 |
|---|---|---|---|---|---|
| **B. Cloudflare Access in front of `/owner/*`, plus the owner secret** | 5 | 3 | 5 | 4 | **425** |
| A. HTTPS and the owner secret only | 3 | 5 | 5 | 5 | 420 |

Sensitivity: simplicity 40 and security 30 give A 440, B 405. Owner choice B.

### D3 — Staging tier

Criteria: environments convention 30, isolation from production 25, simplicity 25, not public 20.

| Option | Convention | Isolation | Simplicity | Not public | Total /500 |
|---|---|---|---|---|---|
| **A. Wrangler environment `staging` on staging.asvchat.fr, own Durable Object and secrets, behind Access** | 5 | 5 | 3 | 5 | **450** |
| B. Staging on the `workers.dev` address | 3 | 5 | 4 | 2 | 355 |
| C. No staging before brick 10 | 0 | 0 | 5 | 5 | 225 |

Sensitivity: simplicity 50, convention 20, isolation 15, not public 15 give A 400, B 365, C 325. A holds.

### D4 — Production exposure until brick 10

Criteria: legal risk 40, tester access 20, simplicity 20, faithfulness to launch 20.

| Option | Legal | Testers | Simplicity | Faithful | Total /500 |
|---|---|---|---|---|---|
| **A. Production behind Cloudflare Access, allow-list of the owner and the testers** | 5 | 4 | 3 | 4 | **420** |
| B. Public address, given to the testers only | 2 | 5 | 5 | 5 | 380 |
| C. Public | 1 | 5 | 5 | 5 | 340 |

Sensitivity: simplicity 40 and legal risk 20 (testers and faithfulness 20 each) give B 440, C 420, A 380: A holds
only while legal risk weighs at least as much as simplicity. Owner choice A.

### D5 — Moderation on Cloudflare before the impact assessment is signed (BR-108)

Criteria: legal conformity 40, testing moderation on the real platform 30, simplicity 30.

| Option | Legal | Testing | Simplicity | Total /500 |
|---|---|---|---|---|
| **A. Staging with an owner-only allow-list, moderation on; production with testers, moderation off (`canReport` false, `/mod` routes 404 as BR-097) until the owner records the signed impact assessment** | 5 | 5 | 3 | **440** |
| B. Moderation off everywhere | 5 | 1 | 5 | 380 |
| C. Moderation on everywhere | 1 | 5 | 5 | 340 |

Sensitivity: simplicity 50, legal 30, testing 20 give B 420, A 400, C 380; with legal 50, testing 30, simplicity 20
A gets 460 and B 380. A holds while testing moderation on the real platform weighs at least as much as simplicity.
Owner choice A on 2026-11-14.

### D6 — Durable Object jurisdiction

Criteria: GDPR 50, latency 20, simplicity 15, reversibility 15.

| Option | GDPR | Latency | Simplicity | Reversibility | Total /500 |
|---|---|---|---|---|---|
| **A. `env.HUB.jurisdiction("eu")` before `idFromName("hub")`** | 5 | 5 | 4 | 2 | **440** |
| B. No jurisdiction | 3 | 5 | 5 | 2 | 355 |

Sensitivity: simplicity 40, GDPR 30, latency 15, reversibility 15 give A 415, B 395. A holds. The jurisdiction of an
object cannot change after the first deploy without a data migration, so it is set before the first deploy. Owner
choice A on 2026-11-14.

### D7 — Workers plan

Criteria: reliability 40, cost 25, headroom 20, simplicity 15.

| Option | Reliability | Cost | Headroom | Simplicity | Total /500 |
|---|---|---|---|---|---|
| **A. Workers Paid, $5 a month, with a spending limit** | 5 | 3 | 5 | 5 | **450** |
| B. Workers Free | 2 | 5 | 1 | 4 | 285 |

Sensitivity: cost 50, reliability 20, headroom 15, simplicity 15 give A 400, B 365. A holds. Free fails operations
hard past its limits (100,000 rows written a day; two pinned objects about 22,100 GB-s a day against 13,000).
Owner choice A on 2026-11-14; the owner already pays the Workers Paid plan, so only the spending limit is new.

### D8 — Owner routes behind Access

Criteria: security 35, change size 25, clarity 25, path-miss risk 15.

| Option | Security | Change size | Clarity | Path miss | Total /500 |
|---|---|---|---|---|---|
| **B. Rename the three owner routes to `/owner/*` on every transport, Access policy on `/owner/*` with a Service Auth policy** | 5 | 3 | 5 | 5 | **450** |
| A. Access on the three exact `/mod` paths | 4 | 5 | 3 | 3 | 385 |

The renames: `POST /mod/invitations` to `POST /owner/invitations`, `DELETE /mod/moderators/:name` to
`DELETE /owner/moderators/:name`, `POST /mod/authority-filings` to `POST /owner/authority-filings`
(`src/server/moderator-routes.ts`). Sensitivity: change size 50, security 15, clarity 20, path miss 15 give A 415,
B 400, so the choice holds while security, clarity and path-miss risk together outweigh change size (a tie needs
security near 0). Owner choice B on 2026-11-14.

## Decision

1. **Worker**: serves the built web client as static assets with `assets.run_worker_first: true`, so every
   response, assets included, gets the BR-086 headers and the BR-111 checks. It checks the Origin,
   `CF-Connecting-IP` and the `Cf-Access-Jwt-Assertion` (the site application's audience, and the `/owner` application's audience on `/owner/*`, defence in
   depth), then forwards every non-asset request, WebSocket upgrades included, to the single Hub Durable Object
   (`idFromName("hub")`). The Hono app (`createApp`, `addModeratorRoutes`) runs inside the Hub object, so the
   grant key and used nonces (BR-095), the challenge windows (BR-096) and the stats live next to the hub. Only
   the hub touches storage (ADR-0011 point 5 kept).
2. **Hub Durable Object without hibernation (D1 B), in the EU jurisdiction (D6 A)**: it builds the
   transport-neutral hub once in its constructor, inside `blockConcurrencyWhile` before any socket, runs the
   schema migration and closes every open `connection_lines` row at its start time (as BR-084 does on Node), then
   accepts sockets with `server.accept()`. The hub stays in memory while sockets are open; a deploy or a runtime
   restart closes every socket and the clients come back to the entry screen, members signing back in through
   their device cookie (BR-109). With `server.accept()` the auto-response API is unavailable, so the transport
   answers `ping` itself, as on Node (BR-088), and the heartbeat sweep (every 15 seconds as on Node, silence limit
   60 seconds from ADR-0011 point 3) uses the object's own last-frame time per socket. The Durable Object code update strategy is `immediate`, set in
   `wrangler.jsonc`.
3. **Timers and one alarm**: while at least one socket is open (from the first accepted socket to the last
   close), the same timers as the Node transport run the hub `tick` and the heartbeat sweep; store purges leave the one-second tick and run in the alarm. One alarm, re-armed
   each time at the earliest of the next due retry (every 10 minutes while an authority alert, a decision e-mail
   or a statement of reasons is pending: BR-076, BR-104, BR-107) and the next daily purge, runs even when no
   socket is open; a failed daily purge is retried at the next alarm, at least 10 minutes later (BR-110).
4. **Stores in the Durable Object's SQLite**: one table set per port (`ConnectionLogStore`, `AccountStore`,
   `LegalVaultStore`, `ModerationStore`, `ModeratorStore`), with the same ciphertext and keyed hashes as the
   Node stores (ADR-0017, BR-083), plus an encrypted `pending_statements` table so a deploy never drops a
   pending statement of reasons. Away records stay in memory (lost with the hub). The tunnel exceptions of BR-084
   end: the connection log and the vault are encrypted in SQLite. On Node, pending statements of reasons are
   still in memory only: a known gap, follow-up #234.
5. **Client IP and flags (#38)**: on Cloudflare the client IP is always `CF-Connecting-IP`; production runs with
   `secureCookie`; the Worker refuses requests (503) when a required secret is missing, a key fails to parse or
   the owner secret is shorter than 32 characters (BR-111). Moderation follows D5 (BR-108). Per-IP quotas and
   key bans group IPv6 by /64 (BR-112).
6. **Socket caps (#23)**: the Worker checks Origin and `CF-Connecting-IP`; the Hub applies BR-089 unchanged and
   counts its own sockets, so the counts are exact.
7. **Environments (D3 A, D4 A)**: Wrangler environments `staging` (staging.asvchat.fr) and `production`
   (asvchat.fr), each with its own Durable Object namespace and secrets, both behind Cloudflare Access until
   brick 10 opens production. Each sets `workers_dev: false` and `preview_urls: false`, so Access cannot be
   bypassed through another address. The staging allow-list is the owner only; the production allow-list is the
   owner and the testers (BR-113).
8. **Moderation (D5 A)**: staging runs with moderation on for the owner; production runs with moderation off
   until the owner records the signed impact assessment, then turns it on (BR-108, `platform/10`).
9. **Owner routes (D8 B)**: the three owner routes are renamed to `/owner/invitations`,
   `/owner/moderators/:name` and `/owner/authority-filings` on every transport (BR-093, BR-104). On Cloudflare
   `/owner/*` has its own Access policy with a Service Auth policy; the owner CLI targets `ASV_OWNER_URL`
   (default `http://127.0.0.1:<port>` on Node) and sends `CF-Access-Client-Id` and `CF-Access-Client-Secret` from
   `ASV_ACCESS_CLIENT_ID` and `ASV_ACCESS_CLIENT_SECRET` (both or neither) when set. The service token is named and has an expiry.
10. **Secrets** (Wrangler secrets per environment, never in the repo): `ASV_DATA_KEYS`, `ASV_HMAC_KEY`,
    `ASV_VAULT_PUBLIC_KEY`, `ASV_OWNER_SECRET`, `BREVO_API_KEY`, `ASV_MISTRAL_API_KEY` and the legal identity
    fields `ASV_OWNER_NAME`, `ASV_OWNER_ADDRESS`, `ASV_OWNER_PHONE`, `ASV_CONTACT_EMAIL`, `ASV_BREVO_LOCATION`.
    Non-secret variables in `wrangler.jsonc`: `ASV_ALLOWED_ORIGINS`, `ASV_PUBLIC_ORIGIN`, `ASV_MAIL_FROM`,
    `ASV_TRIAGE_MODEL`, `ASV_ACCESS_AUD_SITE`, `ASV_ACCESS_AUD_OWNER`, `ASV_ACCESS_TEAM_DOMAIN`
    (`<team>.cloudflareaccess.com`: issuer and JWKS host of the Access tokens, BR-113) and `ASV_MODERATION`
    (`on` in staging, `off` in production until the impact assessment is signed: D5, BR-108; any other value
    is refused with 503, BR-111). Without the Mistral key the no-AI adapter runs (ADR-0019). Each token gets a descriptive
    name and an expiry at creation. On Cloudflare the device-token hash key is derived from `ASV_HMAC_KEY`
    (HMAC with the label `asv-device-token-v1` preceded by a NUL byte, which no keyed hash input contains), so a device cookie still signs its member back in after a
    deploy (BR-109); the Worker uses the `nodejs_compat` flag for it.
11. **Deploy procedure** (`platform/10`): green gate on `main`, deploy to staging, QA pass on staging (JRN-43 to
    JRN-45), signed release tag `vX.Y.Z`, deploy to production from the tag at a quiet hour; a rollback is allowed
    only when no schema change landed since the target version (migrations are additive only). Every real
    deploy, DNS change, Access policy and secret creation needs the owner's explicit yes.
12. **Repository visibility**: once production runs, the repository switches to private under ADR-0005 of the
    owner's global rules (repository visibility), category "a history that cannot be published": the
    code of a live moderated service (moderation, abuse limits, authority channel) and its impact assessment
    material; the owner decided on 2026-10-16 that asv goes private at its first production deploy. The
    repository itself holds no personal data (legal identity fields are secrets). Consequence: on a private
    Free repository the GitHub ruleset (25651804, `sonarqube` required) no longer applies and the gate becomes
    agent-side only. The derogation is recorded in `PROJECT_LOG.md`.

## Consequences

- Every deploy disconnects everyone: deploys go out at a quiet hour, and staging catches regressions first.
- The Durable Object duration is billed continuously while someone is connected; the paid plan (D7) covers two
  pinned objects, with a spending limit.
- ADR-0011 points 1, 2 and 6 (rebuild after hibernation) are suspended, see its amendment of 2026-11-14; ADR-0007's
  hibernation wording carries a matching amendment.
- ADR-0018 ends when production runs; the local log file is kept for its legal year.
- Cloudflare becomes a processor of stored data (Durable Object storage, EU jurisdiction): a data processing
  agreement check joins the one-time setup, and the privacy documents change (`security-and-rgpd.md` §2,
  `legal-pages-draft.md`).
