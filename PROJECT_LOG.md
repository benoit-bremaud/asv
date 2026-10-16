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
  as GitHub issues #1 and #2.
- Owner rule added to `CLAUDE.md`: no validated UML study, no code.
- Brick 1 extended to a complete conception dossier:
  - product: vision, personas, journeys, roadmap (bricks 1–9 mapped to studies);
  - requirements matrix (18 functional, 12 non-functional), business rules BR-001 to BR-062, glossary;
  - arc42 overview with C4 context and containers, security and GDPR (STRIDE, data inventory,
    legal points unverified), test strategy, design pack (contrast-checked colour tokens, wireframes);
  - ADR-0008 passkeys for moderators (430/500), ADR-0009 five-minute away grace (385/500);
  - `chat-core` split into seven feature studies: entry, rooms, private-conversations, directory,
    moderation, web-ui, platform. Traceability matrix rebuilt (UC1 to UC16).
  - Issue #1 (Reconnecting state) is resolved by ADR-0009 and the entry/web-ui state diagrams.
- Owner debrief on two ideas:
  - AI moderator: ADR-0010, AI only triages reported content, humans decide (395/500). Scanning all
    private messages rejected for V1 (GDPR impact assessment, secrecy of correspondence).
  - Opening to teens: ADR-0004 revisited, 18+ in V1, teen space as V2 candidate with real age checks
    (390/500). Yubo case study recorded.
- Second local review on the full dossier: 11 Must, 22 Should, 11 Nice. Main gaps were the Cloudflare
  hub plumbing (hibernation, RPC, grants). New ADR-0011 (away records without gender/age/city, 415/500),
  hub state aggregate diagram, protocol payload table, contrast-checked away colours. All Must and
  Should fixed. 30 diagram files render, no broken link, Gitleaks clean.

## 2026-10-16 — Accounts, strikes and legal-first roadmap

- Owner wants French-law compliance first and firm handling of repeat offenders (3 warnings, then
  account removal, same e-mail blocked a week). Caramail required an e-mail account to chat.
- DSA arts. 17, 19 and 23 read on EUR-Lex: statements of reasons are due only when the e-mail is known;
  micro companies are exempt from the art. 23 misuse policy, followed anyway.
- ADR-0012 (380/500 with the owner's weights): rooms stay account-free, private messages need a verified
  e-mail account, strikes expire after 90 days, the third proposes a 7-day suspension confirmed by a
  moderator, severe cases deleted at once.
- ADR-0013 (435/500): members sign in with a six-digit e-mail code, device remembered 30 days. The owner
  refused any face or photo; clarified that passkeys never send biometrics, wording fixed everywhere.
- New `accounts` study (UC17 to UC19), `moderation/02d`, BR-070 to BR-080, F-020 to F-024.
- Roadmap: new brick 1 bis, legal check on official texts before any code; bricks renumbered to 10.
- Third local review: 12 Must, 18 Should, all fixed. 36 diagram files render, no broken link, Gitleaks clean.
- PR #3 opened for brick 1. Repository switched to **public** (owner rule for 02_personal projects:
  public until the first production deploy, then private). Public Release Checklist passed: Gitleaks on
  the full history clean, no secret ever created, Gitleaks in CI. Switch back to private in brick 9
  (first Cloudflare production deploy).
