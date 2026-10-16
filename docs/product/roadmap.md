# Roadmap — asv

Each brick is one chat session and one or more PRs. **No brick writes code without its validated
conception study** (see `CLAUDE.md`).

| Brick | Content | Conception study | Status |
|---|---|---|---|
| 1 | Complete conception dossier | this dossier | done (PR #3) |
| 1 bis | Legal check on official texts before any code: publisher status, LCEN (post-SREN numbering, retention decree), DSA duties, CNIL on accounts, e-mail blocks, cookies and AI triage, need for an impact assessment. Decisions updated where needed. | `security-and-rgpd.md` | planned |
| 2 | Tooling: Vite, Hono, Vitest, ESLint import rule, CodeQL, protocol types, SonarQube project and token for asv | `platform` | planned |
| 3 | Domain: entry, session, resume, pseudo rules | `entry` | planned |
| 4 | Domain: rooms and posting | `rooms` | planned |
| 5 | Accounts: e-mail code, device cookie, mailer port and provider choice | `accounts` | planned |
| 6 | Domain: private conversations and ignore, directory search | `private-conversations`, `directory` | planned |
| 7 | Node transport + web UI (retro design) end to end | `platform`, `web-ui` | planned |
| 8 | Moderation: reports, AI triage, strikes, expel, passkeys | `moderation` | planned |
| 9 | Cloudflare transport (Hub Durable Object), deploy to asvchat.fr, switch the repository to private | `platform` | planned |
| 10 | Legal pack: final terms, privacy notice, legal notice, professional review, public launch | `security-and-rgpd.md` | planned |

## V2 candidates (not designed yet)

- Reserved pseudos and aliases on accounts.
- Passkeys as an optional sign-in for members (ADR-0013).
- Room sharding if the single hub saturates (ADR-0007).
- Friends list.
- Teen space with real age verification, strict separation and AI scanning of conversations (ADR-0004,
  ADR-0010). Requires its own conception study and an impact assessment.
