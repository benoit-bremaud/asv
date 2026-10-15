# Project log — asv

Chronological operational logbook. Complements `git log`: decisions, context, what changed and why.

## 2026-10-15 — Project kick-off

- Idea: rebuild a Caramail-style chat (pseudo only, pink/blue, rooms, DMs between strangers).
  An earlier brainstorm (name remembered as "cos90") was lost; restarted from scratch.
- Caramail research gathered in `docs/research/caramail.md` (history, features, culture,
  what users hated, Wayback captures).
- Decisions (all via MCDA, see ADRs):
  - ADR-0001 name **asv**, domain **asvchat.fr** (not bought yet).
  - ADR-0002 stack: Vite React + Hono, pure domain, Node transport for dev/tests, Durable Objects in prod.
  - ADR-0003 flat single package.
  - ADR-0004 18+ only, self-declared.
  - ADR-0005 session pseudo in V1, accounts planned for V2.
  - ADR-0006 pink / blue / grey pseudos, gender optional.
- Brick 1 (branch `docs/bootstrap-conception`): repo skeleton, ADRs, six UML diagram types for
  `chat-core` (8 files), traceability matrix, Gitleaks CI. CodeQL deferred to brick 2 (no source
  code to analyse yet). Dependency review not available on a private repo with the Free plan.
- Local review (`docs/architecture/review-local.md`): 6 Must, 14 Should, 9 Nice. Main finding:
  one Durable Object per room and per DM pair was over-engineered. Owner chose a single Hub Durable
  Object (ADR-0007, 445/500). All Must and Should fixed before push. Remaining Nice items tracked
  as GitHub issues.
