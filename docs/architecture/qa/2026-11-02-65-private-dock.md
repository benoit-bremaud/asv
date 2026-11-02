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
| SEC / ROB-11 | SEC | Security probes and firmware safety | Not tested/N/A | NOT TESTED | security part not run in this run (CSS-only diff: no header, cookie, input or server change) | | |

## Findings to act on

None.

## Observations (not defects, no issue filed)

- **Phones, 2 or 3 windows open**: the dock is in the page flow after the room, as the study says, so at the very bottom the screen shows the windows (each 438 px) and the room composer sits above the fold; writing in the room means scrolling up. Nothing covers it. Suggest, for the owner to decide later, a small "salon" link or the unread tabs above the composer if testers complain.
- The "Si l'adresse peut recevoir un code…" notice stays after sign-in and over the room: already filed as #68.
- Private windows are not restored after a reload (resume restores rooms only): not part of #65, not tested further.
- Vertical blank area under the composer on desktop (52 px between the composer and the dock at 900 px, 352 px reserved under the page) is the intended reserve; with a window of 300 px and a reserve of 340 px the 40 px gap is invisible to testers.

## Not tested

- SEC-01…SEC-10 and ROB-11: security part not run (needs the `security` run on Opus).
- Firefox and WebKit: `:has()` is the new CSS primitive in the diff; `:has()` is supported by current Firefox and Safari but was not run here (level `pass`, Chromium only). Would be unblocked by a Playwright run with `--browser firefox` / `webkit`.
- Real phone (MOB), JRN-04 cap of 3 windows (needs a fifth member).
- Screen reader behaviour of the dock (A11Y at level `full`).

## Delta vs previous report

`2026-11-02-test-plan-smoke.md` (f9970ba) and the full pass `2026-10-24-full-pass.md` (c470f1a): the A11Y failure #65 of the full pass ("private windows cover the room input") is fixed on this SHA: fixed 1, still failing 0, new 0.

Screenshots (`docs/architecture/qa/2026-11-02-65-NN-*.png`): 01 sender 1 open 1440 · 02 receiver 1 open 1440 · 03 sender 2 open 1440 · 04 sender 1 open + 1 min 1440 · 05 receiver 2 open 1440 · 06 receiver 1 open + 1 min 1440 · 07 sender 1 open + 1 min 390 · 08 receiver 1 open + 1 min 390 · 09 sender 2 open 390 · 10 sender 1 open 390 · 11 receiver 1 open 390 · 12 sender 2 open 390 scrolled to composer · 13 sender 2 open 390 bottom · 14 sender 2 open 1440 × 600 · 15 sender dark 1440 · 16 rooms list 1440 · 17 rooms list 390 · 18 minimised unread 1440 · 19 sender 3 open 1440, 800, 390 · 20 after reload dark 390.
