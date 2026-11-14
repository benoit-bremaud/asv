# asv — project instructions

Retro web chat inspired by Caramail. Product and technical decisions live in the ADRs, indexed in
[docs/architecture/README.md](docs/architecture/README.md). Read them before changing anything.

## No conception, no code (owner rule, non-negotiable)

- Every line of code implements a validated UML conception study under `docs/architecture/`.
- If the study for a feature does not exist or is not validated by the owner, **no implementation
  code is written** for it. Write or complete the study first, get it validated, then code.
- A change that needs behaviour the study does not describe updates the study first, in the same PR
  or an earlier one.

## Status

Brick 8c: study merged (#225), 8c-1 AI triage of reports (`src/domain/triage.ts`, `src/server/triage/`, Mistral behind `ReportTriage`, BR-100 to BR-102); 8c-2 severe expel, authority alerts with `pnpm mod:filed`, room removal and decision e-mail (`src/domain/authority.ts`, `src/server/moderation-mail.ts`, BR-103 to BR-107). Brick 8b done: moderator passkeys on Node (`src/server/moderator-*.ts`, `/mod` routes, owner scripts `pnpm mod:invite` and `pnpm mod:revoke`, enrolment page), replacing the interim token (BR-093 to BR-099). Brick 8a: reports, moderator queue, expel, strikes and suspension. Brick 6: private conversations (members only, 3 windows), ignore both ways and directory search, with their web overlays. Brick 5: member accounts (e-mail code by Brevo, HttpOnly device cookie, encryption at rest in `src/server/crypto/`, account dialog). Brick 7a: Node WebSocket transport (`src/transports/node/`), transport-neutral hub (`src/server/hub.ts`) and retro web UI for entry and rooms (`src/web/`). Brick 4: pure domain for rooms and posting. Brick 3: entry, away, resume, leave and pseudo rules. Brick 2: tooling
(Vite, Hono, Vitest, ESLint dependency rule, protocol schemas, CodeQL, local SonarQube gate). Checks: `pnpm verify`, then `pnpm sonar` after push. Next: see roadmap; no tester exposure of moderation until the owner opens it once the impact assessment is signed (BR-108).

## Project invariants

- **QA test plan**: every PR that adds or changes a user journey updates `docs/architecture/qa/test-plan.md` in the
  same PR; `review-local` § 2c passes it to `qa-tester`, and an in-scope row with no evidence turns the QA step red.
- **Dependency rule**: `src/domain/` never imports Node, `ws`, Cloudflare, Hono or React.
  Transports build and wire the Hono app, the server never imports a transport.
- **Conception is the source of truth**: code follows `docs/architecture/`. When they diverge, fix
  the code or update the diagram in the same change.
- **Personal data**: only connection and contribution logs (one connection line per socket connection, one contribution line per message with connection id and protocols, plus content id, operation, date and time under a Prime Minister's injunction, never the content), reports, bans, member accounts (e-mail, strikes, device
  hashes), e-mail block hashes, the legal retention vault of closed accounts and its access entries (ADR-0014), moderator credentials and
  invitations, and away records (5 minutes max) are persisted. Gender, age and city are never
  persisted. Legal retention rules: `docs/architecture/security-and-rgpd.md` §1 (checked 2026-10-22).
- **AI never sanctions**: AI only triages reported content, a human moderator decides (ADR-0010).

## Where things live

- Product: `docs/product/` (vision, personas, journeys, roadmap with the brick ↔ study mapping).
- Requirements, business rules, glossary, security, tests, design: `docs/architecture/*.md`.
- Decisions: `docs/architecture/decisions/` (MADR, one per file).
- Diagrams: `docs/architecture/diagrams/<feature>/`, one folder per feature.
- Traceability: `docs/architecture/traceability-matrix.md`.
- Research notes: `docs/research/`.
- Logbook: `PROJECT_LOG.md`, updated after every merge.
- Last local review report: `docs/architecture/review-local.md`.
