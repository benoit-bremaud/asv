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


## 2026-10-24 — Real-tester exposure: study (PR #55 merged) and code (issue #54)

- Owner chose option A, a Cloudflare Tunnel to the local Node transport (MCDA 410/500, against staging 350
  and bringing brick 9 forward 310). Issue #54 holds the plan and the 6-question feedback form.
- Study, PR #55 (`ef84e1a`): ADR-0018 and BR-084 to BR-086, with the diagrams, matrix, test strategy, GDPR
  inventory and the provisional legal texts. The local review flagged five Must items, all fixed: plaintext log
  exception to BR-083, a vault that survives restarts, owner as both editor and host, a GDPR art. 13 table, and
  one `secureCookie` option. Codex then raised a P1 (vault depended on a graceful stop) and a P2
  (contribution row), both fixed.
- Code, PR #56 (`0d230cd`, closes #48 and #50): JSONL connection log and sealed vault files, crash-safe. The vault opening record is written before
  the account is saved, start-up closes what a crash left open, purges rewrite through a temp file and a
  rename, and unreadable lines are kept. Also:
  - client IP from `CF-Connecting-IP` only in tunnel mode on loopback;
  - the server refuses to start without the ADR-0017 keys or an https tunnel origin;
  - Hono `secureHeaders` with a strict CSP; `Secure` and HSTS via `secureCookie`;
  - the built bundle served by Node (`pnpm tester`);
  - three legal pages and the notice before the e-mail code, with the owner identity from env vars;
  - runbook `docs/product/tester-runbook.md`.
- QA in tunnel mode on the build (desktop and mobile): CSP and headers present, WebSocket entry works, no console
  errors, log file 0600. The legal table overflowed on mobile; it now stacks as labelled blocks.
- Codex on #56 (two rounds, 5 findings, all fixed): tunnel mode now also refuses to start without both legal
  files, with one file shared by both, or without a Brevo key (no dev mail). A line cut by a crash gets its newline
  at start-up. Only a folder the stores create is set to 0700.
- Not done yet: the vault key tool (#35, openssl commands in the runbook meanwhile); checking the Brevo and
  Cloudflare DPAs; the tunnel session itself.

## 2026-10-24 — Tester exposure live on asvchat.fr (#54)

- Domain `asvchat.fr` bought and on Cloudflare; named tunnel `asv-tester` replaces trycloudflare (stable origin).
- Brevo domain authenticated (DKIM, DMARC), sender `contact@asvchat.fr`; Cloudflare Email Routing to the owner.
- End-to-end QA through the tunnel, validated by the owner: security headers (CSP, HSTS, nosniff), legal pages
  with the identity from env, guest entry, member code e-mail received and redeemed, log and vault files 0600,
  e-mail sealed in the vault.
- Found: #60 (no hint when ENTRER is disabled, stale « Mauvais code. » banner). #58, #59, #60 on the kanban.
- Runbook updated to the named tunnel. Next: tester session, then feedback synthesis on #54.

## 2026-11-02 — Code step kept across a resume and a reload (#72, PR #75)

- Bug from the owner on a phone: reading the sign-in code in the mail app suspended the tab, the resume reset the
  account panel, and the member could not sign in from a phone.
- Conception first: BR-087, ADR-0011 amendment (owner choice 440/500: keep the code deadline, a number only, in
  `sessionStorage`; then 470/500: an in-memory resume keeps the panel as the chatter left it), `web-ui/06`.
- Review and mobile QA found a dead code step after 5 wrong tries or « nouveau code » (fixed: the deadline is
  dropped on warnings that end the code), a stuck « valider » after a drop, and no focus on the code field.
- SonarQube first failed on new code (complexity of `handle()`, `autoFocus`); fixed. The required `sonarqube`
  status must be published on the head SHA, so re-run `pnpm sonar` after the last commit before merging.
- Codex quota reached: no Codex review on #75; Copilot commented with no finding. Squash-merged as a8c2cf0.
- Follow-up: #74, project QA test plan and coverage matrix (owner choice 445/500), next chat.

## 2026-11-02 — Project test plan and QA coverage matrix (#74, PR #77)

- `docs/architecture/qa/test-plan.md`: 12 risks, 12 test families, 12 `JRN-` journeys traced to UC and BR, and a
  coverage matrix (case × level × last evidence: report, screenshot, head SHA) back-filled from the three QA
  reports; cases never run are marked `not covered` (3-window cap, sign out everywhere, account deletion, code IP
  quota, tunnel `Secure` cookie and client IP, Firefox / WebKit, axe, screen reader, performance, real phone).
- Rule in the plan, `test-strategy.md` and `CLAUDE.md`: a PR that adds or changes a journey updates the plan in the
  same PR; `review-local` § 2c passes it to `qa-tester`; an in-scope row with no evidence turns the QA step red.
- Review caught evidence cited on the re-check SHA (09f44e7) for checks run only on e774c8c; fixed. First QA smoke
  run against the plan on f9970ba: green, SEC-01 still #69.
- No Codex review (quota), no Copilot review (request did not stick). Squash-merged as a0d6848.
- Open: coverage gaps listed in the plan, not filed until the owner approves. Next: #65 (private windows cover the
  room input).

## 2026-11-02 — Dead GitHub workflows removed (#79, PR #80)

- Wave 0 bis of benoit-bremaud/agents-skills#259 (local-first CI). `gitleaks.yml` removed; gitleaks now runs on a
  lefthook pre-push hook (`prepare: lefthook install`). Kept: `ci.yml`, CodeQL, dependency-review, Scorecard (public).
- Owner MCDA 2026-11-02: option A (hook first, then remove the workflow), 435/500.
- Ruleset "Protect main": `gitleaks` dropped from the required checks (now verify, codeql, sonarqube).
- Adversarial review: CI diagram and security doc updated, hook shared across worktrees documented. Copilot: no
  issues; Codex: quota. Squash-merged as 820ccab. Visibility: public, no derogation (ADR-0005).

## 2026-11-02 — Private windows no longer cover the room input (#65, PR #86)

- Study first each time (`web-ui/04` Room screen, `web-ui/07` "Never cover the composer", design pack). Owner MCDA:
  C 480/500 (reserve the dock height), then B 430/500 after the design review showed C only cleared the composer
  once scrolled to the bottom: on desktops ≥ 768 × 720 px the room screen fits the viewport, lines and members
  scroll in their panels, the dock stays fixed and the page reserves `--dock-height`. Phones and short desktops keep
  the page flow with the dock after the screen.
- QA found two regressions of B, filed and fixed in the same PR (owner 450/500): #83 (24 px lines on short
  desktops) and #84 (overlays under the dock, now z-index 16); #85 part 1 too (own post scrolls to the bottom).
  Local code review (Codex quota out) found one P3, fixed: lines stay at the bottom when their panel shrinks
  (`ResizeObserver`, owner 440/500).
- Evidence: `docs/architecture/qa/2026-11-02-65-private-dock.md`, three product runs (last 5669e7d: 13/13 at 7
  viewports, scrollY 0 included), security part SEC-02…10 pass, SEC-01 still #69. 642 tests, coverage 98.63 %,
  Sonar passed. No Codex or Copilot review. Squash-merged as 9e0c5bd.
- Open: #85 part 2 (pseudo menu clipped in the members panel). Next: #64 and #63 (other P1 a11y Musts).

## 2026-11-03 — Full security audit (#88)

- Owner MCDA on the scope: A, static review + tooling + dynamic pass on the local tier only (430/500); no probe
  on asvchat.fr. Run at `aaf4f91` by three agents in parallel (code review on Opus, tooling, qa-tester `full`).
- Tooling: gitleaks (full history), Semgrep, Trivy, SonarQube issues and hotspots all clean; `pnpm audit` and
  osv-scanner found one dev-only advisory (minimatch via eslint).
- No Must. Should: per-socket frame limit (#89), per-IP WebSocket cap (#90), control and bidi characters in
  messages (#91). Nice: #92–#100, plus existing #69 (Permissions-Policy) and #62 (favicon). Each fix needs its
  study updated first.
- Report: `docs/architecture/qa/2026-11-03-security-audit.md`. Not tested: moderation (brick 8 stubbed), real
  Brevo and HTTPS, ZAP and testssl.
- Merged: PR #101 squash 1d1fcbb, gate green (642 tests, coverage 98.63 %, Sonar passed, gitleaks clean). No
  Codex review (quota out). #99 overlaps #60 (stale "Mauvais code."). Next: Should fixes, #89 first.

## 2026-11-03 — Per-socket frame limit (#89)

- Study first: BR-088 added, `platform/02` and `platform/04c` updated, traceability row and JRN-13 in the test
  plan. Owner MCDA: thresholds A, 40-frame burst refilled at 20 per second (465/500); close A, 1008 on overflow
  and after five invalid frames in a row (440/500).
- Code: pure token bucket `src/server/frame-budget.ts` checked by the Node transport before `ping` and
  `hub.receive`, so a flood never reaches the shared `serial()` queue; the hub counts invalid frames and asks the
  transport to close. A closing socket's frames are ignored and no longer refresh its last seen.
- Local review (Codex quota out, four agents): Must 0, 11 Should fixed in cf4eda2 (closing sockets kept
  talking, clock stepping back drained the bucket, `closeSocket` takes a reason only, tests cover every invalid
  branch). The close now waits one turn so the fifth `error invalid` reaches the client. 651 tests, coverage
  98.61 %, gitleaks and `pnpm audit` clean. Pending before merge: SonarQube and the QA pass (JRN-13).
- Full QA pass (`docs/architecture/qa/2026-11-03-89-frame-limit-full.md`): JRN-13 a–f pass (200 frames → 40
  answers then 1008; five invalid → 1008; resume after a policy close; other chatters at p95 7 ms during a
  759-socket flood). Gate red only on pre-existing P0s #105, #64, #98: owner waiver, option A (450/500). Filed
  #104 (owner: account panel overlaps create-room, "retro but elegant") and #105–#111; #112 fixed here (BR-088
  ping clause). Sonar passed on b96ea98.
- Merged 2026-11-05: PR #103 squash b41c8e0 with owner approval; CI (verify, CodeQL, dependency review) and
  SonarQube green on 2491521, QA P0s waived as above. No Codex review (quota out; bot comments answered).
  Next: #23 per-IP WebSocket cap (same upgrade handler), then #91, #64, #63, #104.

## 2026-11-05 — Socket caps per IP and unbound close (#23)

- Study first: BR-089 added, `platform/02` (upgrade path) and `platform/04c` updated, traceability, STRIDE DoS
  row and JRN-14 in the test plan. Owner MCDA: thresholds B, 20 sockets per IP, 500 in total, per-IP upgrade
  budget of 20 refilled 1 per second, unbound close after 10 min (420/500); refusal A, 429/503 with
  `Retry-After: 10` before `handleUpgrade`, unbound close 1008 (420/500). The entry screen opens its socket on
  load, so a short unbound timeout was refused.
- Code: shared pure `src/server/token-bucket.ts` (frame budget now uses it), `src/server/upgrade-limit.ts`
  checked by the Node transport, place released on the raw socket `close`; `hub.tick` closes unbound sockets.
- Adversarial review (Opus): one Must, refused upgrade sockets stayed half-open, fixed by destroying them once
  flushed (403 too). Codex P2: enter and leave between two ticks kept the old deadline, fixed in 0cd0c55.
  Follow-ups #114 (IPv6 /64 keying), #115 (token bucket double refill after a clock step back).
- Full QA pass (`docs/architecture/qa/2026-11-05-23-socket-caps-full.md`): JRN-14 a–f pass (100 upgrades →
  20 then 429; unbound close observed at 600.9 s with reconnect; other chatters 0–1 ms). Filed #117 (no message
  for a 429 tab). Open question: BR-007 (5 entries per IP per minute) slows 10 people behind one box.
- Merged 2026-11-05: PR #116 squash a5cfae4 with owner approval; `pnpm verify` and SonarQube green on 64afd41,
  QA P0s #105, #64, #98 and the missing Copilot review waived. Next: #91, #64, #63, #104.

## 2026-11-05 — Invisible and bidi characters refused (#91)

- Last Should of the 2026-11-03 security audit (#88). Study first (`3b2c77d`): BR-090, the rooms,
  private-conversations, entry, web-ui and platform diagrams, a STRIDE spoofing row, traceability, JRN-15.
- Owner MCDA: character set B, controls, bidi marks, embeddings, overrides and isolates, zero-width space, BOM,
  joiners U+200C and U+200D kept for emoji and Persian (475/500); refused in the pure domain, never stripped
  (460/500); after review, the client runs the same check and keeps the text (405/500), and the set adds
  characters shown as blanks such as U+3164 and U+2800 (440/500).
- Code: pure `src/domain/text.ts` `hasForbiddenChar`; room and private messages get `invalidText`, a city gets
  `invalid` at entry and resume; the web composers and entry form disable sending with a notice. Pseudos and
  room names were already whitelisted (BR-001, BR-030).
- Adversarial review (Opus): two Must, BR-090 missing from the UC4 and UC6 specs and sequences and JRN-15
  without a coverage row, fixed in `db44453`. SonarQube S6819 fixed with `<output>`. Follow-up #120 (review
  Nice items).
- QA pass (`docs/architecture/qa/2026-11-05-91-invisible-chars-pass.md`): JRN-15 a–e pass, emoji ZWJ delivered,
  raw frames get `warning invalidText`. Filed #121 (no `aria-invalid`, pre-existing) and #122 (city notice
  wording).
- Merged 2026-11-05: PR #119 squash 067e9ed with owner approval; CI and SonarQube green on b02923d, QA #121,
  #105, #64, #98 waived. The three audit Should items (#89, #23, #91) are done. Next: #64, #63, #104.

## 2026-11-05 — One h1 per screen (#64)

- A11Y-02 of the 2026-10-24 full pass. Study first (`4f97959`, `92d570e`, `bc4d9d8`): web-ui/04 Headings rule
  and JRN-16. Owner MCDA: the header logo "asv" is each screen's only `h1` (option A, 470/500, vs a visually
  hidden per-screen `h1` 410/500 and promoted screen titles 255/500).
- Code (`f3092e5`, `0d48cd1`): `Header` logo `span` → `<h1 className="logo">` without `aria-label`, `.logo`
  `margin: 0`; tests check the full heading outline per screen and with the account and legal dialogs open.
- Adversarial review (Opus): study round 1 had three Must (search is a `section`, not a `dialog`; Last
  reviewed line; `not covered` status), fixed; code round 1 one Should (outline asserted in full), fixed.
  Follow-up #124 (per-screen document title, WCAG 2.4.2).
- QA pass (`docs/architecture/qa/2026-11-05-64-one-h1-pass.md`, `8d1af70`): JRN-16 a–e pass at 1440 and
  390 px, light and dark; logo pixel-identical to main. Filed #126 (legal pages do not scroll on phones,
  pre-existing).
- Merged 2026-11-05: PR #125 squash f4a6ae2 with owner approval; CI and SonarQube green on 8d1af70, QA #126
  waived. Next: #63, #121, #104.

## 2026-11-06 — Account dialog made modal (#63)

- A11Y-01 of the 2026-10-24 full pass. Owner MCDA: native `showModal()` (option A, 435/500, vs non-modal with
  Escape 335/500 and a hand-made ARIA modal 295/500). Study: web-ui/04 Accessibility (account dialog), web-ui/06,
  JRN-17.
- Code: `AccountPanel` opens with `showModal()` and closes with `close()`, giving the focus back to its opener;
  Escape through a key handler on the dialog (a nested non-modal dialog takes the browser close request) and
  `cancel`; new `Notice` shown inside the dialog while the page is inert; `.overlay` fits the viewport height;
  `PseudoMenu` and "Mon compte" focus their button first so focus comes back (macOS, #130).
- Adversarial review (Opus): round 1 one Must (Escape dead over the privacy page or a private window) and three
  Should (landscape "fermer", notice hidden from screen readers, focus lost from "message privé"), fixed;
  rounds 2 and 3 clean (push gate open, no Must or Should left).
- QA pass (`docs/architecture/qa/2026-11-06-63-account-modal-pass.md`, `e4b4223`): JRN-17 a–i pass on
  Chromium, Firefox and WebKit at 1440, 1440 × 600, 390 and 844 × 390, light and dark; JRN-16 pass. Filed #131
  (private window close loses focus), #132 (two "fermer" buttons); #130 fixed but not run on a Mac; #104 looks
  solved by the top layer (owner to close).
- Merged 2026-11-06: PR #129 squash 619b918 with owner approval; verify and SonarQube green on 489db96, QA Must
  (#131, #59, pre-existing) waived. Next: #121, #126, #105.

## 2026-11-06 — Refused fields marked with aria-invalid (#121)

- Conception: `web-ui/04` rule "Refused fields" (A11Y-03, option A 450/500 validated by the owner), pointer in
  `web-ui/07`; test plan JRN-18.
- Code: the room field `#message` and each private window field get `aria-invalid="true"` while over 500 code
  points (BR-020) or holding a BR-090 character, with `aria-describedby` to the counter (`<id>-count`), the
  notice (`<id>-invisible`) or both; the entry city gets `aria-invalid` only (its notice link is #120). The
  attributes are removed once the text is fixed.
- Adversarial review (Opus): round 1 no Must, three Should (private too-long path untested, counter id not
  resolved in tests, JRN-18 level missing), fixed in 79bbd89; round 2 clean.
- QA pass (`docs/architecture/qa/2026-11-06-121-aria-invalid-pass.md`, `79bbd89`): JRN-18 a–f pass at 1440 and
  390 px, smoke JRN-01 and JRN-15 pass. Must #120 (city notice not linked, pre-existing) waived by the owner;
  filed #137 (Nice, "501/500" says not why).
- Merged 2026-11-06: PR #135 squash 02b507d with owner approval; local verify, gitleaks and SonarQube green on
  6e0d6aa, GitHub checks green. Next: #126, #105, #131, #59.

## 2026-11-06 — Legal pages scroll on phones (#126)

- Conception: `web-ui/04` rule "Legal page scroll" (UI-01, option A 480/500 validated by the owner); test plan
  JRN-19.
- Code: `.legal-page` keeps the user-agent `fit-content` height and caps it with
  `max-height: calc(100dvh - 2 * var(--gap))`, so a long page scrolls inside itself and "fermer" stays
  reachable; short pages keep their text height. Component test on the rule and the three pages.
- Adversarial review (Opus): round 1 no Must, one Should (the issue's `height: auto` stretched short pages),
  dropped on owner choice (a); round 2 clean, decision recorded in the study.
- QA pass (`docs/architecture/qa/2026-11-06-126-legal-scroll-pass.md`, `31c19ff`): JRN-19 pass on Chromium,
  Firefox and WebKit at 320 × 568, 390 × 844, 768 × 1024, 844 × 390, 1440 × 600 and 1440 × 900, light and
  dark, from the entry footer and the account panel (144 cases); JRN-16, JRN-17 and smoke pass; no new issue.
- Merged 2026-11-06: PR #139 squash f0064e3 with owner approval; local verify, gitleaks and SonarQube green on
  d917d05, GitHub checks and Codex review clean. Next: #105, #131, #59.
