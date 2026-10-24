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
- Third local review: 12 Must, 18 Should, all fixed. 36 Markdown files with diagrams render, no broken link, Gitleaks clean.
- PR #3 opened for brick 1. Repository switched to **public** (owner rule for 02_personal projects:
  public until the first production deploy, then private). Public Release Checklist passed: Gitleaks on
  the full history clean, no secret ever created, Gitleaks in CI. Switch back to private in brick 9
  (first Cloudflare production deploy).
- Pre-merge gate on PR #3 (new owner rule: five local steps before every merge). Codex out of quota and
  Copilot unavailable, so only local tools. Fourth review pass: 13 Must, 16 Should fixed, including
  recomputed MCDA totals in eight ADRs (no winner changed). Gate: tests and coverage N/A (no code),
  secrets clean on full history, QA screenshots in `docs/architecture/qa/`, SonarQube not run (no asv
  project or token yet).
- SonarQube step: owner exception for this documentation-only PR (390/500); asv onboarding on SonarQube moved to brick 2.

## 2026-10-22 — Brick 1 bis: legal check on official texts

- Local folder briefly renamed `asvchat`, then back to `asv` (owner): the folder keeps the repository name.
- Official texts read in their versions in force on 2026-10-22: LCEN arts. 1-1 and 6 (renumbered by law
  2026-813), decree 2021-1362, CPCE art. L34-1, injunction decree 2026-920, law 2026-813 and Conseil
  constitutionnel 2026-911 DC, DSA arts. 11 to 18, GDPR arts. 8, 22 and 35, Loi Informatique et Libertés
  arts. 45 and 82, CNIL deliberations 2018-327 and 2020-091 (Légifrance copies, the CNIL site was down).
- Main finding: as a hosting provider, asv must keep a closed account's e-mail 5 years and its identifier
  1 year (decree 2021-1362 arts. 2 and 3). ADR-0012 deleted them. Owner first chose a legal vault holding
  pseudonyms too (355/500), then, after the review-local gate, option D: e-mail and dates 5 years, account
  id 1 year, session pseudonyms only in the connection log (ADR-0014, 385/500). Owner-only read for an
  authority entitled by law, each read logged. New BR-081, BR-082; BR-060 now lists the connection lines
  and the content lines written under injunction.
- review-local gate: 6 Must and 13 Should fixed across ADRs 0004/0005/0007/0010/0011/0012, diagrams,
  glossary, test strategy and requirements. SonarQube waived by the owner (docs only, project created in
  brick 2).
- Confirmed without change: under-15 ban struck down (ADR-0004 stands), consent age 15, authentication
  cookie exempt from consent (ADR-0013), AI triage with human decision meets GDPR art. 22 (ADR-0010).
- New duties placed on the roadmap: data protection impact assessment and authority reporting channel in
  brick 8; legal notice choice (LCEN art. 1-1 II), false-report warning and professional review of the
  decree scope in brick 10.
- No binding text sets the 2-year inactivity, the 6-month severe block or report and ban retentions: they
  stay owner decisions under GDPR storage limitation.
- `.scannerwork/` removed from the index and ignored.

## 2026-10-22 — PR #6 review cycle (brick 1 bis)

- Codex (3 findings) and a local architecture review on the fixes (Codex quota reached).
- Decree 2021-1362 arts. 5 and 6 re-read on Légifrance. Outside an injunction, hosts keep the connection
  identifier and protocols for each content creation (art. 5 2°). Content id, operation, date and time
  are kept only under a Prime Minister's injunction (art. 6 2°). BR-060 now writes one contribution line
  per message on that basis.
- One connection line per socket connection: a resume opens a new line with the new IP. The connection
  id lives in the socket attachment, so it survives hibernation. New `ConnectionLogStore` port, write
  before delivery, orphan lines closed on wake-up.
- Vault access entries: kept 5 years (owner decision pending), modelled as `AccessEntry`, purged daily.

## 2026-10-22 — PR #6 merged (brick 1 bis)

- Squash-merged as `3385022` on `main`: legal check on official texts, ADR-0014 legal vault.
- Logged here, in the brick #5 PR, because `main` takes no direct commits.

## 2026-10-22 — Brick #5: repository compliance

- Labels: `type:*` / `area:*` / `prio:*` triptych adopted, unused default labels deleted, issues #2,
  #5, #7 and #8 relabelled.
- GitHub settings: secret scanning, push protection, Dependabot alerts and security updates, private
  vulnerability reporting enabled.
- CI: `dependabot.yml` (GitHub Actions, weekly), `dependency-review` on pull requests (no package manifest yet: it only sees workflow actions), OSSF
  `scorecard` weekly and on `main`. CodeQL and SonarQube stay in brick 2.
- Governance: pull request template, `CONTRIBUTING.md`, `SECURITY.md`.
- `main` ruleset (created after this PR merges): pull request required, `gitleaks` check green, no
  force-push or deletion, Copilot code review requested automatically (fixes the HTTP 422 on manual
  requests). Rulesets need a public repo on the Free plan: re-check when asv goes private.

## 2026-10-22 — PR #9 merged (brick #5)

- Squash-merged as `72c4c5e`; issue #5 closed. Ruleset `Protect main` created before the merge to test
  the Copilot rule; it is active (PR squash-only, `gitleaks` required, no force-push or deletion).
- Copilot code review never triggered, neither by the REST request nor by the ruleset rule. The last
  Copilot review on the owner's account dates from 2026-09-29: account quota or licence, not the repo.
  `CONTRIBUTING.md` now says so. SonarQube waived by the owner (docs and config only).

## 2026-10-23 — Brick 2: tooling (PR #12 merged)

- Squash-merged as `0b95707`; issue #11 closed. `platform` study completed and validated first:
  ADR-0015 (Zod Mini for protocol validation, 455/500, Valibot runner-up), ADR-0016 (SonarQube scanned
  on the owner's machine, gate posted as commit status `sonarqube`, 465/500; a self-hosted runner on a
  public repo was rejected, owner wants checks to run locally), `platform/08-ci-pipeline.md`.
- Scaffold: pnpm, TypeScript 6 strict (typescript-eslint does not support TS 7 yet), Vite React shell,
  Hono `createApp()`, Zod Mini schemas for every protocol message, Vitest (node + jsdom, 80 % thresholds).
- Dependency rule enforced by ESLint `no-restricted-imports`: `src/domain` imports only its own relative
  modules; `src/server` never imports a transport; `src/shared/protocol` imports only `zod/mini`.
  Proven by lint fixtures.
- CI: `verify` and `codeql` workflows, Dependabot npm. Ruleset `Protect main` now requires `gitleaks`,
  `verify`, `codeql` and `sonarqube`: run `pnpm sonar` after every push, or the PR stays blocked.
  SonarQube waiver ended.
- Local review: 3 Must, 9 Should fixed. Codex review: 4 P2 fixed (CodeQL `contents: read`, domain
  catch-all rule, BR-013 resume buffer, Node engines). Follow-up #13 (frame and field caps, brick 7).

## 2026-10-23 — Brick 3: domain entry, session, resume, pseudo rules (PR #16 merged)

- Squash-merged as `69cd2ea`; issue #15 closed. Study completed and validated first:
  `entry/07-class-domain-api.md`. Owner choices (MCDA): `Random.token()` returns the resume token and its
  hash, the domain never hashes (475/500, Web Crypto digest is async); terms and city failures map to
  `error invalid` with client-side validation (470/500); pseudos accept French accented letters, uniqueness
  and reserved words compare on an accent-folded key (470/500). BR-001, BR-002, BR-007 reworded.
- `src/domain/pseudo.ts`, `src/domain/entry.ts`: `enter`, `socketLost`, `resume`, `leave`, `expireAway`,
  `bufferPrivate`, `pruneEntryAttempts`, pure `(state, command, now, random) → { state, effects }`.
  Sessions are `ConnectedSession | AwaySession`; the away variant is exactly the ADR-0011 away record.
- Tests: one Vitest group per BR, 91 tests, 100 % coverage. Domain tests may import `vitest` only (lint fixture).
- Local review: 1 Must (resume profile unchecked) and 9 Should fixed. Codex P1 fixed (away session held
  profile and IP). Accepted V1 limit: reserved words with separators (`a.d.m.i.n`) pass.
- SonarQube note: the `SONAR_TOKEN` exported by the shell gave 401; the scan works with
  `~/.config/sonarqube/analysis-token`.

## 2026-10-23 — Brick 4: domain rooms and posting (PR #19 merged)

- Squash-merged as `d55a5d1`; issue #18 closed. Study completed and validated first:
  `rooms/07-class-domain-api.md`. Owner choices (MCDA): membership on the session, so the away session stays
  the ADR-0011 record (450/500); user room refs `{ id, name, ownerId }` carried by members for the rebuild, no
  new persisted data (465); flood counts accepted messages only (440); smileys left to `web-ui` (485);
  official rooms injected from `src/server/official-rooms.ts` (450); `hub.ts` facade so closing a session
  leaves its rooms, exported by `index.ts` in place of the entry `leave`/`expireAway` (455); room name
  character set (435).
- From the local review (0 Must, 15 Should fixed): new BR-024, 10 rooms per session (435), against room churn
  growing the attachment; room names need a letter or digit and are unique ignoring spaces and punctuation
  (420). `restoreHubState` checks the rules again on refs from many sockets. BR-021, BR-023, BR-030 reworded.
- Codex P2 fixed: a rebuilt owner claim counts only from a member. 160 tests, 100 % coverage, SonarQube passed
  (one S7780 fixed with `String.raw`).
- Follow-up in the study: protocol `member` needs optional profile fields for away members (brick 7a).
- Roadmap reordered (owner, 410/500): vertical slices, brick 7a (Node transport + retro UI for entry and rooms)
  next, then 5, 6, 8, 9, 10, each with its UI; priorities added.

## 2026-10-23 — Brick 7a: Node transport, hub and retro web UI (PR #22 merged)

- Squash-merged as `e9fc394`; issues #13 (caps) and #21 (away member shape) closed. Studies validated first:
  `platform/04c` (server hub), `web-ui/04` (client state) and the entry resume sequence.
- `src/server/hub.ts`: transport-neutral hub with a serial queue; contributions are logged before anything is
  kept (BR-060); every failed log write goes to `onLogError`. `src/transports/node/`: `ws` with `noServer`,
  64 KiB frames, Origin check, heartbeat sweep at a quarter of the silence limit. `src/web/`: React 19 reducer
  and context, connection manager outside React with backoff and resume from sessionStorage (ADR-0011).
- Protocol refinements: `memberJoined` and `memberBack` carry `{ roomId, member }`; `resumed` carries `sessionId`
  and `pseudo`; `member` is a union on `away` (#21).
- Local review: 4 Must, 8 Should and 7 Nice; owner option B (420/500) fixed every Must and 7 Should, the rest
  filed. SonarQube failed on the first scan (14 issues) and passed after the fixes. QA in the built-in
  browser (Claude in Chrome was blocked by another extension); screenshots in `docs/architecture/qa/`.
- Codex: eight review rounds; each finding got an MCDA and an inline reply, no thread resolved. Fixed: resume
  identity, saved-session validation, composer cap, resume takeover of a socket not swept yet (the displaced
  socket is closed, `memberAway` on a failed takeover), offline leave, drafts per room and kept when not sent,
  resume errors, one entry at a time, city cap in code points. Owner rule for the loop (420/500): one last
  round, then new reconnection edge cases go to #24.
- 378 tests, 99.87 % lines. Follow-ups #23 to #30 on Project #69.
- Owner product decisions recorded in #28: earned trust (room creation and photos unlocked by behaviour
  tiers, credit falls only by human decision), zero tolerance on photos, 3 warnings mean a ban; member sign-in
  stays on the ADR-0013 e-mail code with Brevo (415/500 vs password 300), to amend in brick 5.

## 2026-10-23 — Brick 5: member accounts (PR #33 merged)

- Squash-merged as `b933085`; issues #32 and #8 closed. Studies validated first (`1a0e4fe`): Brevo mailer,
  encryption at rest (ADR-0017), account UI (`web-ui/06`).
- E-mail code sign-in (BR-070–073), HttpOnly `asv_device` cookie redeemed through `POST /account/device`,
  sign-out on this device or everywhere, deletion with the legal vault written first (BR-081).
  `src/server/crypto/`: AES-GCM field cipher with versioned keys, HMAC keyed hash, ECDH vault seal.
- Local review: 4 Must and 6 Should fixed. Owner decision (A, 435/500): at most 20 wrong codes per e-mail
  per 24 h (BR-072 amended). SonarQube failed on the first scan (44 issues), passed after the fixes.
  QA replayed on the final SHA; screenshots in `docs/architecture/qa/`.
- Codex hit its usage limit; owner chose an adversarial Opus review instead (B, 400/500): no Must or Should,
  3 Nice filed. Merge was first blocked because the `sonarqube` status sat on the previous SHA: `pnpm sonar`
  must run on the head commit, even a docs-only one.
- 510 tests, 98.6 % statements. Follow-ups #34 to #44 on Project #69. Next: brick 6.

## 2026-10-24 — Brick 6: private conversations, ignore and directory (PR #51 merged)

- Squash-merged as `b7089f2`; issue #46 closed. Studies first (`e786191`): domain API, window state, web
  overlays, `closePrivate`. Members only (BR-040), ignore both ways (BR-041/042, cap 100), search by pseudo
  or city (UC7), non-modal private windows with minimise and an unread counter.
- Owner decisions: past the target's window cap, a new conversation is refused with `targetBusy`, checked
  before the ignore test so it reveals no block (C, 370/500). The window cap is 3 instead of 10 (B, 405/500);
  raising it through trust tiers belongs to #28.
- Local review: no Must; the Should items were fixed. SonarQube failed on the first scan (7 issues:
  cognitive complexity, nested ternary, `role="dialog"`), passed after the fixes.
- New owner rule: every QA pass reads the inspector (console, network, WebSocket frames, storage) and runs
  the security probes S1–S10; every finding is filed. 7 fully green. S7 is partial: the room flood is
  throttled, but directory search, added by this brick, is not (#49). #48 (no secure headers, P1) and #50
  (cookie without `Secure`, P1) predate the brick. The rule went into the global QA skill (claude-skills #52, which
  absorbed #69).
- Codex: the first round raised 4 P2 findings, fixed (`hasAccount` refreshed on link and unlink, ignore list
  restored on resume, private history hidden after an ignore, a window kept open when `closePrivate` cannot
  be sent). The last round raised 2 edge cases, filed as #52.
- GitHub Actions blocked on claude-skills (billing): owner rule to rely on the local CI only (`pnpm verify`,
  gitleaks, `pnpm audit`, `pnpm sonar`) until it is fixed.
- 595 tests, 98.55 % statements. Follow-ups #48 to #50 and #52 on Project #69. Next: let two real testers
  try the site (exposure MCDA and legal checks first), then brick 8.

