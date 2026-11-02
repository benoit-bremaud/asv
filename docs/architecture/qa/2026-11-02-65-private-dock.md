# QA pass — private windows must not cover the room composer, issue #65 (2026-11-02)

QA pass on the running product for branch `fix/65-private-windows-room-input`: on 1440 × 900 and 390 × 844, on the sender and the receiver side, with one open window and with one open plus one minimised, the room input, "envoyer" button and smileys are fully visible and clickable. No finding.

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
