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
