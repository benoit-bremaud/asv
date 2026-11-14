# ADR-0020 — Cloudflare transport, staging and production behind Cloudflare Access

- Status: accepted, amends ADR-0011 (hibernation) and ends ADR-0018 once production runs; tracks issue #233
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
  (`ctx.acceptWebSocket`) stay connected, but the object's memory is reset, so its state must be rebuilt.
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
A stays the target once traffic or deploy frequency makes the reset costly (follow-up issue).

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

### D4 — Production exposure until brick 10

Criteria: legal risk 40, tester access 20, simplicity 20, faithfulness to launch 20.

| Option | Legal | Testers | Simplicity | Faithful | Total /500 |
|---|---|---|---|---|---|
| **A. Production behind Cloudflare Access, allow-list of the owner and the testers** | 5 | 4 | 3 | 4 | **420** |
| B. Public address, given to the testers only | 2 | 5 | 5 | 5 | 380 |
| C. Public | 1 | 5 | 5 | 5 | 340 |

## Decision

1. **Worker**: the Hono app (`src/server/app.ts`) and the built web client as static assets. It checks the
   Origin and the upgrade limits, then forwards each WebSocket upgrade and every hub call to the single Hub
   Durable Object (`idFromName("hub")`). Only the hub touches storage (ADR-0011 point 5 kept).
2. **Hub Durable Object without hibernation (D1 B)**: it builds the transport-neutral hub once in its
   constructor and accepts sockets with `server.accept()`. The hub stays in memory while sockets are open; a
   deploy or a runtime restart closes every socket and the clients come back to the entry screen, members
   signing back in through their device cookie (BR-109). The heartbeat stays as in ADR-0011 point 3.
3. **Timers and one alarm**: while the object is in memory, the same timers as the Node transport run the hub
   `tick` and the heartbeat sweep; one alarm, re-armed each time, runs the daily purge and retries even when no
   socket is open (BR-110).
4. **Stores in the Durable Object's SQLite**: one table set per port (`ConnectionLogStore`, `AccountStore`,
   `LegalVaultStore`, `ModerationStore`, `ModeratorStore`), with the same ciphertext and keyed hashes as the
   Node stores (ADR-0017, BR-083). Away records stay in memory (lost with the hub, as with the Node transport).
   The tunnel exceptions of BR-084 end: the connection log and the vault are encrypted in SQLite.
5. **Client IP and flags (#38)**: on Cloudflare the client IP is always `CF-Connecting-IP`; production runs with
   `secureCookie`, reporting and moderation on, and the transport refuses to start if a required secret is
   missing (BR-111). Per-IP quotas group IPv6 by /64 (BR-112).
6. **Socket caps (#23)**: BR-089 applies unchanged; the Hub object counts its own sockets, so the counts are
   exact across Workers.
7. **Environments (D3 A, D4 A)**: Wrangler environments `staging` (staging.asvchat.fr) and `production`
   (asvchat.fr), each with its own Durable Object namespace and secrets; both behind Cloudflare Access until
   brick 10 opens production. `/owner/*` sits behind its own Access policy, owner only, plus the owner secret
   (D2 B, BR-113).
8. **Secrets** (Wrangler secrets per environment, never in the repo): `ASV_DATA_KEYS`, `ASV_HMAC_KEY`,
   `ASV_VAULT_PUBLIC_KEY`, `ASV_OWNER_SECRET`, `BREVO_API_KEY`, `ASV_MISTRAL_API_KEY`. Non-secret variables in
   `wrangler.jsonc`: `ASV_PUBLIC_ORIGIN`, `ASV_MAIL_FROM`, `ASV_TRIAGE_MODEL`, legal identity fields. Each token
   gets a descriptive name and an expiry at creation.
9. **Deploy procedure** (`platform/10`): green gate on `main`, deploy to staging, smoke check, deploy to
   production at a quiet hour; every real deploy, DNS change, Access policy and secret creation needs the
   owner's explicit yes.
10. **Repository visibility**: once production runs, the repository switches to private; the derogation
    (production chat with moderation, legal vault and DPIA material) is recorded in `PROJECT_LOG.md`.

## Consequences

- Every deploy disconnects everyone: deploys go out at a quiet hour, and staging catches regressions first.
- The Durable Object duration is billed continuously while someone is connected; within the free allowance for
  one object.
- ADR-0011 points 1, 2 and 6 (rebuild after hibernation) are suspended, see its amendment of 2026-11-14.
- ADR-0018 ends when production runs; the local log file is kept for its legal year.
