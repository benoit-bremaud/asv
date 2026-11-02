# QA pass — private windows must not cover the room composer, issue #65 (2026-11-02)

QA pass on the running product for branch `fix/65-private-windows-room-input`: on 1440 × 900 and 390 × 844, on the sender and the receiver side, with one open window and with one open plus one minimised, the room input, "envoyer" button and smileys are fully visible and clickable. No finding on debc8ce; see the re-run on ce90fc5 at the end (fix B, 2 Should and 1 Nice open).

| Level | Head SHA | Environment | Targets | Agent / model | Matrix page |
|---|---|---|---|---|---|
| pass (product part; SEC part not run) | debc8ce | local: dev server `http://localhost:5173` (Vite + Node transport, dev mailer, in-memory store) | W | qa-tester · Sonnet | not published (orchestrator) |

Plan. Diff: `src/web/styles.css` (`--dock-height`, `.app:has(.privates)` padding, phone dock `position: static`) plus two docs. Domains in: FON (JRN-04), UI (viewports, dark, console), A11Y limited to target visibility and reachability (#65 is an A11Y finding of the full pass). Domains out: DAT, PERF, PRI, MOB (no data, server or storage change); SEC probes SEC-01…10 and ROB-11 belong to the `security` part, not run here (`NOT TESTED (security part not run)`).

Accounts: four throw-away `qa-*@asv.test` members (QaAlpha, QaBeta, QaGamma, QaDelta) in four isolated Playwright browser contexts on the in-memory store. The sign-in codes were read from the dev mailer log line `mailer.dev_only` and are not written here. Browser: Playwright MCP (Chromium), exact viewports with `setViewportSize`. Method per state: scroll the window to the very bottom (`scroll-behavior` forced to `auto`), open the smileys, then for the room input, "envoyer", the smileys summary and the first and last smiley (and the composer and "envoyer" of every open private window) take `elementFromPoint` at the centre of the element and check it returns the element itself, plus bounding box inside the viewport. Roles: **sender** = QaAlpha (opened the windows), **receiver** = QaBeta (got a window from QaAlpha).

## QA matrix

Gate ✅ · 🔴 Must 0 · 🟡 Should 0 · 🔵 Nice 0 — 13 checks: Pass 12 · Fail 0 · Mixed 0 · Not tested/N/A 1 (the security part, not run here)

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| FON-65a | FON | 1440 × 900, 1 open window, sender | Pass | PASS | input, "envoyer", summary, first and last smiley: `elementFromPoint` returns the element, all in view; composer bottom 548, dock top 600 (52 px free); page scrolls 120 px to the bottom | | 01 |
| FON-65b | FON | 1440 × 900, 1 open window, receiver | Pass | PASS | identical numbers to the sender (input [175,509,735,33], "envoyer" [1155,509,96,33]); window composer at y 853 clickable | | 02 |
| FON-65c | FON | 1440 × 900, 2 open windows, sender and receiver | Pass | PASS | dock 608 × 300 at y 600, all room targets OK, both private composers and "envoyer" OK (`privInput0/1`, `privSend0/1`) | | 03, 05 |
| FON-65d | FON | 1440 × 900, 1 open + 1 minimised, sender and receiver | Pass | PASS | dock 423 × 300 with one `.private-tab`; all room targets and the open window's composer OK | | 04, 06 |
| FON-65e | FON | 1440 × 900, 3 open windows (sender) | Pass | PASS | dock 916 × 300 at y 600, no horizontal overflow, room input and "envoyer" OK | | 19 (`-1440`) |
| UI-65f | UI | 800 × 900, 3 open windows | Pass | PASS | `.privates` still fixed (breakpoint is 768), dock 776 wide, no `overflow-x` scroll, room input [12,515] and "envoyer" OK | | 19 (`-800`) |
| UI-65g | UI | 1440 × 600 (short window), 2 open | Pass | PASS | composer bottom 242, dock top 300 (the dock is a fixed 300 px tall, half the window); all targets OK | | 14 |
| UI-65h | UI | 390 × 844, 1 open and 1 open + 1 minimised, sender and receiver | Pass | PASS | `.privates` is `position: static` after the room, `padding-bottom` of `.app` 0; at the very bottom the room input [12,308], "envoyer" [202,355], smileys [12,349…370] and the private composer [26,797] are all in view and not covered; 1 open + 1 min: input [12,267], "envoyer" [202,314] | | 07, 08, 10, 11 |
| UI-65i | UI | 390 × 844, 2 and 3 open windows | Pass | PASS | nothing overlays the room composer: after `scrollIntoView` the input, "envoyer" and summary return themselves from `elementFromPoint` (sender and receiver, page height 1717); a real click on "envoyer" posted "clic reel" in the room. At the very bottom the composer is above the fold (the windows fill the screen), reachable by scrolling up: see Observations | | 09, 12, 13 |
| UI-65j | UI | Rooms list with windows open, 1440 and 390 | Pass | PASS | list, "créer un salon" and search panels intact and clickable; at 390 the list is followed by the windows in the page flow; no horizontal scroll | | 16, 17 |
| UI-65k | UI | Dark scheme with 2 open windows (1440) and after a reload at 390 | Pass | PASS | legible, targets OK (`dark` probe all OK); no contrast regression seen | | 15, 20 |
| FON-04 | FON | JRN-04 regression: private window usable | Pass | PASS | window composer visible and clickable in every state above; receiver reply "reponse de beta" arrived in the sender's window; sender minimised, receiver wrote again: tab "QaBeta 1 non lu", unread cleared on restore | | 18 |
| UI-02 | UI | Console and network | Pass | PASS | no error or page error over the interaction blocks; no 4xx/5xx; one dev-only warning "WebSocket is closed before the connection is established" on reload (React StrictMode double effect on `/ws`, dev noise, not from the diff); `[vite]` debug lines | | |
| SEC / ROB-11 | SEC | Security probes and firmware safety | Fail | FAIL (known) | run in the security part below: SEC-02…10 PASS, SEC-01 FAIL (known, #69), ROB-11 N/A | #69 | 21 |

## Findings to act on

None.

## Observations (not defects, no issue filed)

- **Phones, 2 or 3 windows open**: the dock is in the page flow after the room, as the study says, so at the very bottom the screen shows the windows (each 438 px) and the room composer sits above the fold; writing in the room means scrolling up. Nothing covers it. Suggest, for the owner to decide later, a small "salon" link or the unread tabs above the composer if testers complain.
- The "Si l'adresse peut recevoir un code…" notice stays after sign-in and over the room: already filed as #68.
- Private windows are not restored after a reload (resume restores rooms only): not part of #65, not tested further.
- Vertical blank area under the composer on desktop (52 px between the composer and the dock at 900 px, 352 px reserved under the page) is the intended reserve; with a window of 300 px and a reserve of 340 px the 40 px gap is invisible to testers.

## Not tested

- SEC-01…SEC-10 and ROB-11: run in the security part below.
- Firefox and WebKit: `:has()` is the new CSS primitive in the diff; `:has()` is supported by current Firefox and Safari but was not run here (level `pass`, Chromium only). Would be unblocked by a Playwright run with `--browser firefox` / `webkit`.
- Real phone (MOB), JRN-04 cap of 3 windows (needs a fifth member).
- Screen reader behaviour of the dock (A11Y at level `full`).

## Delta vs previous report

`2026-11-02-test-plan-smoke.md` (f9970ba) and the full pass `2026-10-24-full-pass.md` (c470f1a): the A11Y failure #65 of the full pass ("private windows cover the room input") is fixed on this SHA: fixed 1, still failing 0, new 0.

Screenshots (`docs/architecture/qa/2026-11-02-65-NN-*.png`): 01 sender 1 open 1440 · 02 receiver 1 open 1440 · 03 sender 2 open 1440 · 04 sender 1 open + 1 min 1440 · 05 receiver 2 open 1440 · 06 receiver 1 open + 1 min 1440 · 07 sender 1 open + 1 min 390 · 08 receiver 1 open + 1 min 390 · 09 sender 2 open 390 · 10 sender 1 open 390 · 11 receiver 1 open 390 · 12 sender 2 open 390 scrolled to composer · 13 sender 2 open 390 bottom · 14 sender 2 open 1440 × 600 · 15 sender dark 1440 · 16 rooms list 1440 · 17 rooms list 390 · 18 minimised unread 1440 · 19 sender 3 open 1440, 800, 390 · 20 after reload dark 390.

## Security part

Security probes SEC-01…SEC-10 on the head SHA, run by qa-tester · Opus 5.5 (part `security`, level `pass`). Product code is unchanged since debc8ce (fd6cacc adds only this report), so the verdicts hold for both.

| Level | Head SHA | Environment | Targets | Agent / model |
|---|---|---|---|---|
| pass (security part) | fd6cacc (product code debc8ce) | local only: dev server `http://localhost:5173` (Vite + Node transport on `127.0.0.1:8787`) and own production build `pnpm build` served by the Node transport on `http://localhost:8799` (`ASV_STATIC_ROOT=dist`, no `ASV_TUNNEL`, dev mailer, in-memory store) | W, A | qa-tester · Opus 5.5 |

Rules of engagement. Allowed hosts: `localhost`, `127.0.0.1` only; no redirect followed; no response left the list. Accounts: throw-away members `qa-seca@asv.test` (browser, Playwright MCP Chromium, 921 × 892 viewport) and `qa-secb@asv.test` (Node `ws` script), guests `QaSecGuest`, `QaFlood`, `QaRate0…7`; sign-in codes read from the dev mailer log (`mailer.dev_only`) and not written here. Bursts: 20 room posts 120 ms apart, 8 entries 150 ms apart, all local. The e-mail route uses the dev mailer (nothing sent). ROB-11 (firmware safety) is `N/A`: no firmware in asv, and the test plan does not list it.

Scope note. The diff is CSS only (`src/web/styles.css`: a custom property, `:has()` padding, phone dock `position: static`, no `url()`, no `@import`); it cannot change headers, cookies, origin checks or server validation. The probes were re-run in full anyway, with SEC-04 extended to the private window the diff restyles.

### Security matrix

Gate ✅ for the security part · 🔴 Must 0 · 🟡 Should 1 (known, #69) · 🔵 Nice 0 — 11 checks: Pass 9 · Fail 1 · Mixed 0 · Not tested/N/A 1

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| SEC-01 | SEC | Security headers | Fail | FAIL (known) | `curl -I` on `/`, `/assets/*.css`, `/api/stats`, a 404, on the production build: CSP `default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` (no `unsafe-inline`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, COOP and CORP `same-origin`, `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection: 0`, `/api/stats` `Cache-Control: no-store`, no `Server` or `X-Powered-By`; still no `Permissions-Policy` and no explicit `object-src 'none'` (falls back to `default-src 'self'`); HSTS only in tunnel mode (not run). Vite dev server `/` has no headers (dev only, the transport sets them) | #69 | |
| SEC-02 | SEC | Cookies | Pass | PASS | after member sign-in: one cookie `asv_device`, `HttpOnly`, `SameSite=Lax`, `Path=/`, host-only, 30 days, value 43 chars (not recorded); `Secure` off on plain HTTP by design (BR-086, tunnel mode sets it, #58); `document.cookie` empty; storage: `sessionStorage` key `asv.session` only, `localStorage` empty | #58, #70 (N9 `__Host-`) | |
| SEC-03 | SEC | Origin, CORS, CSWSH | Pass | PASS | WS upgrade on `/ws` (8799 and 8787): `Origin: https://evil.test` → 403, `Origin: null` → 403, no Origin → 403, own origin → 101; `POST /account/sign-out` with either foreign origin → 403; `/api/stats` with a foreign origin: no `Access-Control-*` header; `OPTIONS` preflight → 404 | | |
| SEC-04 | SEC | XSS (room and private window) | Pass | PASS | QaSecB sent `<img src=x onerror=alert(1)>`, `"><svg onload=alert(1)>`, `<script>alert(1)</script>` privately to QaSecA and the first two in room Blabla; QaSecA's page shows all five as text (`.private-lines li` text equals the payload), 0 new `img`/`svg`/`script` elements, no `img[src=x]`, no `svg[onload]`, no dialog, no CSP violation in the console | | 21 |
| SEC-05 | SEC | Authn and authz | Pass | PASS | before `enter`: `postRoom`, `requestCode`, `verifyCode`, `sendPrivate`, `listOpenReports`, `deleteAccount`, `search` → `error: forbidden`; forged resume token → `resumeRefused`. As a guest: `listOpenReports`, `warn`, `expel`, `closeReport`, `removeRoom`, `confirmSuspension` → `error: invalid` (no privileged action); `deleteAccount`, `signOutEverywhere` → `warning: notSignedIn`; `sendPrivate` → `error: accountRequired`; `closePrivate` on a conversation id that is not the caller's → silently ignored, no data returned | | |
| SEC-06 | SEC | Input limits | Pass | PASS | bad JSON, no `type`, unknown type, wrong types, negative `seq`, `null` payload, array root, room text of 2 001 chars, query of 65 chars, empty `roomId` → `error: invalid` with message `invalid`; unknown fields (`role`, `isModerator`) and a `__proto__` key are stripped, the search still answers; a 70 000-byte frame closes that socket with 1009, and a new socket is served at once; the probed socket stayed usable | | |
| SEC-07 | SEC | Rate limits | Pass | PASS | 20 room posts 120 ms apart: 5 `roomMessage` then 15 `warning: flood` (BR-021, 5 per 10 s); 8 entries 150 ms apart from one IP after 2 earlier ones: 3 `entered` then 5 `entryRefused: rate` (5 per minute). Private messages share the same flood counter (`countMessage` in `src/domain/private.ts`), read in the code, not burst-tested. Lockout of other users not testable from one IP (all probes from 127.0.0.1) | | |
| SEC-08 | SEC | Error leaks | Pass | PASS | 404 body `404 Not Found` (13 bytes, text/plain); WS errors `{"code":"invalid","message":"invalid"}`; `POST /account/device` with bad JSON or wrong types → 400 empty body; `PUT`, `DELETE`, `TRACE` → 404; no stack, path or version in any answer or in the server log | | |
| SEC-09 | SEC | Bundle | Pass | PASS | `pnpm build`: `dist/` = `index.html`, one JS (289 kB), one CSS (7 kB), 0 `.map`; `/assets/*.js.map`, `/.env`, `/.git/config`, `/assets/../../package.json` and URL-encoded traversal → 404; only URLs in the bundle: `react.dev/errors/` and W3C namespaces; no key or token pattern; `gitleaks detect --no-git --source dist`: no leaks | | |
| SEC-10 | SEC | Third parties | Pass | PASS | production build, guest then member, room and private window: every resource from `localhost:8799` only (`performance` entries and Playwright network list); `/api/stats` polled every 30 s (by design); console: only the known favicon 404 (#62) | #62 | |
| ROB-11 | ROB | Firmware safety | Not tested/N/A | N/A | no firmware in asv; not listed in the test plan | | |

### Findings to act on (security part)

1. 🟡 Should — SEC-01 `Permissions-Policy` and `object-src 'none'` still missing → already filed #69, no new issue.

No new security finding; nothing for a private advisory.

### Product observation from the security run (for the product gate, not a security finding)

- **Room "envoyer" covered at the default scroll position.** At 921 × 892 (Playwright default window), as the receiver QaSecA in room Blabla, a private window from QaSecB opened while the page was at `scrollY 0`: `elementFromPoint` at the centre of the room "envoyer" [798, 631, 96, 33] returns the private window (dock [594, 592, 300, 300]); the room input itself stays clickable. Scrolling the page down 124 px (the reserve added by debc8ce) uncovers it ("envoyer" [798, 507] → itself). The product part measured every state after scrolling to the very bottom, so this state was not covered; same geometry is expected at 1440 × 900 (product numbers: "envoyer" x 1155–1251 under the dock x 1128–1428 until the page is scrolled 120 px). This is the acceptance of #65 itself (the PR's own issue, still open), so no new issue was filed; the caller decides whether it holds the merge. Screenshot 21 shows it. Possible directions (not applied): scroll the page to the bottom when the first window docks, or size the room panel to `100dvh` minus the dock height instead of padding the page.

### Not tested (security part)

- HSTS and the `Secure` cookie in tunnel mode (JRN-12): needs a local run with `ASV_TUNNEL=1` behind TLS.
- Lockout of other users by the per-IP entry quota: needs a second source IP.
- Private message burst (shared counter read in the code only).

### Delta vs previous security run

`2026-11-02-code-step-resume.md` (e774c8c): fixed 0, still failing 1 (SEC-01, #69), new 0.

Screenshot: 21 `2026-11-02-65-21-sec04-private-and-room-xss-as-text-921.png` (room and private window showing the payloads as text; also shows the covered room "envoyer").

## Re-run on ce90fc5

Product part, level `pass`, run by qa-tester · Sonnet 5.5 after fix B (ce90fc5, plus docs commit c42a17f on top). It closes the gap of the first pass, which measured only scrolled-to-bottom states: every check below starts at **scrollY 0**, with the smileys closed, then with them open, then after scrolling to the bottom. The security part is not re-run here: fix B touches `src/web/styles.css` and `RoomScreen.tsx` only (scroll code, no server, header, cookie or input path); the SEC rows above stay on debc8ce / fd6cacc.

| Level | Head SHA | Environment | Targets | Agent / model |
|---|---|---|---|---|
| pass (product part) | ce90fc5 (branch head c42a17f, docs only on top) | local: `asv-dev` (Vite `http://localhost:5173` + Node transport `127.0.0.1:8787`, dev mailer, in-memory store) | W | qa-tester · Sonnet 5.5 |

Method. Playwright MCP (Chromium), four isolated contexts: members QaAlpha, QaBeta, QaGamma, QaDelta (throw-away `qa-*@asv.test`, codes read from the dev mailer log and not written here) plus five guests QaGuest1…5 for the member list. For each viewport (1440 × 900, 921 × 892, 1440 × 600, 800 × 700), for sender (QaAlpha, opened the windows) and receiver (QaBeta, QaGamma, QaDelta got windows): `elementFromPoint` at the centre of the room input, room "envoyer", smileys summary, and (smileys open) first and last smiley, must return the element and the element must lie inside the viewport; the same for the composer and "envoyer" of every open private window; then the same after `scrollTo(bottom)`. Page scroll (`scrollHeight` vs `innerHeight`, `scrollWidth` vs `innerWidth`) and the lines and members panel geometry are read at the same time. States: 0 windows, 1 open, 1 minimised only, 1 open + 1 minimised, 2 open, 3 open. Phones: 390 × 844 viewport, `scrollIntoView` then `elementFromPoint`.

### QA matrix (re-run)

Gate ✅ (no Must) · 🔴 Must 0 · 🟡 Should 2 (#83, #84) · 🔵 Nice 1 (#85, two failing rows) — 16 checks: Pass 12 · Fail 4 · Mixed 0 · Not tested/N/A 0

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| FON-65m | FON | scrollY 0, 1 open window, sender and receiver, 1440 × 900 / 921 × 892 / 1440 × 600 / 800 × 700 | Pass | PASS | room input, "envoyer", summary, first and last smiley (smileys open) all return themselves and lie in the viewport at scrollY 0 and after scrolling; dock [1128,600,300,300] at 1440 × 900, [609,592,…] at 921 × 892; private composer and "envoyer" reachable. The case that failed on debc8ce (921 × 892, "envoyer" under the dock at scrollY 0) is fixed | | 22, 23 |
| FON-65n | FON | 0 windows, 1 minimised only, 1 open + 1 minimised (sender and receiver), 4 viewports | Pass | PASS | 0 windows: no dock, no reserve, lines 458 of 1124 px visible 653 px at 1440 × 900; tab only: dock 89 × 33; 1 open + 1 min: dock 397 / 407 × 300; every target OK in all four viewports at scrollY 0 and bottom | | 24, 27, 40 |
| FON-65o | FON | 2 open and 3 open windows (sender and receiver), 4 viewports | Pass | PASS | dock 608 × 300 and 916 × 300 (897 / 776 wide at 921 / 800 px, `max-width` + horizontal scroll inside the dock, none on the page); all room targets and all private composers and "envoyer" OK | | 25, 26, 28 |
| UI-65p | UI | The page has no vertical scroll on the room screen at desktop | Pass | PASS | `scrollHeight == innerHeight` and no horizontal overflow in every state and viewport above (900/900, 892/892, 600/600, 700/700), `scrollY` stays 0 | | 22…28 |
| UI-65q | UI | Lines panel scrolls inside and follows new messages only at the bottom | Pass | PASS | 1440 × 900, 3 windows, QaGamma posted 10 long messages 2.2 s apart (flood limit respected): lines scrollTop + clientHeight == scrollHeight after each (462 + 326 = 788); scrolled to 0, two more messages arrived, scrollTop stayed 0 (788 → 893 px of content); scrolled back to the bottom, the next message followed (672 + 326 = 998); 5 px above the bottom still follows (777 + 326 = 1103) | | 29 |
| UI-65r | UI | Tab switching keeps the layout | Pass | PASS | Blabla → Poésie → Blabla: Poésie panel 326/326 (empty), back in Blabla the panel is at the bottom (798 + 326 = 1124), page still no scroll, tab bar intact | | |
| UI-65s | UI | Members panel scrolls inside with many members | Pass | PASS | 9 members at 1440 × 700: panel 126 px of 242, `scrollTop` reaches 116, the last member is hit by `elementFromPoint`, the page does not scroll; at 1440 × 600 the panel is 26 px of 195 (see #83) | | 35 |
| UI-65t | UI | Search overlay and account overlay at 1440 × 900 and 800 × 700 | Pass | PASS | `.overlay` fixed top right [1088,128,340,162…272], every control returns itself, search "Qa" returns results, both close | | 30, 31 |
| UI-65m | UI | Chat readable on short desktop windows with a docked window | Fail | FAIL | at 1440 × 600 the lines panel is **24 px** (content 53 px, less than one line) and the members panel 24 px with any dock, even one minimised tab (dock 89 × 33): the reserve is a fixed `--dock-height` + gap = 340 px; 1440 × 700 about 125 px, 800 × 700 113 px; with 0 windows the same 1440 × 600 gives 353 px. Regression compared with debc8ce (page scroll) on short desktops | #83 | 32, 34 |
| UI-65n | UI | Overlays usable at 1440 × 600 with the dock | Fail | FAIL | `.overlay` z-index 10 under `.privates` 15: at 1440 × 600 with 3 windows (dock y 300) the account buttons "supprimer mon compte" and "fermer" and the lower search results are under the dock (`elementFromPoint` returns the window); click on "fermer" times out; keyboard focus + Enter closes it; Escape does not | #84 | 32 |
| UI-65o | UI | Own message while the lines panel is scrolled up | Fail | FAIL | scrollTop stays 0 after the author posts (1124 px of content): the author does not see their own message | #85 | |
| UI-65p2 | UI | Pseudo menu in the scrolled members panel | Fail | FAIL | the menu of the last visible member is clipped by the panel (`position: absolute` in `overflow-y: auto`): "message privé" and "ignorer" are not hit until the panel is scrolled a second time (scrollTop 116 then 174); at 1440 × 600 the second item is under the composer | #85 | 34, 35 |
| UI-65h2 | UI | Phones 390 × 844, no regression | Pass | PASS | 3 open, 2 open + 1 min, 1 open + 2 min, receiver 2 open, 1 open + 1 min, 0 windows: `.privates` is `position: static` after the room, `padding-bottom` of `.app` 12 px, no horizontal scroll, input, "envoyer", summary and smileys OK after `scrollIntoView`, every private composer OK; lines panel in the page flow (`overflow: visible`, 2594 px for 10 long messages, no auto-follow: same as debc8ce) | | 36, 37, 38, 39 |
| UI-65k2 | UI | Dark scheme glance | Pass | PASS | 1440 × 900 with 3 windows and 390 × 844: legible, all targets OK, overlays unaffected | | 41, 42 |
| UI-02 | UI | Console | Pass | PASS | `consoleMessages` and `pageErrors` of the nine pages: no error, no page error; the only warning on each load is the dev-only React StrictMode "WebSocket is closed before the connection is established" on `/ws` (already noted in the first pass); the notice "Si l'adresse peut recevoir un code…" persists over the room (#68) | | |
| FON-04 | FON | JRN-04 regression | Pass | PASS | alpha → beta, gamma, delta windows, replies and `beta to gamma` / `beta to delta` arrived, minimise and restore from the tab (`ouvrir QaBeta`) work on sender and receiver | | 24, 27 |

### Findings to act on (re-run)

1. 🟡 Should — UI-65m: chat lines and members panels shrink to about one line on short desktop windows while a dock is shown → #83. Suggested direction (not applied), in `src/web/styles.css`: keep the fit-to-viewport block under `@media (min-width: 768px) and (min-height: 720px)` and use the phone flow below that height (`.lines { min-height: 50vh; }`, `.privates { position: static; max-width: none; margin-top: var(--gap); }`). Alternative: reserve the real dock height instead of the fixed 300 px.
2. 🟡 Should — UI-65n: account and search overlays under the dock at 1440 × 600 → #84. One-line fix (not applied): `.overlay { z-index: 16; }`.
3. 🔵 Nice — UI-65o and UI-65p2: own message does not scroll the lines down when the reader scrolled up; pseudo menu clipped in the members panel → #85. Suggested for the first: `atBottom.current = true` in the send handler of `RoomScreen.tsx`.

The acceptance of #65 itself (no window covers the room composer, at any scroll position) is met: 0 failing hit-tests over 4 viewports × sender and receiver × 0 / 1 / 1 min / 1+1 min / 2 / 3 windows, at scrollY 0 and after scrolling. Fix B trades it for #83 on short desktop windows, so the owner decides whether #83 holds the merge (suggested: fix before merge, it is a CSS block and the threshold test is quick).

### Observations (no issue)

- The reserve is the full 300 px + gap even when the dock holds only minimised tabs (33 px tall): part of #83.
- The orange notice banner (#68) takes about 110 px at the top of every desktop screen and compounds #83 at short heights.
- Phones: the lines panel grows with the room and does not auto-follow new messages (page flow); unchanged from debc8ce, not part of fix B.
- Firefox and WebKit not run (`:has()` and `100dvh`): still `NOT TESTED`.

### Not tested (re-run)

- SEC-01…10 and ROB-11 on ce90fc5 (security part not run; the diff contains no server, header or storage change).
- Firefox, WebKit, a real phone, the cap of 3 windows (a fifth member), screen reader.

### Delta vs the first pass (debc8ce)

Fixed 1 (room "envoyer" under the dock at scrollY 0, found by the security part); new 3 (#83, #84, #85); unchanged: phones, dark scheme, console.

Screenshots (`2026-11-02-65-NN-*.png`): 22 sender 1 open 1440 scrollY 0 · 23 receiver 1 open 1440 · 24 sender 1 open + 1 min 1440 · 25 sender 2 open 1440 · 26 sender 3 open 1440 · 27 receiver 1 open + 1 min 1440 · 28 receiver 3 open 1440 · 29 lines follow, 3 open 1440 · 30 search overlay 1440 · 31 account overlay 1440 · 32 account overlay under the dock 1440 × 600 (#84, #83) · 33 members menu 1440 · 34 members menu 1440 × 600 · 35 members scrolled, menu clipped 1440 × 700 · 36 sender 3 open 390 · 37 sender 2 open + 1 min 390 · 38 sender 1 open + 2 min 390 · 39 receiver 390 · 40 receiver 0 windows 1440 · 41 dark 1440 · 42 dark 390. Note: shot 35 was taken with the viewport at 1440 × 700 on QaBeta's page.

## Re-run on 5669e7d

Product part, level `pass`, run by qa-tester · Sonnet 5.5 after the fixes for #83, #84 and #85 part 1 (5669e7d: `(min-width: 768px) and (min-height: 720px)` gate for the fit-to-viewport layout and the fixed dock, `.overlay` z-index 16, own post brings the lines back to the bottom). Study: `web-ui/04-class-client-state.md` (Room screen) and `07`. The security part is not re-run (CSS and client scroll code only; SEC rows stay on debc8ce / fd6cacc). Issues are not closed here: the owner or the developer decides.

| Level | Head SHA | Environment | Targets | Agent / model |
|---|---|---|---|---|
| pass (product part) | 5669e7d | local: `asv-dev` (Vite `http://localhost:5173` + Node transport `127.0.0.1:8787`, dev mailer, in-memory store) | W | qa-tester · Sonnet 5.5 |

Method. Playwright MCP (Chromium), four isolated contexts: QaAlpha, QaBeta, QaGamma, QaDelta (throw-away `qa-*@asv.test`, codes read from the dev mailer log, not written here). QaAlpha opened three private windows (QaBeta, QaGamma, QaDelta) and wrote to each. For 1440 × 900, 921 × 892, 1440 × 600 and 800 × 700: `elementFromPoint` at the centre of the room input, "envoyer", smileys summary (also open) and every private composer and "envoyer", must return the element and lie in the viewport, at scrollY 0 and after scrolling to the bottom; plus a sweep every 20 px of scroll over the whole page height (13 steps at 1440 × 600, 10 at 800 × 700) for the room composer and the private composers. The page geometry, the dock `position` and the `.lines` min-height are read at the same time.

### QA matrix (re-run on 5669e7d)

Gate ✅ (no Must) · 🔴 Must 0 · 🟡 Should 0 · 🔵 Nice 1 (#85 part 2, unchanged, not re-checked) — 13 checks: Pass 13 · Fail 0 · Mixed 0 · Not tested/N/A 0

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| UI-83a | UI | #83: short desktop 1440 × 600, 3 windows | Pass | PASS | `.privates` is `position: static` after the screen (row, [175,530,1076,300]); lines panel 300 px (`min-height: 300px` = 50vh, was 24 px), members 300 px; page scrolls as a whole (842 for 600); room input, "envoyer", summary and smileys hit-tested OK at scrollY 0 and bottom; 13-step sweep: 0 covered target; the three private composers are below the fold at scrollY 0 (reachable by scrolling, OK at the bottom), no horizontal overflow | #83 | 45, 46 |
| UI-83b | UI | #83: 800 × 700, 3 windows | Pass | PASS | dock static [12,580,761,300], lines 350 px (was 113 px); same hit-tests, 10-step sweep: 0 covered target | #83 | 47, 48 |
| FON-65m2 | FON | Tall desktops 1440 × 900 and 921 × 892 at scrollY 0, 3 windows, smileys closed and open, and after scrolling | Pass | PASS | `position: fixed` dock [512,600,916,300] and [12,592,897,300]; room input, "envoyer", summary, both private composers and "envoyer" return themselves, page does not scroll (900/900, 892/892); lines 330 / 322 px | | 43, 44 |
| FON-65n2 | FON | 0 windows, tab only, 1 open, 1 open + 1 minimised, 2 minimised + 1 open, 2 tabs only, receiver 1 open and 1 minimised, 1440 × 900 and 921 × 892 | Pass | PASS | dock sizes 705 × 300 (1 min + 2 open), 500 × 300, 192 × 33 (2 tabs), receiver 300 × 300 then 99 × 33; no page scroll, every target OK in each state (41 hit-tests, 0 bad); 0 windows already measured in the last pass, unchanged code path | | 53, 54, 55 |
| UI-84a | UI | #84: account overlay above a 3-window dock | Pass | PASS | `.overlay` z-index 16 over dock 15; at 1440 × 600 scrolled so the dock sits at y 288 the overlay [1073,128,340,272] overlaps it and "me déconnecter…", "supprimer mon compte" and "fermer" all return themselves; a real click on "fermer" closes it. Same at 1440 × 720 / 900 and 800 × 700 | #84 | 49, 50 |
| UI-84b | UI | #84: search overlay with results above the dock | Pass | PASS | overlay [1073,128,340,270] over dock [175,288,1076,300] (overlap), input, "rechercher", "annuler" and the three results hit OK; real click on "annuler" closes it. At 1440 × 720 the fixed dock (y 420) and the overlay (bottom 398) never overlap | #84 | 51, 50 |
| UI-85a | UI | #85 part 1: own post brings the lines back to the bottom | Pass | PASS | 1440 × 900: lines scrolled to 0 (431 px of content), own post by "envoyer": scrollTop 126 + 326 = 452 (at the bottom); same by Enter (147 + 326 = 473); a post by another member while scrolled up leaves scrollTop at 0 (content 494) | #85 | 52 |
| UI-65h3 | UI | Phones 390 × 844, no regression | Pass | PASS | 2 open windows: dock static after the room, all composers and "envoyer" OK after `scrollIntoView`, no horizontal scroll, lines min-height 422 px (50vh) and growing with content; receiver 1 window OK | | 56, 59 |
| UI-65j2 | UI | Rooms list with windows open, 390 and 1440 × 900 | Pass | PASS | 390: dock static, no horizontal scroll; 1440 × 900: dock fixed [820,600,608,300], "créer" and "rechercher" return themselves, no page scroll | | 57, 58 |
| FON-04b | FON | JRN-04 round trip | Pass | PASS | alpha → beta window, beta's reply `reponse` and alpha's `retour console` in the alpha window; minimise, restore from the tab (`ouvrir QaBeta`), close work | | 53, 54 |
| UI-02b | UI | Console | Pass | PASS | listeners on QaAlpha and QaBeta during the account and search overlays, the private round trip and the resize: 0 error, 0 page error, 0 warning. The default tab shows only the dev-only React StrictMode warning "WebSocket is closed before the connection is established" and ERR_CONNECTION_REFUSED / `/api/stats` errors dated before this run (the dev server was down between runs); not product defects. Login steps were done without listeners | | |
| A11Y-65b | A11Y | Overlay controls reachable by pointer above the dock | Pass | PASS | see UI-84a and UI-84b (every control returns itself, close works by click) | #84 | 49, 51 |
| UI-83c | UI | Room screen at the threshold (1440 × 720 fixed layout, below 720 flow) | Pass | PASS | at 1440 × 720 the dock is fixed, at 1440 × 600 and 800 × 700 it is static; the switch happens at 720 px height | #83 | 50 |

### Findings to act on (re-run on 5669e7d)

None new. #83, #84 and #85 part 1 behave as the fix describes on this head. The verdicts above are the evidence for the owner or developer to close them.

### Observations (no issue)

- At 1440 × 600 and 800 × 700 the private composers sit below the fold at scrollY 0 (dock in the page flow, by design of #83); they are reachable by scrolling and never covered.
- The search overlay has no close button until a search has run ("annuler" appears with the results); the tab "rechercher" toggles it. Not part of #84; the study decides if a permanent close is wanted.
- #85 part 2 (pseudo menu clipped in the scrolled members panel) was not re-checked: no change in this diff.
- The orange notice banner (#68) still takes about 110 px at the top; at 1440 × 600 the lines panel is 300 px nevertheless.
- A stray page on `http://localhost:8799/` was already open in the Playwright browser before this run (earlier production-build run); not used.

### Not tested (re-run on 5669e7d)

- SEC-01…10 and ROB-11 on 5669e7d (security part not run; no server, header, cookie or input change).
- #85 part 2, Firefox, WebKit, a real phone, the cap of 3 windows (a fifth member), screen reader, dark scheme (not re-run; no colour change in the diff).

### Delta vs the ce90fc5 re-run

Fixed 3 (UI-65m → #83, UI-65n → #84, UI-65o → #85 part 1); still failing 1 (UI-65p2, #85 part 2, not re-run); new 0.

Screenshots (`2026-11-02-65-NN-*.png`): 43 sender 3 open 1440 × 900 · 44 921 × 892 · 45 1440 × 600 scrollY 0 · 46 1440 × 600 scrolled to bottom · 47 800 × 700 scrollY 0 · 48 800 × 700 bottom · 49 account overlay over the dock 1440 × 600 · 50 account overlay 1440 × 720, and search overlay (fixed dock) 1440 × 720 · 51 search overlay over the dock 1440 × 600 · 52 own post follows 1440 × 900 · 53 sender 1 min + 2 open · 54 sender tabs only · 55 receiver 1 open · 56 sender 2 open 390 · 57 rooms list 390 · 58 rooms list 1440 · 59 receiver 390.
