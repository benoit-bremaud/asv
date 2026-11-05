# QA full — per-socket frame budget, issue #89 (2026-11-03)

Full QA pass of PR #103 (BR-088): the frame budget and the invalid-frame close work as specified, the web client never trips them in normal use and resumes after a policy close, and other chatters stay responsive during a flood; the gate is red only on three pre-existing P0 items (A11Y-02, A11Y-05, PERF-01) that the diff does not touch.

| Level | Head SHA | Environment | Targets | Agent / model | Matrix page |
|---|---|---|---|---|---|
| full (product and security parts) | 9913901 | local only: dev server `http://localhost:5173` (Vite + Node transport on `127.0.0.1:8787`, dev mailer, in-memory store); own production build `http://localhost:8788` (`ASV_STATIC_ROOT=dist`, not tunnel mode) | W, A | qa-tester · Opus | not published (orchestrator) |

**Plan.** Diff against `origin/main`: `src/server/frame-budget.ts` (new token bucket), `src/server/hub.ts` (invalid-frame count, `closeSocket`), `src/transports/node/server.ts` (budget before parsing, 1008 close, ignore frames of a closing socket), study and docs updates. Domains in: every domain of the checklist that applies to W and A, JRN-01…JRN-13 of the test plan first, JRN-13 in depth, SEC-01…SEC-10. Domains out: MOB (no native app; MOB-03 NOT TESTED, no macOS and no native build), ROB-11 (N/A, no firmware). JRN-12 tunnel mode: not run (needs the owner's `tester.env` secrets).

**Rules of engagement.** Allowed hosts: `localhost`, `127.0.0.1` only; asvchat.fr and the tunnel never touched. Accounts: throw-away `qa-*@example.test` members created on the in-memory store; the dev-mailer codes were read from the server log and are not written here. Deviation, requested by the caller for BR-088: bursts of 200 frames in one go and a 6 s reconnect flood (759 sockets) on the local Node transport, above the 20-call burst cap of the checklist. The production build was started through Bash (`tsx src/transports/node/main.ts` on port 8788) because `.claude/launch.json` only has the Vite entries; it was stopped at the end.

**Tools.** Playwright MCP (Chromium, isolated contexts, exact viewports); Playwright 1.64.1 Firefox 157 and WebKit 27.2 by script; Node `ws` scripted clients; axe-core 4.13 injected in the page; lhci with Lighthouse 12.6.1 (mobile, simulated throttling); `curl`. `qa-doctor`: every required tool present, Orca missing (A11Y-14 NOT TESTED). Node on this machine is 22.21.1, below the `engines` floor 22.22.2 (pnpm warning only, machine setup, not filed).

## QA matrix

Gate ❌ · 🔴 Must 3 (pre-existing, not from this diff) · 🟡 Should 3 · 🔵 Nice 8 — 79 checks: Pass 61 · Fail 12 · Mixed 1 · Not tested/N/A 5

### JRN-13 / BR-088 (the diff)

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-13a | FON | Normal use from the web UI never closes the socket: enter, join, post, 6 quick posts (flood notice), private, search, create a room, idle 75 s | Pass | PASS | 75 s idle: 3 `ping` out, 3 `pong` in, no close; 6 posts in < 1 s gave the BR-021 notice, socket open; the only closes seen were the probes below and the dev StrictMode 1006 at load | | 03, 11, 12 |
| JRN-13b | SEC | 200 frames at once from a scripted client | Pass | PASS | 200 `ping`: 40 `pong` then close **1008 `tooManyFrames`** after 6 ms; 200 JSON `search` (unentered): 40 `error forbidden` then 1008 `tooManyFrames`; sustained 20 frames/s for 4 s: 80 answers, open; 30 frames/s: closed at 3.9 s (40-token bucket draining at 10/s, as computed) | | |
| JRN-13c | SEC | 5 invalid frames in a row | Pass | PASS | 5 non-JSON frames: 5 `error invalid`, then **1008 `invalidFrames`**; 5 schema-invalid JSON frames: same | | |
| JRN-13d | SEC | 4 invalid + 1 valid + 4 invalid | Pass | PASS | 8 `error invalid` + 1 `error forbidden`, socket open; a later `ping` got `pong`. Side note: 4 invalid + `ping` + 1 invalid closes (`ping` does not reset the count), consistent with the code but not stated in BR-088 | #112 | |
| JRN-13e | FON | After a policy close the web client reconnects and resumes | Pass | PASS | 60 `ping` sent on the page's own socket: close 1008 `tooManyFrames`, banner "Connexion perdue, on se reconnecte…", `resume` sent, room and member list back within 1 s, same pseudo, `asv.session` kept; same with 5 invalid frames (1008 `invalidFrames`, a "Demande refusée." notice from the forged frames, then resumed) | | 04, 05 |
| JRN-13f | PERF | Other chatters stay responsive during a flood | Pass | PASS | A and B in Blabla, three flood loops reconnecting for 6 s (759 sockets, all closed 1008 `tooManyFrames`): A's ping RTT p50 1 ms, p95 7 ms, max 13 ms (baseline 1 / 3 / 3 ms); A's posts reached B in 1–2 ms in both phases; A and B never closed. Reconnecting gets a fresh bucket each time, with no limit on the upgrade rate per IP | #23 (comment) | |

### Journeys JRN-01…JRN-12

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-01a | FON | Entry nominal | Pass | PASS | QaFull1 (F, 30, Lyon) entered, rooms list shown | | 02 |
| JRN-01b | FON | Refused pseudo (reserved word) | Pass | PASS | `modoX`: "Pseudo invalide : 3 à 20 lettres…" in an alert | | 01 |
| JRN-01c | SEC | Entry rate limit BR-007 | Pass | PASS | 7 entries 250 ms apart: 5 `entered`, then 2 `entryRefused rate` | | |
| JRN-01d | FON | Age under 18 | Pass | PASS | age 17: `entryRefused age` | | |
| JRN-02a | FON | Resume after a socket drop | Pass | PASS | see JRN-13e (policy close is a socket drop) | | 04, 05 |
| JRN-02b | FON | Resume after a page reload | Fail | FAIL | session, pseudo and private tabs back, but the client lands on the rooms list where the room tab bar is hidden: nothing shows the chatter is still in Blabla (`web-ui/05` covers socket loss only) | #70 (N4, comment) | 14 |
| JRN-02c | ROB | Server down and restart | Fail | FAIL (known) | down: "Connexion perdue, on se reconnecte…"; back: entry screen with no explanation (in-memory store reset, documented in the runbook) | #70 (N4, comment) | 25, 26 |
| JRN-02d | FON | Leave | Pass | PASS | "quitter": entry screen, `sessionStorage` empty | | |
| JRN-03a | FON | Join and post | Pass | PASS | message shown in Blabla | | 03 |
| JRN-03b | FON | Flood notice | Pass | PASS | 6th post: "Doucement ! 5 messages par 10 secondes au plus." (the notice then never clears: #68) | #68 (comment) | 11 |
| JRN-03c | FON | Create a user room | Pass | PASS | "Salle QA" created and joined | | 12 |
| JRN-04a | FON | Private conversation, both sides | Pass | PASS | QaFull2 → QaFull1, message shown in both windows | | 07, 08 |
| JRN-04b | FON | Cap of 3 windows (BR-043) | Pass | PASS | receiver with 3 windows: the 4th conversation gets `warning targetBusy`; the receiver shows 3 windows | | 13 |
| JRN-04c | A11Y | Focus not stolen by an arriving window | Fail | FAIL (known) | `activeElement` moved into the newest private window field | #67 (comment) | 13 |
| JRN-05 | FON | Ignore both ways | Pass | PASS | after "ignorer", the ignored chatter's room and private messages do not reach the receiver; the sender sees its own | | 10 |
| JRN-06 | FON | Directory search by city | Pass | PASS | "Paris": "QaFull2 41 Paris — dans Blabla" | | 09 |
| JRN-07a | FON | Request a code, wrong code, right code | Mixed | FAIL (known) | wrong code "Mauvais code.", right code signs in, but the banner keeps "Mauvais code." and the header keeps "âge ? sexe ? ville ?" | #60 (comment) | 06 |
| JRN-07b | SEC | IP quota 10 codes per hour | Pass | PASS | 11th and 12th requests of the hour: `warning rate` | | |
| JRN-08 | FON | Code step kept across a reload | Pass | PASS | after `requestCode` and a reload the panel reopens on the code step with the code field focused | | 19 |
| JRN-09a | SEC | Device cookie flags | Pass | PASS | `asv_device`: HttpOnly, SameSite=Lax, Path=/, expiry set; not `Secure` on plain HTTP (expected, tunnel mode sets it); not `__Host-` (#95) | | |
| JRN-09b | FON | Remembered device in a new tab | Pass | PASS | new tab of the same profile, guest entry as QaFull2b: signed in as member without a code | | 15 |
| JRN-09c | FON | Sign out everywhere | Pass | PASS | "me déconnecter partout": panel back to the e-mail step; private windows closed (members only) | | 18 |
| JRN-10a | FON | Delete my account | Pass | PASS | confirmation, then both sessions of the account signed out | | 16, 17 |
| JRN-10b | PRI | Retention notice before deletion and at sign-up | Fail | FAIL | the 5-year sentence required by `web-ui/06` is shown nowhere | #110 | 16, 01 |
| JRN-11 | FON | Legal pages | Pass | PASS | rules, legal notice, privacy open and close ("(à compléter)" placeholders expected in dev) | #111 (layering) | 20 |
| JRN-12 | SEC | Tunnel mode | Not tested/N/A | NOT TESTED | needs the owner's secrets; HSTS covered by RS earlier | | |

### Checklist domains

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| FON-01 | FON | Nominal journey | Pass | PASS | JRN-01…11 above | | |
| FON-02 | FON | Diff's paths and failure branches | Pass | PASS | JRN-13 a–f | | |
| FON-03 | FON | Boundaries | Pass | PASS | 501 chars `tooLong`, 2001 chars `invalid`, whitespace `empty`, search 65 chars `invalid`, age 17 refused | | |
| FON-04 | FON | Text inputs (unicode, HTML) | Pass | PASS | HTML payloads shown as text, `:)` rendered as smiley | | 24 |
| FON-08 | FON | State transitions | Pass | PASS | resume after policy close, reload, restart; sign-in → sign-out → code step | | |
| FON-09 | FON | Double submit / quick posts | Pass | PASS | 6 posts in < 1 s: no duplicate, BR-021 notice | | 11 |
| FON-11 | FON | Search with special characters | Pass | PASS | `' OR 1=1--`, `${7*7}`, `../../etc/passwd`: plain `searchResults` | | |
| FON-13 | FON | Exploratory session | Pass | PASS | 30 min frustrated-user charter folded into the journeys (quick posts, reload mid-flow, wrong code, ignore mid-conversation); findings below | | |
| DAT-01 | DAT | Protocol contract | Pass | PASS | every answer parsed by the client schema; close codes 1008 / 1009 as documented | | |
| DAT-02 | DAT | Persistence | Not tested/N/A | N/A | in-memory store by design in local and tester modes | | |
| DAT-03 | DAT | Server-side validation | Pass | PASS | wrong types, negative `seq`, unknown `type` refused; unknown fields stripped and ignored | | |
| DAT-06 | DAT | One error model | Pass | PASS | every refusal is `error {code}` or `warning {code}` with `replyTo` | | |
| DAT-10 | DAT | Server restart mid-session | Fail | FAIL (known) | see JRN-02c | #70 | 25, 26 |
| UI-01 | UI | Viewports 320, 390, 768, 1024, 1440, 844 × 390 | Pass | PASS | no horizontal scroll at any size; room with tabs | | 21 |
| UI-02 | UI | Console and network | Pass | PASS | production build: only `/favicon.ico` 404 (#62, #98); dev: StrictMode `/ws` warning, Vite HMR socket (dev noise) | | |
| UI-03 | UI | Firefox and WebKit | Pass | PASS | entry → Blabla → post in Firefox 157 and WebKit 27.2 at 1440 and 390, no horizontal scroll; only the dev StrictMode `/ws` message | | 27, 28 |
| UI-04 | UI | Dark scheme | Pass | PASS | room legible; "envoyer" 6.65:1, tabs 12.4:1, header pseudo 7.58:1 | | 22, 23 |
| UI-05 | UI | States | Fail | FAIL (known) | notices never clear (code sent after sign-in, flood notice after room creation) | #68 (comment) | 07, 13 |
| UI-07 | UI | Visual tidiness (owner rule: no overlap, clipped box, cut shadow) | Fail | FAIL | account panel over "Membres" (#104), search panel and legal pages over panels without backdrop (#111), private windows flush on the viewport bottom with the shadow cut (#108), private message field 121 px in a 300 px window (#109) | #104 (comment), #108, #109, #111 | 08, 09, 13, 20 |
| UI-08 | UI | Favicon, 404 | Fail | FAIL (known) | `/favicon.ico` 404, plain-text 404 | #62, #70 | |
| A11Y-01 | A11Y | Keyboard only | Pass | PASS | entry completed with Tab / Space / Enter on the production build, visible focus ring, then Tab reaches "Mon compte", "quitter", the rooms | | |
| A11Y-02 | A11Y | Semantics | Fail | FAIL (known) | no `h1` (axe `page-has-heading-one`); two textboxes named "message" when a private window is open | #64 (comment), #106 | 07 |
| A11Y-04 | A11Y | Contrast | Pass | PASS | light (previous reports) and dark pairs measured ≥ 4.5:1 | | 22 |
| A11Y-05 | A11Y | Target size | Fail | FAIL | room tab "×" 16.3 × 25 and 17 × 25 px, touching the tab (axe `target-size` serious) | #105 | 21 |
| A11Y-06 | A11Y | Focus not obscured | Pass | PASS | keyboard pass: focused element always in view | | |
| A11Y-11 | A11Y | axe-core | Fail | FAIL | room screen: `target-size` (serious, #105), `page-has-heading-one` (#64), `aria-allowed-role` on `ol[role=log]` (minor, #107); entry screen: `page-has-heading-one` only | #105, #64, #107 | |
| A11Y-14 | A11Y | Screen reader | Not tested/N/A | NOT TESTED | Orca not installed (`sudo apt install orca`) | | |
| PERF-01 | PERF | Lab budget, production build, mobile | Fail | FAIL | Lighthouse 12.6.1, 3 runs: LCP 2.6 s (budget 2.5 s), CLS 0.024, TBT 0 ms, score 0.94; 206 KB saved by text compression | #98 (comment) | |
| PERF-02 | PERF | Bundle and compression | Fail | FAIL (known) | 290 KB JS (90 KB gzip) served uncompressed, no `Cache-Control` on hashed assets | #98 | |
| PERF-04 | PERF | Light load | Pass | PASS | see JRN-13f (759 sockets in 6 s, no error, latency stable) | | |
| ROB-01 | ROB | Socket cut | Pass | PASS | JRN-13e | | 04, 05 |
| ROB-02 | ROB | Backend down | Pass | PASS | reconnect banner, then recovers when back (state reset: JRN-02c) | | 25, 26 |
| ROB-05 | ROB | Two users, parallel requests | Pass | PASS | two browser contexts and three scripted members at once, no race | | 13 |
| ROB-06 | ROB | Malformed frames | Pass | PASS | non-JSON, wrong schema, 70 KB frame (close 1009), server stays up | | |
| ROB-07 | ROB | Logs | Pass | PASS | server log: no error or stack during the floods; codes only in the dev-mailer line (dev mode by design) | | |
| USA-01 | USA | Heuristics on touched screens | Pass | PASS | reconnect banner after a policy close is clear and short | | 04 |
| USA-03 | USA | Error messages | Pass | PASS | pseudo, flood, code messages say what and how | | 01, 11 |
| USA-04 | USA | Destructive action confirmed | Pass | PASS | "supprimer mon compte" asks "oui, supprimer / annuler" | | 16 |
| PRI-01 | PRI | No personal data in URL, storage, logs | Pass | PASS | `sessionStorage` holds `asv.session` (and `asv.codeUntil` during a code step) only; `localStorage` empty; no query string | | |
| PRI-02 | PRI | Consent | Not tested/N/A | N/A | no non-essential request: only `localhost:8788` contacted | | |
| PRI-04 | PRI | Account deletion | Pass | PASS | both sessions signed out; the device cookie stays in the browser and is dropped as stale at the next entry (by design, `web-ui/06`) | | 17 |
| PRI-05 | PRI | Retention stated | Fail | FAIL | see JRN-10b | #110 | 16 |
| MOB-03 | MOB | iOS | Not tested/N/A | NOT TESTED | no native app; no macOS | | |

### Security part SEC-01…SEC-10

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| SEC-01 | SEC | Headers | Fail | FAIL (known) | production build `/` and `/api/stats`: CSP `default-src 'self'`, `script-src 'self'`, `frame-ancestors 'none'`, `base-uri 'none'`, nosniff, `Referrer-Policy: no-referrer`, COOP, CORP, `X-XSS-Protection: 0`, `no-store` on the API, no `Server` / `X-Powered-By`; missing `Permissions-Policy` and `object-src 'none'` | #69 (comment) | |
| SEC-02 | SEC | Cookies | Pass | PASS | JRN-09a; `__Host-` prefix pending #95 | #95 | |
| SEC-03 | SEC | Origin, CORS, CSWSH | Pass | PASS | WebSocket upgrade with `Origin: https://evil.test`, `null`, a non-allowed localhost port or none: 403; wrong path 403; allowed origin 101; `/account/*` POST with a foreign or no Origin: 403; no `Access-Control-Allow-Origin` anywhere | | |
| SEC-04 | SEC | XSS | Pass | PASS | `<img onerror>`, `"><svg onload>`, `<script>` in room messages and in the city field: shown as text, 0 `img`/`svg`/`script` nodes added, no dialog | | 24 |
| SEC-05 | SEC | Authn / authz | Pass | PASS | before entry: `forbidden`; forged resume token: `resumeRefused`; guest `sendPrivate`: `accountRequired`; moderator commands: `invalid notAvailable`; closing another conversation id, leaving a room not joined: ignored; posting in a room not joined: `notMember`; account commands as guest: `notSignedIn` | | |
| SEC-06 | SEC | Input limits | Pass | PASS | over-cap text and query `invalid`; wrong types refused; unknown fields ignored; 70 KB frame closed 1009, server up; 2 MB POST to `/account/device`: 400 | | |
| SEC-07 | SEC | Rate limits | Pass | PASS | entry 5 / 60 s, codes 10 / h per IP, posts 5 / 10 s, frames 40 + 20/s (JRN-13); other users not locked out by a flood (JRN-13f); per-IP upgrade rate not limited (#23) | #23 (comment) | |
| SEC-08 | SEC | Error leaks | Pass | PASS | 404 plain "404 Not Found"; bad JSON 400 with no stack; WebSocket errors carry only a code and a short message (checked for paths, `.ts`, `Error:`) | | |
| SEC-09 | SEC | Bundle | Pass | PASS | `dist/` has one JS and one CSS, no `.map` file served (404), no key or token; only `react.dev` and `w3.org` URLs (library strings) and the word Brevo (UI text) | | |
| SEC-10 | SEC | Third parties | Pass | PASS | production build network list: `localhost:8788` only | | |
| ROB-11 | SEC | Firmware safety | Not tested/N/A | N/A | no firmware | | |

## Findings to act on

1. 🔴 Must (pre-existing, P0 item) — A11Y-05 target size: room tab "×" 16 px wide → #105 (P1).
2. 🔴 Must (pre-existing, P0 item) — A11Y-02 no `h1` → #64 (comment).
3. 🔴 Must (pre-existing, P0 item) — PERF-01 LCP 2.6 s on the uncompressed local production build → #98 (comment). Owner may waive: the tunnel exposure goes through Cloudflare, which compresses text at the edge; this pass did not measure through the tunnel.
4. 🟡 Should — retention notice missing at sign-up and before deletion (JRN-10b, PRI-05) → #110.
5. 🟡 Should — two textboxes named "message" (A11Y-02) → #106.
6. 🟡 Should — focus moved into an arriving private window (JRN-04c) → #67 (comment).
7. 🔵 Nice — search panel and legal pages drawn over panels without backdrop → #111; account panel variant → #104 (comment).
8. 🔵 Nice — private windows flush on the viewport bottom, shadow cut → #108.
9. 🔵 Nice — private message field 121 px wide → #109.
10. 🔵 Nice — `ol[role=log]` not allowed (axe minor) → #107.
11. 🔵 Nice — BR-088 does not say that `ping` leaves the invalid count unchanged → #112.
12. 🔵 Nice — reload lands on the rooms list without the room tabs; restart with no explanation → #70 (comment).
13. 🔵 Nice — notices never clear; stale "Mauvais code." and header placeholders → #68, #60 (comments).
14. 🔵 Nice — reconnecting after a 1008 close gets a fresh bucket; no upgrade-rate cap per IP (759 sockets in 6 s, one connection-log line each) → #23 (comment). Filed on the existing public issue, in line with #89…#100 of the 2026-11-03 audit; no exploit detail beyond the numbers.

Not filed: Node 22.21.1 on this machine below the `engines` floor (machine setup); dev-only StrictMode `/ws` warning and Vite HMR socket.

## Not tested

- JRN-12 tunnel mode (`Secure` cookie, client IP): needs `~/.config/asv/tester.env`; run `pnpm tester` without the tunnel on a local `ASV_TUNNEL` instance.
- A11Y-14 screen reader: Orca missing (`sudo apt install orca`).
- MOB-03 and every MOB item: no native app, no macOS.
- PERF-01 through the Cloudflare edge: out of scope (production host).
- DAT-02 persistence: N/A, in-memory store by design.

## Delta vs previous reports

`2026-11-03-security-audit.md` finding 1 (no per-socket frame limit, #89): fixed and verified (JRN-13 a–f). `2026-11-02-65-private-dock.md`: no regression of the composer layout; SEC-01 still failing (#69). `2026-10-24-full-pass.md`: A11Y-02 (#64) and the notice and restart findings (#60, #68, #70) still present; PERF-01 moved from INCONCLUSIVE to FAIL with a real Lighthouse run. New: #105…#112.

Screenshots: `docs/architecture/qa/2026-11-03-89-<nn>-<step>.png` (numbers in the Shots column).
