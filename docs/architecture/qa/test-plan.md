# Test plan — asv

Risk-based test plan of asv: the risks, the test families that cover them, the critical journeys and a
coverage matrix that records the last QA evidence of every case, so each QA pass reports against it.

> Written with skill `test-plan`. Families, tools and owners refer to the owner's
> `~/.claude/skills/testing-strategy/taxonomy.md` (not linked). Levels and checklist IDs (FON, DAT, UI,
> A11Y, PERF, SEC, ROB, MOB, USA, PRI) refer to skill `qa-browser-check` and its `checklist.md`.
> Last reviewed: 2026-11-05 · JRN-16 row added by the study of #64 (no evidence yet); JRN-15 evidence written by the pass of #91 on fea172c (BI); JRN-14 evidence written by the full pass of #23 on 77d7c17 (SC)

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
| RSK-04 | Private message to the wrong person, or windows unusable (UC6) | 2 | 5 | 10 medium | #65 window covers the room input (fixed and re-checked at scrollY 0 on ce90fc5 and 5669e7d); #83 short-window layout and #84 overlay order verified on 5669e7d |
| RSK-05 | Ignore or directory search leaks or fails (UC7, UC8) | 2 | 4 | 8 medium | BR-042, BR-044 |
| RSK-06 | Account takeover: e-mail code, device cookie, sign-out (UC17, UC18) | 3 | 5 | 15 high | auth surface; #72 defect found by QA |
| RSK-07 | Account deletion leaves data or breaks the legal vault (UC19) | 2 | 5 | 10 medium | ADR-0014, BR-080…083; never run in the browser |
| RSK-08 | Personal data persisted or logged beyond ADR rules | 2 | 5 | 10 medium | `security-and-rgpd.md` §1 rules; no defect seen yet (judgement) |
| RSK-09 | Web attack: XSS, CSWSH, headers, input limits | 3 | 5 | 15 high | public chat input; SEC-01 open (#69) |
| RSK-10 | Tunnel mode misconfigured: HSTS, `Secure` cookie, client IP (BR-084…086) | 2 | 5 | 10 medium | production config, never run by QA |
| RSK-11 | Legal pages missing or wrong (ADR-0018) | 2 | 4 | 8 medium | legal duty before testers |
| RSK-12 | Accessibility barriers (WCAG 2.2 AA) | 3 | 3 | 9 medium | F1–F3 of the full pass (#63, #64; #65 fixed on ce90fc5; #84 overlays verified on 5669e7d) |

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
| JRN-13 | A chatter's page stays connected under normal use; a script flooding frames or sending invalid frames is cut with close 1008 | — (#89) | BR-088 | RSK-09 | unit and transport tests; QA probe (WebSocket frames) | local |
| JRN-14 | Several tabs and people behind one IP stay connected; a script opening sockets in a loop is refused with 429 before any socket exists; a page left on the entry screen 10 min is closed with 1008 `unbound` and reconnects | — (#23) | BR-089 | RSK-09 | unit and transport tests; QA probe (upgrade loop) | local |
| JRN-15 | Posting a room or private message holding U+202E, U+200B or NUL is refused with a notice and nothing is delivered; an emoji with a joiner (👨‍👩‍👧) is delivered; a city with U+202E is refused at entry | UC1, UC4, UC6, UC13 | BR-090 | RSK-03, RSK-04, RSK-09 | unit tests; QA probe through the WebSocket frames | local |
| JRN-16 | Every screen (entry, rooms, room) has exactly one `h1`, the "asv" logo, unchanged on screen; headings below it start at `h2`, legal pages, account and search panels included | — (#64) | — | RSK-12 | unit tests; QA pass (heading outline at 1440 and 390 px, light and dark) | local |

Moderation journeys (UC9, UC11, UC12, UC14…UC16) join this list with brick 8.

## Coverage matrix

Reports: **FP** = `2026-10-24-full-pass.md` (head c470f1a) · **RS** = `2026-10-24-tester-runbook-smoke.md`
(PR #61, head not recorded) · **CS** = `2026-11-02-code-step-resume.md` (first run e774c8c; re-check 09f44e7 re-ran
FON-01a–d, F1, N1–N3, UI-01/02 only) · **TS** = `2026-11-02-test-plan-smoke.md` (head f9970ba) · **PD** = `2026-11-02-65-private-dock.md` (#65: first pass debc8ce, product part and security part; re-run on ce90fc5 and 5669e7d, product part only) · **FL** = `2026-11-03-89-frame-limit-full.md` (#89, level full, head 9913901; shots `2026-11-03-89-<nn>-…`) · **SC** = `2026-11-05-23-socket-caps-full.md` (#23, level full, head 77d7c17, local production build; shots `2026-11-05-23-<nn>-…`) · **BI** = `2026-11-05-91-invisible-chars-pass.md` (#91, level pass, product part, head fea172c (client) on the server code of 9deefab, identical domain and server; local production build; shots `2026-11-05-91-<nn>-…`).
Screenshots are under `docs/architecture/qa/`; numbers refer to the report's own prefix.
Level is the lowest QA level that must run the row: smoke ⊂ pass ⊂ full.

### Journeys

| Case | Level | Last evidence (report · screenshot · head) | Status |
|---|---|---|---|
| JRN-01 entry, nominal | smoke | TS · `2026-11-02-test-plan-smoke-01-entry-375`, `-02-rooms-375` · f9970ba | covered |
| JRN-01 refused pseudo / age, rate limit | pass | FP · `full-02-entry-error` · c470f1a; rate limit FP SEC-07 · c470f1a and PD SEC-07 · debc8ce | covered |
| JRN-02 away 5 min, peer away | pass | FP · `full-14-peer-away`, `full-15-peer-closed` · c470f1a | covered |
| JRN-02 resume after a socket drop | pass | CS · `2026-11-02-09-recheck-after-drop-375` · 09f44e7 | covered |
| JRN-02 server down and restart | pass | FP · `full-21-server-down`, `full-22-server-back` · c470f1a | covered |
| JRN-02 leave | pass | FP FON-01 (no shot) · c470f1a | covered |
| JRN-03 join and post | smoke | TS · `2026-11-02-test-plan-smoke-03-room-post-375` · f9970ba; PD UI-65q (lines scroll inside the panel and follow at the bottom, tab switching) · `2026-11-02-65-29-sender-lines-follow-3-open-1440` · ce90fc5; PD UI-85a own post follows · `2026-11-02-65-52-own-post-follows-1440x900` · 5669e7d | covered |
| JRN-03 flood notice | pass | FP · `full-07-room-flood` · c470f1a | covered |
| JRN-03 create a user room | pass | FP · `full-24-user-room-created` · c470f1a | covered |
| JRN-04 private conversation, both sides | pass | PD FON-04 · `2026-11-02-65-24-sender-1-open-1-min-1440-scrolly0`, `-27-receiver-1-open-1-min-1440-scrolly0` · ce90fc5; PD FON-04b · `2026-11-02-65-53-sender-1-min-2-open-1440` · 5669e7d (earlier: PD `-18-sender-minimised-unread-1440` · debc8ce; FP: FP · `full-09-private-receiver`, `full-10-private-sender` · c470f1a) | covered |
| JRN-04 minimised window, unread | pass | PD FON-04 minimise and restore · `2026-11-02-65-27-receiver-1-open-1-min-1440-scrolly0` · ce90fc5; PD FON-65n2 · `2026-11-02-65-54-sender-tabs-only-1440` · 5669e7d; unread tab PD `-18-sender-minimised-unread-1440` · debc8ce | covered (unread badge not re-run on ce90fc5) |
| JRN-04 windows never cover the room composer, desktop 1 / 2 / 3 windows, 1 open + 1 minimised, tab only, 0 windows, sender and receiver, at scrollY 0 and after scrolling, 1440 × 900 / 921 × 892 / 1440 × 600 / 800 × 700 | pass | PD FON-65m/n/o, UI-65p · `2026-11-02-65-22-sender-1-open-1440-scrolly0`, `-24-sender-1-open-1-min-1440-scrolly0`, `-26-sender-3-open-1440-scrolly0`, `-27-receiver-1-open-1-min-1440-scrolly0`, `-28-receiver-3-open-1440-scrolly0` · ce90fc5; PD FON-65m2, FON-65n2, UI-83a/b/c · `2026-11-02-65-43-sender-3-open-1440x900-scrolly0`, `-45-sender-3-open-1440x600-scrolly0`, `-46-sender-3-open-1440x600-scrolled-bottom`, `-47-sender-3-open-800x700-scrolly0`, `-55-receiver-1-open-1440` · 5669e7d | covered on 5669e7d (0 failing hit-tests incl. 20 px scroll sweeps; tall: no page scroll, fixed dock; below 768 × 720: page scrolls, dock in flow, lines 300 / 350 px; #83 verified) |
| JRN-04 windows never cover the room composer, phone 390 px, 3 / 2 + 1 min / 1 + 2 min, receiver 2 / 1 + 1 min / 0 | pass | PD UI-65h2 · `2026-11-02-65-36-sender-3-open-390`, `-37-sender-2-open-1-min-390`, `-38-sender-1-open-2-min-390`, `-39-receiver-open-390` · ce90fc5; PD UI-65h3 · `2026-11-02-65-56-sender-2-open-390`, `-59-receiver-390` · 5669e7d (earlier: debc8ce shots 07…13) | covered (dock static after the room, no regression; composer above the fold with 2+ windows, reachable by scrolling) |
| JRN-03 rooms list with private windows open, desktop and phone | pass | PD UI-65j (first pass) · `2026-11-02-65-16-sender-rooms-list-2-open-1440`, `-17-sender-rooms-list-2-open-390` · debc8ce | covered; re-run on 5669e7d: PD UI-65j2 · `2026-11-02-65-57-rooms-list-2-open-390`, `-58-rooms-list-2-open-1440` |
| JRN-03 search and account overlays with the dock, desktop | pass | PD UI-65t, UI-65n · `2026-11-02-65-30-sender-search-overlay-3-open-1440`, `-31-sender-account-overlay-3-open-1440`, `-32-account-overlay-covered-by-dock-3-open-1440x600` · ce90fc5; re-run PD UI-84a/b · `2026-11-02-65-49-account-overlay-over-dock-1440x600-scrolled`, `-51-search-overlay-over-dock-1440x600-scrolled` · 5669e7d | covered on 5669e7d (overlay z-index 16 over the dock, every control hit and "fermer" / "annuler" clicked; #84 verified; FAIL on ce90fc5 fixed) |
| JRN-04 cap of 3 windows | pass | FL JRN-04b · `2026-11-03-89-13-receiver-3-windows-cap-1440` · 9913901 | covered (`warning targetBusy`) |
| JRN-05 ignore | pass | FP · `full-12-ignore-receiver` · c470f1a | covered |
| JRN-06 directory search | pass | FP · `full-13-search` · c470f1a | covered |
| JRN-07 request a code, right code | pass | CS · `2026-11-02-11-recheck-signed-in-375` · 09f44e7 | covered |
| JRN-07 wrong code, exhausted | pass | CS · `2026-11-02-12-recheck-f1-no-dead-step-375` · 09f44e7 | covered |
| JRN-07 IP quota 10 codes per hour | full | FL JRN-07b (no shot) · 9913901 | covered |
| JRN-08 code step after a drop and a reload | pass | CS · `2026-11-02-09-recheck-after-drop-375`, `2026-11-02-10-recheck-after-reload-focus-375` · 09f44e7 | covered |
| JRN-09 device cookie flags | pass | PD SEC-02 (no shot) · debc8ce | covered |
| JRN-09 sign out of this device, cookie replay refused | pass | FP SEC-12 (no shot) · c470f1a | covered |
| JRN-09 sign out everywhere | pass | FL JRN-09c · `2026-11-03-89-18-signed-out-everywhere-1440` · 9913901 | covered |
| JRN-09 remembered device hint in a new tab | pass | FL JRN-09b · `2026-11-03-89-15-remembered-device-new-tab-1440`, `-15-remembered-device-signed-in-1440` · 9913901 | covered |
| JRN-10 delete my account | pass | FL JRN-10a/b · `2026-11-03-89-16-delete-confirm-no-retention-notice-1440`, `-17-account-deleted-1440` · 9913901 | covered (FAIL: retention notice missing, #110) |
| JRN-11 legal pages | smoke | TS · `2026-11-02-test-plan-smoke-04-rules-375`, `-05-legal-375`, `-06-privacy-375` · f9970ba | covered |
| JRN-12 HSTS in tunnel mode | full | RS header read on the live instance (no shot) · PR #61 | covered |
| JRN-12 `Secure` cookie, client IP in tunnel mode | full | — (unit tests only; FL NOT TESTED, needs the tester secrets) | not covered |
| JRN-13 frame budget: (a) normal UI use and 75 s idle never closed; (b) 200 frames → 40 answers then 1008 `tooManyFrames`; (c) 5 invalid → 5 `error invalid` then 1008 `invalidFrames`; (d) 4 invalid + valid + 4 invalid stays open; (e) web client resumes after a policy close; (f) other chatters responsive during a flood | full | FL JRN-13a…f · `2026-11-03-89-04-after-policy-close-reconnecting-1440`, `-05-resumed-after-policy-close-1440` · 9913901 | covered (all PASS; `ping` and the invalid count #112; reconnect rate per IP #23) |
| JRN-14 upgrade limits: (a) 10 tabs from one IP all connect and chat; (b) a loop of 100 upgrades from one IP gets 20 sockets then 429 with `Retry-After`, no connection line for refused ones; (c) the 21st concurrent socket of one IP gets 429; (d) a closed socket frees its place; (e) an entry screen left 10 min gets 1008 `unbound` and the page reconnects; (f) other chatters responsive during the loop | full | SC JRN-14a…j · `2026-11-05-23-02-ten-tabs-room-1440`, `-01-entry-left-open-1440`, `-04-entry-after-unbound-reconnect-1440`, `-05-entered-after-unbound-xss-as-text-1440`, `-06-new-tab-refused-429-1440`, `-07-new-tab-online-after-release-1440` · 77d7c17 | covered (a…f all PASS, (e) observed over 20 min; extra: refusal bytes and socket destroyed, foreign origin takes no token, failed handshakes release, total cap 503; refused-tab banner #117) |
| JRN-15 BR-090: (a) room message with U+202E, U+200B or NUL refused with the notice, nothing delivered; (b) same in a private window; (c) an emoji ZWJ sequence delivered; (d) a city with U+202E refused at entry and at resume; (e) raw frame gets `warning invalidText`, nothing delivered | pass | BI JRN-15a…g · `2026-11-05-91-01-entry-city-rlo-refused-1440`, `-02-room-rlo-refused-sender-1440`, `-03-room-nothing-delivered-receiver-1440`, `-04-room-emoji-zwj-delivered-receiver-1440`, `-05-private-rlo-refused-sender-1440`, `-06-private-receiver-1440`, `-07-raw-frame-invalidtext-notice-1440`, `-08-room-rlo-refused-390`, `-08-room-rlo-refused-768`, `-09-room-zwsp-refused-dark-1440` · fea172c | covered (a…g all PASS; resume city and edges at protocol level; A11Y-03 `aria-invalid` #121, entry wording #122) |
| JRN-16 one `h1` per screen, named "asv", logo look unchanged, outline `h1` → `h2`: (a) entry, and each of the 3 legal pages from its footer; (b) rooms with the inline search; (c) room with the search overlay; (d) room with the account panel at the e-mail step and its privacy page; (e) room with a private window (no heading); at 1440 and 390 px, light and dark | pass | — | not covered (#64) |

### qa-browser-check domains

| Domain | Level | Last evidence (report · screenshot · head) | Status |
|---|---|---|---|
| FON Functional | smoke | FP FON-01/03/04/08/09/10 · c470f1a; CS FON-01a–d · 09f44e7, FON-09 · e774c8c | covered (FON-08b not covered) |
| DAT Data and API | pass | FP DAT-01, DAT-03/06 · c470f1a | covered |
| UI viewports, console, dark | pass | FP UI-01/02/04/05 · `full-18-entry-390`, `full-20-entry-dark` · c470f1a; TS inspector · f9970ba; PD UI-02, UI-65m…k2 · `2026-11-02-65-41-sender-3-open-dark-1440-scrolly0`, `-42-sender-3-open-dark-390`, `-40-receiver-0-windows-1440-scrolly0` · ce90fc5; PD UI-83a/b, UI-02b · `2026-11-02-65-45-sender-3-open-1440x600-scrolly0` · 5669e7d (dark not re-run) | covered (UI-08 open, #62; #83 short desktop windows verified on 5669e7d; Nice #85 part 2 open) |
| UI Firefox and WebKit | full | FL UI-03 · `2026-11-03-89-27-firefox-room-1440`, `-28-webkit-room-1440` (and `-390`) · 9913901 | covered (entry → room → post; private dock not run on these engines) |
| A11Y keyboard, semantics, contrast, targets | pass | FP · `full-23-keyboard-guest-rooms` · c470f1a; #65 re-checked in PD at scrollY 0 and after scrolling (target visibility and `elementFromPoint`) · `2026-11-02-65-22-sender-1-open-1440-scrolly0` · ce90fc5; overlay controls PD A11Y-65b · `2026-11-02-65-49-account-overlay-over-dock-1440x600-scrolled` · 5669e7d | covered (FAIL: #63, #64; #84 overlay controls verified on 5669e7d; #65 fixed on ce90fc5) |
| A11Y axe-core, screen reader | full | FL A11Y-11 axe-core 4.13 (no shot) · 9913901; screen reader NOT TESTED (Orca missing) | covered for axe (FAIL: #105, #64, #107); screen reader not covered |
| PERF lab budget | full | FL PERF-01 Lighthouse 12.6.1 mobile, 3 runs (no shot) · 9913901 | covered (FAIL: LCP 2.6 s, #98) |
| SEC probes | pass | FL SEC-01…10 · 9913901 (earlier PD · debc8ce) | covered (SEC-01 FAIL, #69) |
| ROB down, restart, two users | pass | FP ROB-01/02/05 · c470f1a; CS ROB-01 · e774c8c | covered |
| MOB native or real phone | full | — (CS MOB-03 NOT TESTED) | not covered |
| USA messages, confirmations | pass | FP USA-03/04 · c470f1a | covered |
| PRI storage, logs, third parties | pass | CS PRI-01 · e774c8c; FP PRI-02/03 · c470f1a | covered |

### SEC-01…SEC-10

PD SEC rows come from the security part of `2026-11-02-65-private-dock.md` on fd6cacc (product code debc8ce), local
dev server and own production build. Not re-run on ce90fc5 or 5669e7d (CSS and client scroll code only). All ten re-run by FL on 9913901 (local dev server and own production build), same verdicts; FL adds the BR-088 frame budget to SEC-07.

| Case | Level | Last evidence (report · head) | Status |
|---|---|---|---|
| SEC-01 security headers | smoke | PD SEC-01 (`curl -I` on the production build, no shot) · debc8ce | covered (FAIL: no `Permissions-Policy`, no `object-src 'none'`, #69) |
| SEC-02 cookies | pass | PD SEC-02 (no shot) · debc8ce | covered (`Secure` in tunnel: not covered) |
| SEC-03 Origin, CORS, CSWSH | pass | PD SEC-03 (no shot) · debc8ce | covered |
| SEC-04 XSS | pass | PD SEC-04 · `2026-11-02-65-21-sec04-private-and-room-xss-as-text-921` · debc8ce | covered (room and private window) |
| SEC-05 authn and authz | pass | PD SEC-05 (no shot) · debc8ce | covered |
| SEC-06 input limits | pass | PD SEC-06 (no shot) · debc8ce | covered |
| SEC-07 rate limits | pass | FL SEC-07 and JRN-13 (no shot) · 9913901; PD SEC-07 · debc8ce | covered (other users not locked out by a frame flood; private burst not covered) |
| SEC-08 error leaks | pass | PD SEC-08 (no shot) · debc8ce | covered |
| SEC-09 bundle | pass | PD SEC-09 (no shot) · debc8ce | covered |
| SEC-10 third parties | pass | PD SEC-10 (no shot) · debc8ce | covered |

## Exit criteria

- Pre-merge: `pnpm verify` green; coverage ≥ 80 %; SonarQube gate passed on the head SHA; gitleaks and
  `pnpm audit` clean; QA pass at the gate's level with every in-scope coverage row carrying evidence on
  the head SHA; no open Must finding.
- Release (brick 9 and the public launch): QA full with no `not covered` row left in scope; every `JRN-`
  passes on Chromium, Firefox and WebKit; no high risk without a `yes` family covering it.

## Gaps

| Family | Missing | Issue |
|---|---|---|
| Functional | — (JRN-04 cap, JRN-09 sign out everywhere, JRN-10 deletion run by FL on 9913901) | — |
| Functional E2E automated | Playwright suite (`later`) | to file on owner approval |
| Compatibility | Firefox and WebKit run of the private dock (journey run by FL) | to file on owner approval |
| Security | Tunnel-mode run of JRN-12 on a local instance | to file on owner approval |
| UI and visual | Screen reader (Orca); axe-core run by FL | to file on owner approval |

## Changelog

- 2026-11-05 — #91 pass on fea172c (BI, product part): JRN-15 a…e covered, all PASS, plus BR-090 edges (interior BOM, U+2028, U+034F, U+2800, C1, TAB; edge BOM trimmed) and no contribution line for refused messages; smoke JRN-01, JRN-03, JRN-04 PASS (rows left on their earlier evidence). New findings #121 (A11Y-03, Must, pre-existing pattern), #122 (Nice).
- 2026-11-05 — #23 full pass on 77d7c17 (SC): JRN-14 a…f covered, all PASS, plus BR-089 edges (raw refusal, fd count, 403 and 400 paths, 500 total cap); JRN-13 b/c/d re-run, PASS. Other rows left on their earlier evidence (member journeys run at protocol level only). New finding #117 (Nice).
- 2026-11-03 — #89 full pass on 9913901 (FL): JRN-13 coverage row added (a…f all PASS); JRN-04 cap, JRN-07 IP quota, JRN-09 sign out everywhere and remembered device, JRN-10 deletion, Firefox and WebKit, axe-core, PERF-01 now covered; SEC-01…10 re-run (SEC-01 still FAIL, #69). New findings #105…#112.
- 2026-11-02 — #83, #84, #85 re-run on 5669e7d (PD, product part): short desktops (1440 × 600, 800 × 700) with 3 windows, tall desktops, overlays above the dock, own post follows, phones, rooms list; JRN-03, JRN-04, UI and A11Y rows moved to 5669e7d. Nothing new; #85 part 2 not re-checked; SEC rows left on debc8ce.
- 2026-11-02 — #65 re-run on ce90fc5 (PD, product part): composer hit-tests at scrollY 0 and after scrolling, 0 / tab / 1 / 1+1 / 2 / 3 windows, 4 desktop viewports and 390 px; JRN-04, JRN-03, UI and A11Y rows moved to ce90fc5; the scrollY 0 caveat is removed (fixed). New findings #83, #84 (Should), #85 (Nice); SEC rows left on debc8ce.
- 2026-11-02 — #65 security part: SEC-01…10 re-run on debc8ce (PD), evidence refreshed; SEC-01 still FAIL (#69), no new finding.
- 2026-11-02 — #65: JRN-04 coverage rows added for the composer never covered (desktop, phone, minimised), JRN-03 rooms list with windows, evidence PD · debc8ce; SEC rows not re-run (CSS-only diff, security part not run).
- 2026-11-02 — created (#74): risks, families, 12 journeys, coverage back-filled from FP, RS and CS; smoke rows
  run against the plan (TS).
