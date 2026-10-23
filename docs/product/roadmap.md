# Roadmap — asv

Each brick is one chat session and one or more PRs. **No brick writes code without its validated
conception study** (see `CLAUDE.md`).

Remaining bricks are vertical slices (owner decision 2026-10-23, MCDA 410/500 over "brick 7 whole first"
405 and the original order 315): brick 7a wires the Node transport and the retro web UI for entry and rooms,
then each later brick ships its domain, transport and UI overlay together, so every brick gets a QA pass in
the browser. Brick 7 became 7a: its UI for accounts, private conversations and moderation moves into
bricks 5, 6 and 8. Done bricks keep their numbers; remaining rows are in delivery order, which ranks bricks
of the same priority.

| Brick | Content | Conception study | Priority | Status |
|---|---|---|---|---|
| 1 | Complete conception dossier | this dossier | — | done (PR #3) |
| 1 bis | Legal check on official texts before any code: publisher status, LCEN (post-SREN numbering, retention decree), DSA duties, CNIL on accounts, e-mail blocks, cookies and AI triage, need for an impact assessment. Decisions updated where needed. | `security-and-rgpd.md` | — | done (2026-10-22, ADR-0014) |
| 2 | Tooling: Vite, Hono, Vitest, ESLint import rule, CodeQL, protocol types, SonarQube project and token for asv | `platform` | — | done (PR #12) |
| 3 | Domain: entry, session, resume, pseudo rules | `entry` | — | done (PR #16) |
| 4 | Domain: rooms and posting | `rooms` | — | done (PR #19) |
| 7a | Node transport + retro web UI end to end for entry and rooms; frame and field caps (#13); optional profile fields for away members in the protocol | `platform`, `web-ui` | P1 | done (PR #22) |
| 5 | Accounts: e-mail code, device cookie, mailer port and provider choice, encryption at rest (#8), account UI | `accounts`, `platform`, `web-ui` | P1 | next |
| 6 | Private conversations and ignore, directory search, with their UI overlays | `private-conversations`, `directory`, `web-ui` | P1 | planned |
| 8 | Moderation: reports, AI triage, strikes, expel, passkeys, moderator panel, data protection impact assessment, authority reporting channel | `moderation`, `platform`, `web-ui` | P1 | planned |
| 9 | Cloudflare transport (Hub Durable Object), deploy to asvchat.fr, switch the repository to private | `platform` | P1 | planned |
| 10 | Legal pack: final terms, privacy notice, legal notice, professional review, public launch | `security-and-rgpd.md` | P2 | planned |

Brick 7a follow-ups: #23 socket caps (brick 9), #24 connect timeout and reconnect edge cases, #25 hub refactor, #26 web lint boundary and test cleanups, #27 pixel smileys, #28 trust credit and earned privileges (sign-in stays on the ADR-0013 e-mail code, Brevo, 415/500), #29 restore input refused by the server, #30 resume token lost in flight (BR-014).

Open issues outside a brick: #7 Progressive Web App study (P2), #2 citations in the Caramail research note (P3).

## V2 candidates (not designed yet)

- Reserved pseudos and aliases on accounts.
- Passkeys as an optional sign-in for members (ADR-0013).
- Room sharding if the single hub saturates (ADR-0007).
- Friends list.
- Teen space with real age verification, strict separation and AI scanning of conversations (ADR-0004,
  ADR-0010). Requires its own conception study and an impact assessment.
