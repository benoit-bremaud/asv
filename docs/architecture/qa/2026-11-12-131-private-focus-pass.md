# QA pass — focus after a private window is closed or minimised, issue #131 (2026-11-12)

QA pass of PR #146 on the local production build, driven through Chrome DevTools MCP at 1440 × 900, keyboard only for the actions under test. All seven JRN-21 cases pass, with the two variants of (c): the focus lands on the next window's title pseudo (a), the previous one's (b), the minimised neighbour's tab (c), the room message field (d), the new tab on minimise (e), stays on the "×" of a window whose close was refused offline (f), and is the document body on the rooms list (g). One new Nice finding, unrelated to the diff: #148. A second run on the owner's decision of 2026-11-12 (option C, 390/500) added the Lighthouse accessibility audit (A11Y-11) and the 320 px reflow with windows open (A11Y-12): A11Y-12 passes, A11Y-11 reports one pre-existing issue (`listitem` on the private windows, added to #107).

| Level | Head SHA / base | Environment | Targets | Agent / model | Matrix page |
|---|---|---|---|---|---|
| pass (product part; security part not run) | d783b18 (product code identical to 0d4f213; the commit adds only this report, the ledger and the screenshots) / 0ff95d5 (`main`, merge base; no `deploy/staging` note) | local only (asv has no staging tier): own production build of the head on `http://127.0.0.1:8788` (`pnpm build`, bundle `index-AsKiY00-.js` 291.72 kB and `index-B4roNZ4y.css`; then `tsx src/transports/node/main.ts` with `ASV_PORT=8788`, `ASV_STATIC_ROOT=dist`, `ASV_ALLOWED_ORIGINS=http://127.0.0.1:8788`, `ASV_LOG_FILE` and `ASV_VAULT_FILE` in a scratch folder, not tunnel mode, dev mailer, in-memory accounts, per-process keys) | W | qa-tester · Sonnet 5.5 | not published (orchestrator) |

Checklist: `61702fb560a9`

**Driver.** Every check below was run with the Chrome DevTools MCP plugin (`new_page` with four isolated contexts, `emulate` 1440 × 900, `take_snapshot`, `press_key`, `evaluate_script` for `document.activeElement`, `take_screenshot`, `list_console_messages`, `list_network_requests`), as the owner asked on 2026-11-12. A first run with a Playwright script (three runs, last one a..g PASS) was done before that instruction. It is **superseded**: all cases were re-run with Chrome DevTools, its screenshots were discarded, and only the DevTools results count here. The Playwright run is logged as such in [checklist.md](checklist.md) (SETUP-3).

**Plan.** The diff `0ff95d5...0d4f213` changes the private windows (`PrivateWindows.tsx`: refocus after an applied close or a minimise), the room screen (`RoomScreen.tsx`: `MESSAGE_FIELD_ID`, scroll follow, `aria-invalid`), `chat-context.tsx` (a refused close returns false) and their tests. Domains in: FON (JRN-21 first), A11Y-01 keyboard, UI-02 console and network, ROB-01 network cut (the offline case), ROB-13 server log. Domains out: SEC (security part not run), DAT, PRI, PERF (no protocol, server or asset change), MOB (no native app), UI-01/03/04 beyond 1440 × 900 light on Chromium (the owner scoped this pass to 1440 × 900).

**Second run (owner decision 2026-11-12, option C 390/500).** On the head d783b18 (same bundle `index-AsKiY00-.js`, rebuilt), in Chrome through Chrome DevTools MCP: A11Y-11 with the Lighthouse accessibility audit (snapshot mode, desktop, Lighthouse 13.4.1) on the room screen with 3 private windows open (1 minimised) and on the rooms list with a window open; A11Y-12 reflow at 320 × 568 with private windows open, including the focus cases (a), (b) and (d) at 320 px. axe-core was not available offline, so no axe injection; the Lighthouse accessibility category is axe-core 4.12 underneath.

**Waiver.** The owner decided on 2026-11-12 (option C, 390/500, relayed by the coordinator): "Waive to campaign #147 with this owner decision quoted: SEC-01…SEC-10, UI-03 Firefox/WebKit, UI-04 dark, ROB-02, A11Y-02/03, UI-01 other viewports." These items are waived to the campaign of #147 (exploratory multi-user campaign), not passed here.

**Rules of engagement.** Allowed host `127.0.0.1` only; asvchat.fr and the tunnel were not touched. Accounts: 4 throw-away members on `example.test` addresses, in-memory store; each dev-mailer code was read from the server stdout, used once and written nowhere. The server was started through Bash because `.claude/launch.json` has only the Vite entries (as in earlier asv passes), restarted between runs to reset the per-IP code limit (6), and stopped at the end.

## QA matrix

Gate ⚠️ · 🔴 Must 0 · 🟡 Should 1 · 🔵 Nice 1 — 19 checks: Pass 8 · Fail 0 · Mixed 1 · Not tested/N/A 10

Gate line: ⚠️ pass (0 Must, 1 Should pre-existing #107, 1 Nice #148) · journey JRN-21 a…g PASS at 1440 × 900 and a, b, d at 320 × 568 · inspector: console and network read, server log read · A11Y-12 PASS, A11Y-11 FAIL (Should, #107) · waived to #147 by the owner decision of 2026-11-12 (option C, 390/500): SEC-01…SEC-10, UI-03, UI-04, ROB-02, A11Y-02, A11Y-03, UI-01 other viewports · report: docs/architecture/qa/2026-11-12-131-private-focus-pass.md.

The ⚠️ is the waiver: the P0 items above are applicable and not run here, and the owner's decision (quoted in **Waiver**) sends them to campaign #147. A ⚠️ line with its waiver is attested like a ✅.

### JRN-21 (the diff)

Start state: Alba, a member, in Blabla with three real private windows (Bruno, Clara, Denis, in that order), each with a server conversation. Each case focuses the field of the target window (start point only, by script), then uses the keyboard: `Shift+Tab` to the button, read back, then the key under test.

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-21a | A11Y | Close the middle window (Clara), `Space` | Pass | PASS | windows [Bruno, Denis]; activeElement = `button.link.pseudo-button` "actions pour Denis", the title pseudo of the next window | | 01 |
| JRN-21b | A11Y | Close the last window (Denis), `Enter` | Pass | PASS | windows [Bruno]; activeElement = "actions pour Bruno" (previous window's title pseudo) | | 02 |
| JRN-21c1 | A11Y | Close Bruno with a minimised Clara next | Pass | PASS | windows [tab Clara, Denis]; activeElement = `button.private-tab` "ouvrir Clara" | | 05 |
| JRN-21c2 | A11Y | Close Denis with a minimised Clara before it | Pass | PASS | windows [tab Clara]; activeElement = `button.private-tab` "ouvrir Clara" | | 08 |
| JRN-21d | A11Y | Close the only window (room screen open) | Pass | PASS | windows []; activeElement = `input#message` | | 03 |
| JRN-21e | A11Y | Minimise Clara (`Shift+Tab` x2 to "réduire", `Enter`) | Pass | PASS | windows [Bruno, tab Clara, Denis]; activeElement = `button.private-tab` "ouvrir Clara" | | 04 |
| JRN-21f | ROB | Close Denis while offline (Offline emulated, socket closed, banner "Connexion perdue, on se reconnecte…") | Pass | PASS | no frame sent (34 before and after); windows unchanged [tab Clara, Denis]; activeElement still `button.link.icon-button` "fermer" in "privé avec Denis"; notice "Pas connecté pour l'instant." | | 06 |
| JRN-21g | A11Y | Close the only window on the rooms list (left Blabla with the keyboard) | Pass | PASS | windows []; `document.activeElement === document.body` | | 09, 10 |

At 320 × 568 (A11Y-12), same start state with Clara restored, 3 windows open (shots 12 to 14):

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-21a@320 | A11Y | Close the middle window (Clara), `Shift+Tab` x1 then `Space` | Pass | PASS | windows [Bruno, Denis]; activeElement = "actions pour Denis" in "privé avec Denis", box 26–73 × 3–24 inside the viewport; `scrollWidth` 305 = `clientWidth` | | 13 |
| JRN-21b@320 | A11Y | Close the last window (Denis), `Enter` | Pass | PASS | windows [Bruno]; activeElement = "actions pour Bruno", inside the viewport | | |
| JRN-21d@320 | A11Y | Close the only window | Pass | PASS | windows 0; activeElement = `input#message`, box 12–246 × 482–515 inside the viewport; frames `>closePrivate` x3 | | 14 |

Also seen, not part of #131: after the reconnect (about 16 s) the `resume` brings both windows back minimised as tabs (shot 07); the refusal notice stays in the banner after the reconnect (shot 10; same family as #68 "clear or expire notices").

### Checklist items

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-21 | FON | Test plan: focus after close or minimise | Pass | PASS | a, b, c1, c2, d, e, f, g above | | 00–10 |
| FON-01 | FON | Nominal path per the acceptance criteria of #131 | Pass | PASS | close and minimise move the focus as specified | | 01–05 |
| FON-02 | FON | Every path the diff touches, with its failure branch | Pass | PASS | refused close offline keeps window and focus (JRN-21f) | | 06 |
| A11Y-01 | A11Y | Keyboard only: order, visible focus | Pass | PASS | Shift+Tab from a window's field reaches "×" then "_"; the focus ring is visible on "×" (shot 06) and on the tab (shot 04) | | 04, 06 |
| UI-02 | UI | Console and network after the journey | Pass | PASS | Alba: `/favicon.ico` 404 (known #62); 4 `ERR_INTERNET_DISCONNECTED` WebSocket errors, induced by the offline step; 2 DevTools Issues "form field should have an id or name" (new, #148). Network: 10 requests, all 200 except the favicon 404 and `POST /account/device` 204. Bruno: only the form-field Issue | #62, #148 | |
| ROB-01 | ROB | Network cut | Pass | PASS | clear banner, automatic `resume` after about 16 s, no endless spinner | | 07 |
| ROB-13 | ROB | Server log of the pass window (11:31 to 11:40) | Pass | PASS | startup lines and 4 `mailer.dev_only` lines only; no error, stack trace or warning; read on the local tier | | |
| UI-01 | UI | Viewports | Not tested/N/A | NOT TESTED | 1440 × 900 and 320 × 568 (A11Y-12) run; the other viewports are waived to campaign #147 by the owner decision of 2026-11-12 (option C, 390/500) | | |
| UI-03 | UI | Firefox, WebKit | Not tested/N/A | NOT TESTED | waived to campaign #147 by the owner decision of 2026-11-12 (option C, 390/500) | | |
| UI-04 | UI | Dark scheme | Not tested/N/A | NOT TESTED | waived to campaign #147 by the owner decision of 2026-11-12 (option C, 390/500); the 320 px shots were taken in the browser's default dark scheme, not as a dark pass | | |
| A11Y-02 | A11Y | Semantics | Not tested/N/A | NOT TESTED | waived to campaign #147 by the owner decision of 2026-11-12 (option C, 390/500) | | |
| A11Y-03 | A11Y | Errors announced, `aria-invalid` | Not tested/N/A | NOT TESTED | waived to campaign #147 by the owner decision of 2026-11-12 (option C, 390/500); covered earlier by the pass of #121 (79bbd89) | | |
| A11Y-11 | A11Y | axe-core (Lighthouse accessibility audit, snapshot, desktop, Lighthouse 13.4.1) | Mixed | FAIL | Room screen with 3 windows (1 minimised): accessibility 96, 29 audits passed, 3 failed: `listitem` (accessibility, nodes `aside.privates > dialog.private-window > ol.private-lines > li`, 2 nodes), `meta-description` (SEO, known #70 N6), `agent-accessibility-tree` (`ol[role=log]`). Rooms list with 1 window: same scores, `listitem` on 1 node. Cause: `role="log"` on the `ol` removes the list role; same pattern as #107 | #107 (comment added), #70 | 11, 15 |
| A11Y-12 | A11Y | Reflow at 320 px with private windows open | Pass | PASS | 320 × 568, 3 windows: `scrollWidth` 305 = `clientWidth` 305 (scrollbar 15 px), no 2-D scroll; windows stack in the page, each "_" and "×" reachable; cases (a), (b) and (d) below hold with the focused control inside the viewport | | 12, 13, 14 |
| ROB-02 | ROB | Backend down or 500 | Not tested/N/A | NOT TESTED | waived to campaign #147 by the owner decision of 2026-11-12 (option C, 390/500) | | |
| SEC-01…SEC-10 | SEC | Security probes | Not tested/N/A | NOT TESTED | security part not run; waived to campaign #147 by the owner decision of 2026-11-12 (option C, 390/500); last evidence: FL · 9913901 | | |
| ROB-11 | ROB | Firmware safety | Not tested/N/A | N/A | no firmware | | |
| MOB-03 | MOB | iOS simulator | Not tested/N/A | N/A | no native app | | |
| JRN-01…JRN-20 | FON | Other journeys | Not tested/N/A | NOT TESTED | outside the diff; their last evidence stays in `test-plan.md`; JRN-04 (private conversation) is exercised by the setup (windows opened, lines sent, windows closed) | | |

Shots (prefix `2026-11-12-131-`, Chromium through Chrome DevTools, 1440 × 900, taken on Alba): `00-three-windows-room-blabla`, `01-a-close-middle-focus-next-title`, `02-b-close-last-enter-focus-previous-title`, `03-d-close-only-window-focus-room-field`, `04-e-minimise-focus-new-tab`, `05-c1-close-next-to-minimised-focus-tab`, `06-f-close-offline-window-and-focus-kept`, `07-f-back-online-windows`, `08-c2-close-previous-minimised-focus-tab`, `09-g-rooms-list-one-window-before-close`, `10-g-close-rooms-list-focus-body`, `11-a11y-room-three-windows-one-minimised-1440`, `12-reflow-320-room-three-windows`, `13-reflow-320-a-close-middle-focus-next-title`, `14-reflow-320-d-close-only-window-focus-room-field`, `15-a11y-rooms-list-one-window-1440` (11 to 15 from the second run).

## Findings to act on

1. 🟡 Should (A11Y-11, P1, pre-existing, not in the diff) — `ol role="log"` on the private windows' lines (`PrivateWindows.tsx`, dates from brick 6) removes the list role, so axe `listitem` fails on every line (accessibility score 96). Same root cause as the room list of #107: added as a comment on #107 with the suggested scope (a `div role="log"` around the `ol`, or no role on the `ol` and an `aria-live` region around it; add `listitem` to the done-when). No new issue, to avoid a duplicate.

2. 🔵 Nice (UI-02, pre-existing, not in the diff) — Chrome DevTools Issues panel: "A form field element should have an id or name attribute" on the entry screen and the room screen → #148 (P2). Suggested fix (not applied): give the pseudo, age, city and e-mail inputs and the message fields an `id` or `name`.

No defect in #131: every case matches the JRN-21 rule. `meta-description` (SEO, Lighthouse) is the known #70 N6. Seen, not filed: windows are laid out `row-reverse` (desktop) and `column-reverse` (phone) while the DOM and Tab order run oldest first, so after a close the focus moves to the visually adjacent window towards the left on desktop; this is the dock's design (the oldest window stays next to the corner) and matches the JRN-21 rule, which is written in Tab order.

## Not tested

- Waived to campaign #147 by the owner decision of 2026-11-12 (option C, 390/500): SEC-01…SEC-10, UI-03 Firefox and WebKit, UI-04 dark, ROB-02, A11Y-02, A11Y-03, UI-01 other viewports.
- JRN-21 on Safari macOS (the same focus code) needs a Mac. axe-core injection itself was not run (not installed offline); the Lighthouse accessibility audit stands in for it.
- JRN-21 with touch emulation and with a screen reader (Orca is missing).

## Delta vs previous report

- `2026-11-06-63-account-modal-pass.md` (e4b4223), which filed #131 (focus lost when a private window closes): fixed on 0d4f213 for close and minimise, offline and rooms-list cases included.
- `2026-11-06-105-target-size-pass.md` (3c3fdec): #142 and #143 not re-checked (out of scope).

Fixed 1, still failing 0, new 2 (#148, and the `listitem` evidence added to #107).
