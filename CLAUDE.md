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

Conception phase. No application code yet.

## Project invariants

- **Dependency rule**: `src/domain/` never imports Node, `ws`, Cloudflare, Hono or React.
  Transports build and wire the Hono app, the server never imports a transport.
- **Conception is the source of truth**: code follows `docs/architecture/`. When they diverge, fix
  the code or update the diagram in the same change.
- **Personal data**: only connection and content logs (content lines only under a Prime Minister's injunction, never the content), reports, bans, member accounts (e-mail, strikes, device
  hashes), e-mail block hashes, the legal retention vault of closed accounts (ADR-0014), moderator credentials and
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
