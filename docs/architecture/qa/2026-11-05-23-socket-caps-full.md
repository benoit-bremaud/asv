# QA full — upgrade limits per IP and unbound socket close, issue #23 (2026-11-05)

Full QA pass of PR #116 (BR-089) on the local production build: every JRN-14 case passes, the BR-088 frame budget still holds, and the only new finding is a Nice about the generic offline banner shown to a tab refused with 429; the gate stays red on three pre-existing P0 items (A11Y-02, A11Y-05, PERF-01) that the diff does not touch.

| Level | Head SHA / base | Environment | Targets | Agent / model | Matrix page |
|---|---|---|---|---|---|
| full (product part; SEC probes run in the same pass, see below) | 77d7c17 / e3dc09e (`origin/main`, merge base) | local only (asv has no staging tier): own production build `http://127.0.0.1:8788` (`pnpm build`, then `tsx src/transports/node/main.ts` with `ASV_STATIC_ROOT=dist`, `ASV_LOG_FILE` and `ASV_VAULT_FILE` in a scratch folder, not tunnel mode, dev mailer, in-memory accounts) | W, A | qa-tester · Opus 5.5 | not published (orchestrator) |

Checklist: `33fcba30f63f`

**Plan.** Diff `e3dc09e...77d7c17`: `src/server/upgrade-limit.ts` (new per-IP and total limiter), `src/server/token-bucket.ts` (bucket extracted from `frame-budget.ts`), `src/server/hub.ts` (unbound close in the tick), `src/transports/node/server.ts` (limits before `handleUpgrade`, `refuseUpgrade` destroys the socket, release on close), tests, study and docs. Domains in: JRN-14 a…f first and in depth, then the BR-089 edges (refusal bytes, socket destroyed, failed handshakes and foreign origins, total cap), JRN-13 regression, the other journeys, every checklist domain that applies to W and A, SEC-01…SEC-10. Domains out: MOB (no native app), ROB-11 (no firmware), JRN-12 tunnel mode (needs the owner's tester secrets).

**Rules of engagement.** Allowed hosts: `127.0.0.1` only (asvchat.fr and the tunnel never touched). Scripted clients bound their source address to other loopback addresses (`127.0.0.9`, `127.0.0.20`…`127.0.2.3`) so each probe had its own per-IP budget, all on this machine. Accounts: throw-away `qa-*@example.test` members on the in-memory store; dev-mailer codes read from the server output, not written here. Deviation requested by the caller for BR-089: a loop of 100 upgrades from one IP, above the 20-call burst cap of the checklist; I added a 520-upgrade run over 26 loopback IPs to reach the 500-socket total cap. The production server was started through Bash because `.claude/launch.json` only has the Vite entries; it was stopped at the end.

**Tools.** Playwright MCP (Chromium) for the long-lived entry tab; Playwright 1.64.1 by script (Chromium, Firefox, WebKit, 10-tab context); Node `ws` 8 and raw `net` clients; `/proc/<pid>/fd` counts on the server process; axe-core 4.14.0; lhci with Lighthouse 12.6.1 (mobile, 3 runs); `curl`. `qa-doctor`: every required tool present, Orca missing (A11Y-14 NOT TESTED). Node 22.21.1 on this machine is below the `engines` floor (machine setup, not filed, as on 2026-11-03).

## QA matrix

Gate ❌ · 🔴 Must 3 (pre-existing P0 items, not from this diff) · 🟡 Should 0 new · 🔵 Nice 1 new — 82 checks: Pass 60 · Fail 9 · Mixed 1 · Not tested/N/A 12

### JRN-14 / BR-089 (the diff)

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-14a | FON | 10 tabs of one browser (one IP) all connect and chat | Pass | PASS | 10 pages of one Chromium context on 127.0.0.1: 10 sockets opened on load; entry in two batches of 5, 61 s apart (BR-007 allows 5 entries per IP per minute); all 10 joined Blabla, each posted once, every tab showed the 10 posts; no close on any socket; 14 sockets were open on that IP at the time (plus the MCP tab and 3 scripted sockets) | | 02, 03 |
| JRN-14b | SEC | A loop of 100 upgrades from one IP | Pass | PASS | 100 sequential upgrades from 127.0.0.9 in 80 ms: 20 × `101`, then 80 × `429` with `Retry-After: 10` (first refusal at index 20). Each opened socket sent `enter`: 5 entered (BR-007), the connection log got exactly 5 `open` lines, all for 127.0.0.9; the 80 refused upgrades wrote nothing | | |
| JRN-14c | SEC | 21st concurrent socket of one IP, budget full | Pass | PASS | the 20 sockets of (b) kept open, 22 s wait (bucket back to 20 tokens), 21st upgrade: `429`, `Retry-After: 10` | | |
| JRN-14d | SEC | A closed socket frees its place | Pass | PASS | `close()` of one of the 20, then an upgrade: `101`; the next one: `429` (back at the cap); `terminate()` of another (abrupt), then an upgrade: `101` | | |
| JRN-14e | FON | Entry screen left 10 min: close 1008 `unbound`, the page reconnects | Pass | PASS | observed, not simulated. Browser tab left on the entry screen from 11:07:53 UTC: close **1008 `unbound`** at t = 600.9 s, new socket open at 601.9 s, no banner left; a second time at 1203.5 s → 1204.5 s. A pseudo, age and the 18+ box typed between the two closes were still there after the second one, and ENTRER then entered and posted from that tab. Scripted: idle unbound socket closed 1008 `unbound` at 601.3 s; a socket that entered then left at 2 s closed at 603.3 s; an entered socket pinging every 25 s stayed open for the whole 11.5 min | | 01, 04, 05 |
| JRN-14f | PERF | Other chatters responsive during the loop | Pass | PASS | QaRttA and QaRttB in Blabla from 127.0.0.20, A pinging every 100 ms: RTT p50 / p95 / max = 1 / 1 / 1 ms before, 0 / 1 / 1 ms during the loop, 0 / 1 / 4 ms after; 12 posts A → B delivered in 0–6 ms; A and B never closed | | |
| JRN-14g | SEC | Refusal written on the raw socket, then the socket destroyed | Pass | PASS | raw bytes: `HTTP/1.1 429 Too Many Requests`, `Retry-After: 10`, `Content-Length: 0`, `Connection: close` (the `503` the same with its status line; `403` without `Retry-After`), server FIN 1 ms after the request. 20 half-open clients (never closing their side) refused `403`: server fd count 35 → 35; 30 half-open allowed upgrades from one IP: 35 → 55 (the 20 accepted sockets), the 10 refused held no descriptor; back to 35 when the clients left | | |
| JRN-14h | SEC | Foreign origin takes no token; failed handshakes release their place | Pass | PASS | 30 upgrades with `Origin: https://evil.test` from 127.0.0.31: 30 × `403`, then 21 allowed: 20 × `101` + 1 × `429` (budget untouched by the 403s). 19 allowed-origin upgrades without `Sec-WebSocket-Key` from 127.0.0.33: 19 × `400 Bad Request` from `ws`; 21 s later 21 good ones: 20 × `101` + 1 × `429` (no place leaked) | | |
| JRN-14i | SEC | Total cap of 500 sockets | Pass | PASS | 520 upgrades over 26 loopback IPs × 20: 499 × `101` (one more socket, the browser tab, was already open), 21 × `503` with `Retry-After: 10`; a fresh IP while full: `503`; after one close, a fresh IP: `101` | | |
| JRN-14j | USA | A tab refused with 429 (per-IP cap held by other sockets) | Pass | PASS | 19 scripted sockets plus the entered tab filled 127.0.0.1; a new tab got `429` four times (console: "Unexpected response code: 429", browser-generated), showed "Hors ligne, connexion en cours…" with ENTRER disabled, and came online by itself after the 19 were released (within the 30 s backoff step). Works as specified; the banner does not say why | #117 | 06, 07 |

### JRN-13 regression (BR-088)

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-13b | SEC | 200 frames at once | Pass | PASS | 200 `ping`: 40 `pong`, then close 1008 `tooManyFrames` (token bucket now shared with the upgrade limiter, same numbers as 9913901) | | |
| JRN-13c | SEC | 5 invalid frames | Pass | PASS | 5 × `error invalid`, then 1008 `invalidFrames` | | |
| JRN-13d | SEC | 4 invalid + 1 valid + 4 invalid | Pass | PASS | 8 × `error invalid`, 1 × `error forbidden`, socket open | | |
| JRN-13a | FON | Normal use never closed | Pass | PASS | the 10-tab run (JRN-14a), the 20-min entry tab (JRN-14e) and the 11.5 min scripted sockets were never closed by the frame budget | | 02 |

### Journeys JRN-01…JRN-12

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-01a | FON | Entry nominal | Pass | PASS | browser entry in Chromium, Firefox, WebKit and the 10 tabs | | 02, 08 |
| JRN-01b | FON | Refused pseudo / rate limit | Pass | PASS | BR-007 seen in JRN-14b (5 of 20 sockets entered); refused pseudo not re-run | | |
| JRN-02a | FON | Resume after a socket drop | Not tested/N/A | NOT TESTED | not re-run: the client resume path is unchanged by the diff; last evidence FL JRN-13e on 9913901 | | |
| JRN-02c | ROB | Server down and restart | Fail | FAIL (known) | down: "Connexion perdue, on se reconnecte…"; back: entry screen, "0 connecté", no explanation (in-memory store reset) | #70 | 10, 11 |
| JRN-02d | FON | Leave | Pass | PASS | scripted `leave`: socket kept, then closed 1008 `unbound` 10 min later (JRN-14e) | | |
| JRN-03a | FON | Join and post | Pass | PASS | three engines and 10 tabs | | 02, 08 |
| JRN-04a | FON | Private conversation | Pass | PASS | protocol level: two members on 127.0.0.70, `sendPrivate` A → B delivered as `privateMessage`; UI not re-run | | |
| JRN-05 | FON | Ignore | Pass | PASS | protocol level: after B ignores A, A's private message does not reach B, A sees its own | | |
| JRN-06 | FON | Directory search | Pass | PASS | protocol level: `search "Lyon"` returns QaMemA | | |
| JRN-07a | FON | Request a code, wrong code, right code | Pass | PASS | protocol level: wrong code `warning codeWrong` (4 tries left), right code `accountLinked`; the address never appears in the server output | | |
| JRN-08 | FON | Code step kept across a reload | Not tested/N/A | NOT TESTED | not re-run (client unchanged); last evidence FL on 9913901 | | |
| JRN-09c | FON | Sign out everywhere | Pass | PASS | protocol level: `accountUnlinked` | | |
| JRN-10a | FON | Delete my account | Pass | PASS | protocol level: `accountUnlinked`; retention notice still missing in the UI (#110, not re-run) | #110 | |
| JRN-11 | FON | Legal pages | Not tested/N/A | NOT TESTED | not re-run (unchanged); last evidence FL on 9913901 | | |
| JRN-12 | SEC | Tunnel mode | Not tested/N/A | NOT TESTED | needs the owner's tester secrets; BR-089 keys limits on the BR-085 client IP, unit-tested only | | |

### Checklist domains

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| FON-01 | FON | Nominal journey | Pass | PASS | journeys above | | |
| FON-02 | FON | Diff's paths and failure branches | Pass | PASS | JRN-14 a…j | | |
| FON-03 | FON | Boundaries | Pass | PASS | search 65 chars, post 2001 chars `invalid`; room name of 1 char `nameInvalid` | | |
| FON-04 | FON | Text inputs | Pass | PASS | HTML payloads shown as text | | 05 |
| FON-08 | FON | State transitions | Pass | PASS | entry form kept across two unbound closes; leave → unbound → closed; restart | | 04, 05 |
| FON-09 | FON | Error guessing, two tabs | Pass | PASS | 10 tabs posting in turn, no duplicate | | 02 |
| FON-12 | FON | Regression of the previous report | Pass | PASS | FL findings still open where expected (#64, #70, #98, #105, #107), no fixed one regressed; JRN-13 still passes | | |
| FON-13 | FON | Exploratory session | Pass | PASS | 30 min "frustrated user": a 21st tab, a form left half-filled for 10 min, a server restart; finding #117 | #117 | 06 |
| DAT-01 | DAT | Contract | Pass | PASS | refusals are plain HTTP statuses as BR-089 states; WebSocket close codes 1008 `unbound`, `tooManyFrames`, `invalidFrames`, 1009 as documented | | |
| DAT-02 | DAT | Persistence | Not tested/N/A | N/A | in-memory store by design in local mode | | |
| DAT-03 | DAT | Server-side validation | Pass | PASS | wrong type, unknown field stripped, over-cap refused | | |
| DAT-06 | DAT | One error model | Pass | PASS | `error {code}` / `warning {code}` everywhere | | |
| DAT-10 | DAT | Restart mid-session | Fail | FAIL (known) | see JRN-02c | #70 | 10, 11 |
| DAT-11 | DAT | `429` with `Retry-After` | Pass | PASS | `429` and `503` both carry `Retry-After: 10` | | |
| UI-01 | UI | Viewports 320, 390, 768, 1024, 1440, 844 × 390 | Pass | PASS | no horizontal scroll on entry and room in the three engines | | 08 |
| UI-02 | UI | Console and network | Pass | PASS | production build: only `/favicon.ico` 404 (#62); the 429 lines of JRN-14j are browser-generated for a refused handshake; WebKit "Refused to apply a stylesheet" comes from Playwright's screenshot caret style (reproduced on the entry screen with a bare screenshot, absent without one), not from the product | #62 | |
| UI-03 | UI | Firefox and WebKit | Pass | PASS | entry → Blabla → post in Firefox and WebKit at 1440 and 390 | | 08 |
| UI-04 | UI | Dark scheme | Pass | PASS | room legible in dark (body `rgb(27, 27, 47)`) | | 09 |
| UI-05 | UI | States | Pass | PASS | offline banner while refused, online after release; reconnect banner on server down | | 06, 07, 10 |
| UI-07 | UI | Visual tidiness | Not tested/N/A | NOT TESTED | not re-run (CSS unchanged); open items #104, #108, #109, #111 | | |
| UI-08 | UI | Favicon, 404 | Fail | FAIL (known) | `/favicon.ico` 404, plain-text 404 | #62, #70 | |
| A11Y-01 | A11Y | Keyboard only | Pass | PASS | entry by keyboard: pseudo → gender → age → city → 18+ → rules → ENTRER, outline visible on each, entered | | |
| A11Y-02 | A11Y | Semantics | Fail | FAIL (known) | no `h1` (axe `page-has-heading-one` on entry and room) | #64 | |
| A11Y-04 | A11Y | Contrast | Not tested/N/A | NOT TESTED | not re-measured (CSS unchanged); last evidence FL on 9913901 | | |
| A11Y-05 | A11Y | Target size | Fail | FAIL (known) | axe `target-size` serious on the room tab "×" | #105 | 08 |
| A11Y-11 | A11Y | axe-core 4.14 | Fail | FAIL (known) | entry: `page-has-heading-one`; room: `target-size` (serious), `listitem` (serious, new rule hit of the same `ol[role=log]` cause), `aria-allowed-role` (minor), `page-has-heading-one` | #105, #107 (comment), #64 | |
| A11Y-14 | A11Y | Screen reader | Not tested/N/A | NOT TESTED | Orca not installed (`sudo apt install orca`) | | |
| PERF-01 | PERF | Lab budget, production build, mobile | Fail | FAIL (known) | Lighthouse 12.6.1, 3 runs: LCP 2594 / 2551 / 2551 ms (budget 2500), CLS 0.024, TBT 41 / 0 / 2 ms, score 0.94 | #98 | |
| PERF-02 | PERF | Bundle and compression | Fail | FAIL (known) | 290 KB JS served without compression and without `Cache-Control` | #98 | |
| PERF-04 | PERF | Light load | Pass | PASS | 520 sockets in a few seconds, no error, RTT stable (JRN-14f, i) | | |
| ROB-01 | ROB | Socket cut | Pass | PASS | unbound close and refused tab both recover by themselves | | 04, 07 |
| ROB-02 | ROB | Backend down | Pass | PASS | reconnect banner, recovers when back (state reset: JRN-02c) | | 10, 11 |
| ROB-05 | ROB | Concurrency | Pass | PASS | 10 tabs, scripted members and probes in parallel, no race | | 02 |
| ROB-06 | ROB | Malformed input | Pass | PASS | upgrade without key → `400`, place released; 70 KB frame → 1009; server up throughout | | |
| ROB-07 | ROB | Logs | Pass | PASS | server output: no error or stack during the loops; refused upgrades write no line; e-mail addresses absent | | |
| USA-01 | USA | Heuristics on touched screens | Pass | PASS | the unbound close is invisible to the chatter (1 s, form kept) | | 04 |
| USA-03 | USA | Error messages | Mixed | FAIL | the refused tab shows the generic offline banner, nothing says the network has too many connections (Nice) | #117 | 06 |
| PRI-01 | PRI | No personal data in URL, storage, logs | Pass | PASS | `sessionStorage` holds `asv.session` only, `localStorage` empty, no query string; connection log lines hold the IP and pseudo of entered sockets only, as BR-089 and the RGPD rules state | | |
| PRI-02 | PRI | Consent | Not tested/N/A | N/A | no non-essential request: only `127.0.0.1:8788` contacted | | |
| PRI-04 | PRI | Account deletion | Pass | PASS | protocol level: `deleteAccount` signs the session out | | |
| MOB-03 | MOB | iOS | Not tested/N/A | NOT TESTED | no native app; no macOS | | |

### Security probes SEC-01…SEC-10

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| SEC-01 | SEC | Headers | Fail | FAIL (known) | `/` and `/api/stats`: CSP `default-src 'self'`, `script-src 'self'` (blocked an injected inline script during this pass), `frame-ancestors 'none'`, `base-uri 'none'`, nosniff, `Referrer-Policy: no-referrer`, COOP, CORP, `X-XSS-Protection: 0`, `no-store` on the API, no `Server` / `X-Powered-By`; still no `Permissions-Policy`, no `object-src 'none'` | #69 | |
| SEC-02 | SEC | Cookies | Not tested/N/A | NOT TESTED | no device cookie set in this pass (members signed in with `remember: false` from scripts); last evidence FL on 9913901; `__Host-` pending #95 | #95 | |
| SEC-03 | SEC | Origin, CORS, CSWSH | Pass | PASS | upgrade with `Origin: https://evil.test`: `403`, takes no upgrade token (JRN-14h), socket destroyed (JRN-14g); `POST /account/device` with a foreign origin: `403`; no `Access-Control-Allow-Origin` | | |
| SEC-04 | SEC | XSS | Pass | PASS | `<img onerror>` and `"><svg onload>` posted in Blabla: shown as text, 0 `img` / `svg` nodes in `main`, no dialog | | 05 |
| SEC-05 | SEC | Authn / authz | Pass | PASS | before entry `forbidden`; forged resume `resumeRefused`; guest `sendPrivate` `accountRequired`; moderator commands `invalid`; post in a room not joined `notMember`; account command as guest `notSignedIn` | | |
| SEC-06 | SEC | Input limits | Pass | PASS | over-cap and wrong types `invalid`, unknown field stripped, 70 KB frame 1009, server up | | |
| SEC-07 | SEC | Rate limits | Pass | PASS | upgrades 20 + 1/s per IP, 20 open per IP, 500 in total (JRN-14 b…i); frames 40 + 20/s (JRN-13); entries 5 / 60 s; other chatters not locked out (JRN-14f) | | |
| SEC-08 | SEC | Error leaks | Pass | PASS | 404 plain "404 Not Found"; bad JSON `400`; refusals have an empty body; no path, `.ts` or `Error:` in WebSocket answers | | |
| SEC-09 | SEC | Bundle | Pass | PASS | `dist/` one JS and one CSS, `.map` 404, no key or token; URLs only `react.dev` and `w3.org` library strings | | |
| SEC-10 | SEC | Third parties | Pass | PASS | only `127.0.0.1:8788` in every run | | |
| SEC-17 | SEC | Information leaks | Pass | PASS | `/.git/config`, `/.env`, `/package.json`, `/src/server/hub.ts`: 404 | | |
| ROB-11 | SEC | Firmware safety | Not tested/N/A | N/A | no firmware | | |

## Findings to act on

1. 🔴 Must (pre-existing, P0 item, not from this diff) — A11Y-05 room tab "×" under 24 px → #105.
2. 🔴 Must (pre-existing, P0 item) — A11Y-02 no `h1` → #64.
3. 🔴 Must (pre-existing, P0 item) — PERF-01 LCP 2.55–2.59 s on the uncompressed local build → #98 (owner may waive as on 2026-11-03: the tunnel compresses at the edge).
4. 🔵 Nice (new) — a tab refused with 429 shows only "Hors ligne, connexion en cours…" (JRN-14j, USA-03) → #117.
5. 🔵 Nice (known) — axe `listitem` (serious) is a second rule hit of the `ol[role=log]` cause → #107 (comment).
6. 🔵 Nice (known) — restart lands on the entry screen with no explanation → #70.

Observation, not a defect: BR-007 (5 entries per IP per minute) means 10 people behind one NAT need two minutes to all enter, even though BR-089 lets their 10 sockets connect at once. Both rules behave as specified; the owner may want to look at BR-007 against the NAT goal of #23.

Not filed: Node 22.21.1 below the `engines` floor (machine setup); WebKit CSP message from Playwright's screenshot style (tooling).

## Not tested

- JRN-02a, JRN-08, JRN-11, UI-07, A11Y-04: not re-run, the web client and CSS are unchanged by the diff; last evidence FL on 9913901. A re-run needs only a browser session.
- SEC-02: no device cookie set in this pass; re-run with "se souvenir de cet appareil" in the browser.
- JRN-12 tunnel mode, including BR-089 keyed on `CF-Connecting-IP`: needs `~/.config/asv/tester.env`; run on a local `ASV_TUNNEL` instance.
- A11Y-14: Orca missing (`sudo apt install orca`).
- MOB-03 and every MOB item: no native app, no macOS.
- DAT-02: N/A, in-memory store by design.
- Member journeys JRN-04…JRN-10 ran at protocol level only, not in the UI.

## Delta vs previous report

`2026-11-03-89-frame-limit-full.md`: finding 14 (no upgrade-rate cap per IP, #23) fixed and verified (JRN-14 a…j). JRN-13 still passes. Still failing: A11Y-02 (#64), A11Y-05 (#105), PERF-01 and PERF-02 (#98), SEC-01 (#69), UI-08 (#62), restart (#70). New: #117 (Nice); `listitem` added to #107.

Screenshots: `docs/architecture/qa/2026-11-05-23-<nn>-<step>.png` (numbers in the Shots column; 08 has one file per engine and width).
