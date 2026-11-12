# QA campaign — crowd of chatters, cities and rooms, issue #147 (2026-11-12)

Exploratory multi-user campaign on the local production build: a scripted crowd of up to 520 sockets from distinct loopback IPs drove entries, rooms, privates, ignore, search, away/resume, waves and every per-IP and global limit, while Chrome (DevTools MCP), Firefox and WebKit watched busy rooms. The server held every limit and logged no error in any run; 3 new defects were filed (#151, #153, #154), #152 was closed as a duplicate of #70 N2, 2 known issues got fresh evidence (#24, #68), and every item waived from #131 is now run.

| Level | Head SHA / base | Environment | Targets | Agent / model | Matrix page |
|---|---|---|---|---|---|
| full (exploratory campaign; journeys mapped in § Journeys) | ba2c98e (`main`) | local only: production build (`pnpm build`, bundle `index-AsKiY00-.js`, `index-B4roNZ4y.css`), `tsx src/transports/node/main.ts` on `http://127.0.0.1:8788` (`ASV_STATIC_ROOT=dist`, `ASV_ALLOWED_ORIGINS=http://127.0.0.1:8788`, log and vault files in the scratchpad, dev mailer, in-memory accounts, per-process keys) | W | orchestrator · Opus 5.5 | not published |

Checklist: `61702fb560a9`

**Tools.** Chrome through the Chrome DevTools MCP plugin (window 956 × 905 for CQ-B01…B09 and B11…B13, isolated contexts `alba`, `clara`; `emulate` viewports, colour scheme and `Offline`; `evaluate_script`; `list_network_requests`; `get_network_request`; `list_console_messages`; `performance_start_trace`/`stop_trace`; `lighthouse_audit`, Lighthouse 13.4.1), Playwright 1.64.1 Firefox and WebKit for UI-03 only, `curl` for headers and probes, and a scratchpad crowd driver (`ws` from the repo) per the owner's decision A (435/500, 2026-11-12): the driver is not product code and is kept out of the repo; its source is annexed in [2026-11-12-147-crowd-driver.md](2026-11-12-147-crowd-driver.md).

**Crowd.** Each driver chatter binds its own source address in `127.0.0.0/8` (BR-085 reads the socket address), so per-IP limits apply per chatter as for real people; the limit cases then use one shared address on purpose. Profiles mix the three genders, ages 18 to 99 and 11 cities (with accents and hyphens, and none). An ambient crowd of 40 chatters (6 members) stayed connected during the browser checks, posting every 2.5 s in Blabla, Paris and Lyon, with waves of 5 leaving and re-entering every minute.

**Rules of engagement.** Host `127.0.0.1` only; asvchat.fr and the tunnel were not touched. Accounts on `example.test`; each dev-mailer code read from the server stdout and used once. The DevTools Chrome left running by an earlier session held the plugin profile; it was closed on the owner's decision A (410/500). The server was restarted between driver runs to reset its in-memory state.

## QA matrix

Gate ❌ · 🔴 Must 2 (#153, #154: P0 items A11Y-02 and A11Y-03) · 🟡 Should 1 (#151) · 🔵 Nice 0 new (#70 N2 re-seen)

Gate line: ❌ P0 accessibility sub-checks fail · crowd driver 26 PASS, 1 INFO (CQ-01…CQ-27) · browser 10 PASS, 3 FAIL, 1 MIXED (CQ-B01…B14) · SEC-01…SEC-10 run (9 PASS, SEC-01 FAIL known #69) · UI-01, UI-03, UI-04, ROB-02, A11Y-02, A11Y-03 run, closing the #131 waiver (UI-01 200 % zoom and UI-04 reduced-motion / forced-colors not run) · server stdout of driver runs 1–3 and the browser session (`grep -ci 'error\|exception'`): 0 · report: docs/architecture/qa/2026-11-12-147-crowd-campaign.md.

### Crowd driver (final run, fresh server)

| ID | Action | Expected | Observed | Result |
|---|---|---|---|---|
| CQ-01 | 60 chatters enter at once from 60 loopback IPs | 60 entered | 60 entered, refusals [] | PASS |
| CQ-02 | room list on entry | official rooms listed | Blabla(themed,0), Poésie(themed,0), Ciné(themed,0), Musique(themed,0), Paris(regional,0), Lyon(regional,0) | PASS |
| CQ-03 | 20 crowd chatters sign in with an e-mail code | 20 accountLinked | 20 linked | PASS |
| CQ-04 | 60 chatters join one official room (BR-023 cap 50) | 50 joined, 10 refused with a notice | 50 joined, refusals ["warning:full"], no answer 0 | PASS |
| CQ-05 | member lists on join | member count grows 1..50, no duplicates | max list 50, dup-free true | PASS |
| CQ-06 | 10 posts in a 50-member room | each member receives 10 roomMessage | received min 10 max 10 | PASS |
| CQ-07 | 12 chatters each create a user room | 12 created | 12 created | PASS |
| CQ-08 | a room owner creates a second room (BR-031) | refused with a notice | warning:alreadyOwner alreadyOwner | PASS |
| CQ-09 | one chatter joins rooms until BR-024 (10 rooms) | 10 accepted, 11th refused with a notice | in 10 rooms, refusal warning:tooManyRooms tooManyRooms | PASS |
| CQ-10 | directory search by city or pseudo | counts match the crowd profiles (pseudo or city match) | {"Paris":5,"paris":5,"Lyon":6,"Saint":0,"saint-etienne":5,"AIX-EN-PROVENCE":5,"Brest":5} vs exact-city-or-pseudo {"Paris":5,"paris":5,"Lyon":6,"Saint":0,"saint-etienne":5,"AIX-EN-PROVENCE":5,"Brest":5} | PASS |
| CQ-11 | 4 members open a private window to the same member (BR-043 cap 3) | receiver holds at most 3 windows; 4th sender told | receiver windows 3, messages 3; senders ["privateWindow\|privateMessage","privateWindow\|privateMessage","privateWindow\|privateMessage","warning:targetBusy"] | PASS |
| CQ-12 | a member opens 4 private windows (BR-043) | 3 opened, 4th refused with a notice | A got privateWindow\|privateMessage\|privateWindow\|privateMessage\|privateWindow\|privateMessage\|warning:tooManyWindows | PASS |
| CQ-13 | ignore in a 50-member room | neither sees the other's message (BR-042) | X saw Y: 0, Y saw X: 0 | PASS |
| CQ-14 | 7 posts in under 1 s (BR-021 5 per 10 s) | 5 delivered, 2 refused with a notice | delivered 5, notices ["flood","flood"] | PASS |
| CQ-15 | 10 sockets cut then resumed with the token | 10 memberAway then 10 memberBack seen by a watcher, 10 resumed | away 10, resumed 10, back 10 | PASS |
| CQ-16 | resume with a bogus token | resumeRefused | resumeRefused | PASS |
| CQ-17 | wave: 20 leave then 20 new chatters enter | 20 entered; blabla count = 40 | entered 20, room count 40 | PASS |
| CQ-18 | 6 entry attempts from one IP in 60 s (BR-007) | 5 entered, 6th refused `rate` | ["entered","entered","entered","entered","entered","rate"] | PASS |
| CQ-19 | 21 sockets from one IP (BR-089 cap 20) | 20 open, 21st 429 Retry-After 10 | opened 20, 21st 429 RA=10 | PASS |
| CQ-20 | 25 rapid upgrades from one IP (budget 20, +1/s) | about 20-21 accepted then 429 | 20 ok, then 429 | PASS |
| CQ-21 | 60 frames in a burst (BR-088 bucket 40) | socket closed 1008 tooManyFrames | {"code":1008,"reason":"tooManyFrames"} | PASS |
| CQ-22 | 5 invalid frames in a row (BR-088) | socket closed 1008 invalidFrames | {"code":1008,"reason":"invalidFrames"} | PASS |
| CQ-23 | 4 invalid, 1 valid, 4 invalid (count resets) | socket stays open | null | PASS |
| CQ-24 | 70 kB frame (cap 64 KiB) | socket closed 1009 | {"code":1009,"reason":""} | PASS |
| CQ-25 | open 440 more sockets to pass 500 total | 503 Retry-After 10 once the total is 500 | 503 x22, other {}, sample RA 10 | PASS |
| CQ-26 | a newcomer while at the total cap | refused 503 (not a crash) | entered false http 503 | INFO |
| CQ-27 | a newcomer after the crowd releases sockets | entered | entered true | PASS |

Two earlier driver runs are superseded: run 1 had driver bugs (profiles assigned after the IP counter moved, the flood window already used by CQ-06, private slots still full), run 2 hit a stale server whose wrapper `npx` was killed but not its `tsx` child. Neither is a product result; both are logged in [checklist.md](checklist.md).

### Browser checks (Chrome DevTools MCP unless stated)

| ID | Domain | Check | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|
| CQ-B01 | FON | Member sign-in in Chrome while 40 chatters are connected (Alba, F, 34, Paris; code read from the dev-mailer line) | PASS | account dialog "Connecté·e comme membre."; device cookie set | #68 (code-sent notice stays after success) | 01 |
| CQ-B02 | FON | Join Blabla with 40 members while the crowd posts every 2.5 s | PASS | "Membres (41)", ages and cities shown, lines arrive, `<script>alert(1)</script>` from a bot shown as text |  |  |
| CQ-B03 | FON | Open private windows to 3 members, then a 4th (BR-043) | FAIL | 3 windows with replies; the 4th opens empty, send gives "Tu as déjà 3 fenêtres privées ouvertes." (server `tooManyWindows`), but the 4th window stays and the typed text is lost | #151 | 02 |
| CQ-B04 | FON | Directory search across cities: `lyon`, `SAINT-ETIENNE`, `Nice`, `Pa`, `Lyo`, `zz` | PASS | Lyon 5, Nice 5 (accent and case folded), exact city match only (`Pa`, `Lyo` give 0, as ASV-F-009 says), searcher excluded |  |  |
| CQ-B05 | FON | Search with 1 character `x` | FAIL (known #70 N2) | "2 caractères au moins." and "aucun chatteur trouvé" shown together | #70 N2 (#152 closed as duplicate) |  |
| CQ-B06 | FON | Ignore Théo_13 in the busy room for 20 s | PASS | his past and new lines hidden (0 before, 0 after), list shows "Théo_13 (ignoré)" |  |  |
| CQ-B07 | ROB | Away/resume: Chrome `Offline` for 84 s, then online | MIXED | server marks Alba away (search from another socket: `away:true`), but no "Connexion perdue" banner in 84 s; online: resume, windows back as tabs, `away:false` | #24 (comment) |  |
| CQ-B08 | ROB | ROB-02: stop the server, then start it again | PASS | banner "Connexion perdue, on se reconnecte…"; back after about 17 s on the entry screen (in-memory reset, known JRN-02c) |  | 03, 04 |
| CQ-B09 | FON | Guest with a 20-character pseudo `Bérénice-Ü.20car_xyz`, F, 99, city `Saint-Étienne-du-Rouvray` enters | PASS | entered; pseudo fits the header from 320 px up |  |  |
| CQ-B10 | UI | UI-01/UI-04: busy Blabla at 320×568 light, 390×844 dark, 844×390 light, 768×1024 light, 1024×768 dark | PASS | `scrollWidth == clientWidth` at each, no element past the right edge, message field reachable, dark tokens (bg rgb(27,27,47), fg rgb(242,242,242)); the mobile emulation reloads the page and lands on the rooms list with no room tab (known JRN-02b, #70) |  | 05-08 |
| CQ-B11 | SEC | SEC-04: `<img src=x onerror=…>` and `"><svg onload=…>` in the room message and the search; `<b>x</b> onerror` as room name | PASS | shown as text, `window.__x` stays 0, no `img`/`svg` in the log, no CSP violation; room name refused |  |  |
| CQ-B12 | FON | Room name refused by the server | FAIL | "Nom invalide : 3 à 30 caractères, sans mot réservé." and the field is emptied | #151 |  |
| CQ-B13 | PERF | Performance trace during a burst: 8 more chatters fill Blabla, 120 posts in 30 s | PASS | CLS 0.00, 139 lines, 685 DOM nodes, JS heap 4 MB, the log follows the bottom |  |  |
| CQ-B14 | UI | UI-03: Firefox and WebKit (Playwright), entry, Paris with 30+ members, XSS post, guest "message privé", 1440 light and 390 dark | PASS | no overflow, own post shown as text, 0 injected nodes, guest gets the account dialog; WebKit "Refused to apply a stylesheet" = Playwright screenshot caret (known, reports SC/AM) |  | 09 |

### Items waived from #131

| ID | Verdict | Evidence |
|---|---|---|
| SEC-01 headers | FAIL (known #69) | CSP `default-src 'self'`, no `unsafe-inline`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`, COOP/CORP same-origin, `/api/stats` `no-store`; no `Permissions-Policy` (#69); no HSTS on local HTTP, sent in tunnel mode only (BR-086, by design) |
| SEC-02 cookies | PASS (known gaps) | `asv_device=…; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax`; no `Secure` on local HTTP by design (#58), no `__Host-` prefix (#95) |
| SEC-03 origin | PASS | WS upgrade and `POST /account/sign-out` with `Origin: https://evil.test` and `Origin: null`: 403; no `Access-Control-Allow-Origin` on `/api/stats` |
| SEC-04 XSS | PASS | CQ-B11, CQ-B14, crowd bot `<script>` line |
| SEC-05 authn/authz | PASS | every command before `enter` → `error forbidden`; guest `sendPrivate` → `accountRequired`; moderator commands → `error invalid` (not available before brick 8); `postRoom` outside the room → `warning notMember`; `deleteAccount` as guest → `warning notSignedIn` |
| SEC-06 input limits | PASS | wrong type, empty id, negative age, unknown type, negative `seq` → `error invalid`; unknown field ignored; 70 kB frame → close 1009 (CQ-24); server up (`/api/stats` 200) |
| SEC-07 rate limits | PASS | CQ-14 flood, CQ-18 BR-007, CQ-19/20 BR-089, CQ-21/22 BR-088, CQ-25 global cap; other chatters unaffected (CQ-27) |
| SEC-08 error leaks | PASS | `/nope`, `/api/nope`, `/.git/config`, `/.env`, `/%2e%2e/%2e%2e/etc/passwd`, `/src/server/hub.ts`: 404 `text/plain` 13 B; bad JSON on `/account/device`: 400 |
| SEC-09 bundle | PASS | `dist/` holds `index.html` and two assets, no `.map` (404); no key, token or internal URL (only hit `sk-` inside `mask-type`) |
| SEC-10 third parties | PASS | reload: 4 requests, all `127.0.0.1:8788` |
| UI-01 viewports | MIXED | CQ-B10 PASS at 320, 390, 768, 844×390, 1024; text zoom 200 % not run |
| UI-03 engines | PASS | CQ-B14 |
| UI-04 dark | MIXED (dark PASS) | CQ-B10 (390 and 1024 dark), CQ-B14 (390 dark); `prefers-reduced-motion` and `forced-colors` not run |
| ROB-02 backend down | PASS | CQ-B08 |
| UI-02 inspector | INCONCLUSIVE | network: reload lists 4 requests, all `127.0.0.1:8788` (SEC-10); console: no CSP violation during CQ-B11; the other console and WebSocket-frame reads were not recorded per case |
| A11Y-02 semantics | FAIL (Must) | entry: Lighthouse accessibility 100, one `h1`, `lang=fr`; busy room: 91 — `listitem` (#107), new `label-content-name-mismatch` on away members (#153) |
| A11Y-03 errors announced | FAIL (Must) | pseudo taken: `role=alert` "Ce pseudo est déjà pris.", pseudo kept, but no `aria-invalid` and no how-to-fix (#154) |

## Journeys

| Journey | Verdict | Evidence |
|---|---|---|
| JRN-01 entry, refusals, rate limit | PASS | CQ-01, CQ-18, CQ-B09; A11Y-03 gap #154 |
| JRN-02 away, resume, restart, leave | MIXED | CQ-15, 16, 17, CQ-B08 PASS; CQ-B07 no banner offline (#24) |
| JRN-03 rooms, post, flood, user room | PASS | CQ-04…09, CQ-14, CQ-B02 |
| JRN-04 privates, 3-window cap | FAIL | CQ-11, 12 server PASS; CQ-B03 draft lost (#151) |
| JRN-05 ignore | PASS | CQ-13, CQ-B06 |
| JRN-06 search by pseudo or city | MIXED | CQ-10, CQ-B04 PASS; CQ-B05 (#70 N2) |
| JRN-07 sign in by code | PASS | CQ-03, CQ-B01 (notice #68) |
| JRN-13 frame limits | PASS | CQ-21…24 |
| JRN-14 per-IP and global socket caps | PASS | CQ-19, 20, 25, 26, 27 |
| JRN-08…12, JRN-15…21 | NOT TESTED | outside this campaign's scope (#147: crowd, rooms, privates, limits); last evidence in `test-plan.md` stays valid |

## Not tested

- UI-01 text zoom 200 %; UI-04 `prefers-reduced-motion`, `forced-colors`.
- Per-case console and WebSocket-frame reads (UI-02).
- JRN-08…12 and JRN-15…21 (see § Journeys).
- asvchat.fr and the tunnel (local only by rule of engagement).

## Delta vs previous report (PF, 2026-11-12-131)

- Every PF waiver item is now run: SEC-01…10, UI-01, UI-03, UI-04, ROB-02, A11Y-02, A11Y-03.
- New: #151, #153, #154; #70 N2 re-seen; #24 and #68 re-seen.
- PF's own result (focus kept when a private window closes) was not re-checked here.

## Findings

| Issue | Severity | Title |
|---|---|---|
| #151 | Should (P2) | fix(web): keep the draft when the server refuses a private message or a room name |
| #70 N2 (#152 closed as duplicate) | known | search shows the length notice and "aucun chatteur trouvé" together (CQ-B05) |
| #153 | Must (P1) | fix(web): include the visible pseudo suffix in the member button's accessible name |
| #154 | Must (P1) | fix(web): mark the pseudo field invalid and say how to fix a refused pseudo |
| #24 | known | comment: 84 s offline without the reconnect banner (CQ-B07) |
| #68 | known | comment: code-sent notice outlives success (CQ-B01), window-cap notice outlives the reconnect (CQ-B08, shot 03) |

Lighthouse `target-size` on the room screen is A11Y-05, already #142. Not filed: Lighthouse SEO `meta-description` (the product does not aim at search ranking; owner may decide otherwise). No new user journey; `test-plan.md` gets the CQ evidence in this PR (JRN-02, 04, 05, 06, 07, 13, 14).

## Cleanup

Server on 8788 and the ambient crowd stopped; DevTools pages closed; scratchpad files (connection log with loopback IPs and pseudos, traces, Lighthouse reports) stay outside the repo.
