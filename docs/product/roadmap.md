# Roadmap — asv

Each brick is one chat session and one or more PRs. **No brick writes code without its validated
conception study** (see `CLAUDE.md`).

| Brick | Content | Conception study | Status |
|---|---|---|---|
| 1 | Complete conception dossier | this dossier | in progress |
| 2 | Tooling: Vite, Hono, Vitest, ESLint import rule, CodeQL, protocol types | `platform` | planned |
| 3 | Domain: entry, session, resume, pseudo rules | `entry` | planned |
| 4 | Domain: rooms and posting | `rooms` | planned |
| 5 | Domain: private conversations and ignore, directory search | `private-conversations`, `directory` | planned |
| 6 | Node transport + web UI (retro design) end to end | `platform`, `web-ui` | planned |
| 7 | Moderation: reports, AI triage, expel, passkeys | `moderation` | planned |
| 8 | Cloudflare transport (Hub Durable Object), deploy to asvchat.fr | `platform` | planned |
| 9 | Legal pack: terms, privacy notice, legal check, public launch | `security-and-rgpd.md` | planned |

## V2 candidates (not designed yet)

- Accounts with reserved pseudos and aliases (ADR-0005).
- Teen space with real age verification, strict separation and AI scanning of conversations (ADR-0004,
  ADR-0010). Requires its own conception study and an impact assessment.
- Room sharding if the single hub saturates (ADR-0007).
- Friends list.
