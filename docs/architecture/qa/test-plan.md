# Test plan — asv

Risk-based test plan of asv: the risks, the test families that cover them, the critical journeys and a
coverage matrix that records the last QA evidence of every case, so each QA pass reports against it.

> Written with skill `test-plan`. Families, tools and owners refer to the owner's
> `~/.claude/skills/testing-strategy/taxonomy.md` (not linked). Levels and checklist IDs (FON, DAT, UI,
> A11Y, PERF, SEC, ROB, MOB, USA, PRI) refer to skill `qa-browser-check` and its `checklist.md`.
> Last reviewed: 2026-11-02 · base fc7d87d, JRN-04 rows updated for #65 on debc8ce

## Rule: the plan follows the product

- **Every PR that adds or changes a user journey updates this plan in the same PR**: a new or changed
  `JRN-` row, its coverage rows, and the `Last reviewed` line.
- `review-local` § 2c passes this plan to `qa-tester`. The QA pass exercises the in-scope `JRN-` rows first
  and writes, for each in-scope coverage row, the report path, screenshot and head SHA it produced.
- **An in-scope coverage row left with no evidence turns the QA step red.** A row is in scope when the
  diff touches its journey or its level is at or below the run's level (smoke ⊂ pass ⊂ full).
- After the merge, the evidence columns below are updated from the new report (same PR or the log PR).
- A case never run is written `not covered`. Evidence is never invented or carried over from another SHA
  without saying so.

## Context

| Item | Value |
|---|---|
| Product type | Web (Vite React client) + Node WebSocket server (Hono, `ws`) |
| Criticality | Accounts and personal data (e-mail, device hashes, legal logs); exposed to real testers |
| Stack and runners | TypeScript, Vitest (unit, integration, contract, component), ESLint dependency rule |
| Environments | `local` (dev server or own production build, dev mailer); tester exposure on asvchat.fr through a Cloudflare tunnel (ADR-0018), never a QA target |
| CI today | Local: `pnpm verify`, gitleaks, `pnpm audit`, `pnpm sonar` (local SonarQube gate); GitHub CodeQL |

## Risk register

| ID | Feature / risk | P | I | Level | Evidence |
|---|---|---|---|---|---|
| RSK-01 | Entry refused or pseudo rules broken (UC1) | 2 | 4 | 8 medium | core funnel; BR-001…008 unit-tested |
| RSK-02 | Session lost or duplicated on resume (UC13) | 3 | 4 | 12 medium | resume path changed in #72; ADR-0011 |
| RSK-03 | Room posting broken or flood unbounded (UC2-5) | 2 | 4 | 8 medium | BR-020…022; flood checked in the full pass |
| RSK-04 | Private message to the wrong person, or windows unusable (UC6) | 2 | 5 | 10 medium | #65 window covers the room input (fixed, checked on debc8ce) |
| RSK-05 | Ignore or directory search leaks or fails (UC7, UC8) | 2 | 4 | 8 medium | BR-042, BR-044 |
| RSK-06 | Account takeover: e-mail code, device cookie, sign-out (UC17, UC18) | 3 | 5 | 15 high | auth surface; #72 defect found by QA |
| RSK-07 | Account deletion leaves data or breaks the legal vault (UC19) | 2 | 5 | 10 medium | ADR-0014, BR-080…083; never run in the browser |
| RSK-08 | Personal data persisted or logged beyond ADR rules | 2 | 5 | 10 medium | `security-and-rgpd.md` §1 rules; no defect seen yet (judgement) |
| RSK-09 | Web attack: XSS, CSWSH, headers, input limits | 3 | 5 | 15 high | public chat input; SEC-01 open (#69) |
| RSK-10 | Tunnel mode misconfigured: HSTS, `Secure` cookie, client IP (BR-084…086) | 2 | 5 | 10 medium | production config, never run by QA |
| RSK-11 | Legal pages missing or wrong (ADR-0018) | 2 | 4 | 8 medium | legal duty before testers |
| RSK-12 | Accessibility barriers (WCAG 2.2 AA) | 3 | 3 | 9 medium | F1–F3 of the full pass (#63, #64, #65) |

## Family matrix

| # | Family | Applies? | Tool | CI stage | Cadence | Owner | Covers |
|---|---|---|---|---|---|---|---|
| 1 | Functional | yes | Vitest unit / integration / component; QA pass in the browser | unit, e2e | per commit; pre-merge | project; `qa-tester` | RSK-01…07, RSK-11 |
| 1b | Functional E2E automated | later — before the public launch | Playwright on the Node transport (`test-strategy.md`) | e2e | pre-merge | project | RSK-02, RSK-06 |
| 2 | UI and visual | yes | QA pass: viewports, dark, states | e2e | pre-merge | `qa-tester` | RSK-12 |
| 3 | Performance | later — before the public launch | k6 or Node script, 300 chatters (NF-001, NF-002) | e2e | release | project | — |
| 4 | Security | yes | CodeQL, gitleaks, `pnpm audit`; SEC-01…10 probes in the QA pass | static, e2e | per commit; pre-merge | `review-local`; `qa-tester` | RSK-06, RSK-09, RSK-10 |
| 5 | Data | yes | Vitest (crypto, vault, logs); PRI checks in the QA pass | unit, e2e | per commit; pre-merge | project; `qa-tester` | RSK-07, RSK-08 |
| 6 | Compatibility and localisation | yes | QA pass: Chromium; Firefox and WebKit at level full | e2e | release | `qa-tester` | RSK-12 |
| 7 | Infrastructure and deployment | later — brick 9 deploy | Wrangler integration suite (NF-009) | integration | release | project | — |
| 8 | Reliability | yes | QA pass: server down / restart, socket drop | e2e | pre-merge | `qa-tester` | RSK-02 |
| 9 | Content and SEO | no — chat behind an entry screen, not indexed | — | — | — | — | — |
| 10 | Modern architectures | no — no AI adapter or queue yet (brick 8 adds AI triage) | — | — | — | — | — |
| 11 | Compliance and monitoring | yes | legal pages and log rules checked in the QA pass | e2e | release | `qa-tester` | RSK-08, RSK-11 |
| 12 | Static | yes | TypeScript strict, ESLint dependency rule, SonarQube | static | per commit | `pnpm verify`, `pnpm sonar` | all |

## Critical journeys (E2E priorities)

| ID | Journey | UC | BR | Risks | Tool | Environment |
|---|---|---|---|---|---|---|
| JRN-01 | Enter with a pseudo, gender, age, city; refused pseudo and rate limit | UC1 | BR-001…008 | RSK-01 | QA pass (browser) | local |
| JRN-02 | Go away, resume after a drop or a server restart, leave | UC13, UC10 | BR-010…015 | RSK-02 | QA pass | local |
| JRN-03 | Browse rooms, join, post, flood notice, create a user room | UC2, UC3, UC4, UC5 | BR-020…024, BR-030…033 | RSK-03 | QA pass | local |
| JRN-04 | Open private conversations (members only, 3 windows), minimise, unread | UC6 | BR-013, BR-040, BR-041, BR-043 | RSK-04 | QA pass, two users | local |
| JRN-05 | Ignore a chatter both ways | UC8 | BR-042, BR-044 | RSK-05 | QA pass, two users | local |
| JRN-06 | Find a chatter by pseudo or city | UC7 | BR-006, BR-042 | RSK-05 | QA pass | local |
| JRN-07 | Sign in with an e-mail code: request, wrong code, exhausted, right code | UC17 | BR-070…072, BR-077, BR-083 | RSK-06 | QA pass, dev mailer | local |
| JRN-08 | Code step kept across a socket drop and a reload | UC17 | BR-087 | RSK-02, RSK-06 | QA pass at 375 px | local |
| JRN-09 | Remembered device (cookie), sign out of this device or everywhere | UC17, UC18 | BR-073 | RSK-06 | QA pass | local |
| JRN-10 | Delete my account | UC19 | BR-080…083 | RSK-07 | QA pass | local |
| JRN-11 | Read the legal pages (rules, legal notice, privacy) | — (ADR-0018) | — | RSK-11 | QA pass | local |
| JRN-12 | Tunnel mode: HSTS, `Secure` cookie, client IP from `CF-Connecting-IP` | — (ADR-0018) | BR-084…086 | RSK-10 | unit tests; QA pass on a local `ASV_TUNNEL` instance | local |

Moderation journeys (UC9, UC11, UC12, UC14…UC16) join this list with brick 8.

## Coverage matrix

Reports: **FP** = `2026-10-24-full-pass.md` (head c470f1a) · **RS** = `2026-10-24-tester-runbook-smoke.md`
(PR #61, head not recorded) · **CS** = `2026-11-02-code-step-resume.md` (first run e774c8c; re-check 09f44e7 re-ran
FON-01a–d, F1, N1–N3, UI-01/02 only) · **TS** = `2026-11-02-test-plan-smoke.md` (head f9970ba) · **PD** = `2026-11-02-65-private-dock.md` (head debc8ce, #65, product part only).
Screenshots are under `docs/architecture/qa/`; numbers refer to the report's own prefix.
Level is the lowest QA level that must run the row: smoke ⊂ pass ⊂ full.

### Journeys

| Case | Level | Last evidence (report · screenshot · head) | Status |
|---|---|---|---|
| JRN-01 entry, nominal | smoke | TS · `2026-11-02-test-plan-smoke-01-entry-375`, `-02-rooms-375` · f9970ba | covered |
| JRN-01 refused pseudo / age, rate limit | pass | FP · `full-02-entry-error` · c470f1a; rate limit FP SEC-07 · c470f1a and CS SEC-07 · e774c8c | covered |
| JRN-02 away 5 min, peer away | pass | FP · `full-14-peer-away`, `full-15-peer-closed` · c470f1a | covered |
| JRN-02 resume after a socket drop | pass | CS · `2026-11-02-09-recheck-after-drop-375` · 09f44e7 | covered |
| JRN-02 server down and restart | pass | FP · `full-21-server-down`, `full-22-server-back` · c470f1a | covered |
| JRN-02 leave | pass | FP FON-01 (no shot) · c470f1a | covered |
| JRN-03 join and post | smoke | TS · `2026-11-02-test-plan-smoke-03-room-post-375` · f9970ba | covered |
| JRN-03 flood notice | pass | FP · `full-07-room-flood` · c470f1a | covered |
| JRN-03 create a user room | pass | FP · `full-24-user-room-created` · c470f1a | covered |
| JRN-04 private conversation, both sides | pass | PD FON-04 · `2026-11-02-65-18-sender-minimised-unread-1440` · debc8ce (earlier: FP · `full-09-private-receiver`, `full-10-private-sender` · c470f1a) | covered |
| JRN-04 minimised window, unread | pass | PD FON-04 · `2026-11-02-65-18-sender-minimised-unread-1440` · debc8ce | covered |
| JRN-04 windows never cover the room composer, desktop 1 / 2 / 3 windows, 1 open + 1 minimised, sender and receiver | pass | PD FON-65a…e, UI-65f/g · `2026-11-02-65-01-sender-1-open-1440`, `-02-receiver-1-open-1440`, `-04-sender-1-open-1-min-1440`, `-06-receiver-1-open-1-min-1440` · debc8ce | covered |
| JRN-04 windows never cover the room composer, phone 390 px, 1 / 2 / 3 windows, 1 open + 1 minimised | pass | PD UI-65h/i · `2026-11-02-65-07-sender-1-open-1-min-390`, `-10-sender-1-open-390`, `-12-sender-2-open-390-scrolled-to-composer` · debc8ce | covered (2+ windows on a phone: composer above the fold at the very bottom, reachable by scrolling) |
| JRN-03 rooms list with private windows open, desktop and phone | pass | PD UI-65j · `2026-11-02-65-16-sender-rooms-list-2-open-1440`, `-17-sender-rooms-list-2-open-390` · debc8ce | covered |
| JRN-04 cap of 3 windows | pass | — | not covered |
| JRN-05 ignore | pass | FP · `full-12-ignore-receiver` · c470f1a | covered |
| JRN-06 directory search | pass | FP · `full-13-search` · c470f1a | covered |
| JRN-07 request a code, right code | pass | CS · `2026-11-02-11-recheck-signed-in-375` · 09f44e7 | covered |
| JRN-07 wrong code, exhausted | pass | CS · `2026-11-02-12-recheck-f1-no-dead-step-375` · 09f44e7 | covered |
| JRN-07 IP quota 10 codes per hour | full | — | not covered |
| JRN-08 code step after a drop and a reload | pass | CS · `2026-11-02-09-recheck-after-drop-375`, `2026-11-02-10-recheck-after-reload-focus-375` · 09f44e7 | covered |
| JRN-09 device cookie flags | pass | CS SEC-02 (no shot) · e774c8c | covered |
| JRN-09 sign out of this device, cookie replay refused | pass | FP SEC-12 (no shot) · c470f1a | covered |
| JRN-09 sign out everywhere | pass | — | not covered |
| JRN-09 remembered device hint in a new tab | pass | FP: INCONCLUSIVE · c470f1a | not covered |
| JRN-10 delete my account | pass | — (FP PRI-04 NOT TESTED) | not covered |
| JRN-11 legal pages | smoke | TS · `2026-11-02-test-plan-smoke-04-rules-375`, `-05-legal-375`, `-06-privacy-375` · f9970ba | covered |
| JRN-12 HSTS in tunnel mode | full | RS header read on the live instance (no shot) · PR #61 | covered |
| JRN-12 `Secure` cookie, client IP in tunnel mode | full | — (unit tests only) | not covered |

### qa-browser-check domains

| Domain | Level | Last evidence (report · screenshot · head) | Status |
|---|---|---|---|
| FON Functional | smoke | FP FON-01/03/04/08/09/10 · c470f1a; CS FON-01a–d · 09f44e7, FON-09 · e774c8c | covered (FON-08b not covered) |
| DAT Data and API | pass | FP DAT-01, DAT-03/06 · c470f1a | covered |
| UI viewports, console, dark | pass | FP UI-01/02/04/05 · `full-18-entry-390`, `full-20-entry-dark` · c470f1a; TS inspector · f9970ba; PD UI-02, UI-65f…k · `2026-11-02-65-15-sender-2-open-dark-1440` · debc8ce | covered (UI-08 open, #62) |
| UI Firefox and WebKit | full | — (PD: `:has()` dock rule not run on Firefox or WebKit) | not covered |
| A11Y keyboard, semantics, contrast, targets | pass | FP · `full-23-keyboard-guest-rooms` · c470f1a; #65 re-checked in PD (target visibility and `elementFromPoint`) · debc8ce | covered (FAIL: #63, #64; #65 fixed on debc8ce) |
| A11Y axe-core, screen reader | full | — | not covered |
| PERF lab budget | full | FP PERF-01 INCONCLUSIVE · c470f1a | not covered |
| SEC probes | pass | CS SEC-01…10 · e774c8c | covered (SEC-01 FAIL, #69) |
| ROB down, restart, two users | pass | FP ROB-01/02/05 · c470f1a; CS ROB-01 · e774c8c | covered |
| MOB native or real phone | full | — (CS MOB-03 NOT TESTED) | not covered |
| USA messages, confirmations | pass | FP USA-03/04 · c470f1a | covered |
| PRI storage, logs, third parties | pass | CS PRI-01 · e774c8c; FP PRI-02/03 · c470f1a | covered |

### SEC-01…SEC-10

CS SEC rows come from the first run (e774c8c); 09f44e7 changed no server code.

| Case | Level | Last evidence (report · head) | Status |
|---|---|---|---|
| SEC-01 security headers | smoke | TS (`curl -I`) · f9970ba | covered (FAIL: no `Permissions-Policy`, #69) |
| SEC-02 cookies | pass | CS · e774c8c | covered (`Secure` in tunnel: not covered) |
| SEC-03 Origin, CORS, CSWSH | pass | CS · e774c8c | covered |
| SEC-04 XSS | pass | CS · `2026-11-02-06-room-xss-as-text-375` · e774c8c | covered |
| SEC-05 authn and authz | pass | CS · e774c8c | covered |
| SEC-06 input limits | pass | CS · e774c8c | covered |
| SEC-07 rate limits | pass | CS · e774c8c | covered |
| SEC-08 error leaks | pass | CS · e774c8c | covered |
| SEC-09 bundle | pass | CS · e774c8c | covered |
| SEC-10 third parties | pass | CS · e774c8c | covered |

## Exit criteria

- Pre-merge: `pnpm verify` green; coverage ≥ 80 %; SonarQube gate passed on the head SHA; gitleaks and
  `pnpm audit` clean; QA pass at the gate's level with every in-scope coverage row carrying evidence on
  the head SHA; no open Must finding.
- Release (brick 9 and the public launch): QA full with no `not covered` row left in scope; every `JRN-`
  passes on Chromium, Firefox and WebKit; no high risk without a `yes` family covering it.

## Gaps

| Family | Missing | Issue |
|---|---|---|
| Functional | Browser run of JRN-04 cap, JRN-09 sign out everywhere, JRN-10 deletion | to file on owner approval |
| Functional E2E automated | Playwright suite (`later`) | to file on owner approval |
| Compatibility | Firefox and WebKit run | to file on owner approval |
| Security | Tunnel-mode run of JRN-12 on a local instance | to file on owner approval |
| UI and visual | axe-core and screen reader | to file on owner approval |

## Changelog

- 2026-11-02 — #65: JRN-04 coverage rows added for the composer never covered (desktop, phone, minimised), JRN-03 rooms list with windows, evidence PD · debc8ce; SEC rows not re-run (CSS-only diff, security part not run).
- 2026-11-02 — created (#74): risks, families, 12 journeys, coverage back-filled from FP, RS and CS; smoke rows
  run against the plan (TS).
