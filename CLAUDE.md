# asv — project instructions

Retro web chat inspired by Caramail. Product and technical decisions live in the ADRs, indexed in
[docs/architecture/README.md](docs/architecture/README.md). Read them before changing anything.

## Status

Conception phase (UML-first). No application code yet. Implementation starts only once the diagrams
in `docs/architecture/diagrams/chat-core/` are validated by the owner.

## Project invariants

- **Dependency rule**: `src/domain/` never imports Node, `ws`, Cloudflare, Hono or React.
  Transports build and wire the Hono app, the server never imports a transport.
- **Conception is the source of truth**: code follows `docs/architecture/`. When they diverge, fix
  the code or update the diagram in the same change.
- **Personal data**: only connection logs, reports and bans are persisted. Gender is never persisted.
  Legal retention rules are unverified, see ADR-0005.

## Where things live

- Decisions: `docs/architecture/decisions/` (MADR, one per file).
- Diagrams: `docs/architecture/diagrams/<feature>/`.
- Research notes: `docs/research/`.
- Logbook: `PROJECT_LOG.md`, updated after every merge.
- Last local review: `docs/architecture/review-local.md`.
