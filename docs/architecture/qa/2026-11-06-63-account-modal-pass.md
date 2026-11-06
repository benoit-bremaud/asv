# QA pass — account dialog made modal, issue #63 (2026-11-06)

QA pass of PR #129 on the local production build: every JRN-17 case (a…i) passes on Chromium, Firefox and WebKit (Linux) at the asked viewports and schemes, the JRN-16 outline holds with the panel open, and three new findings are filed: the focus return after a mouse click on Safari macOS, predicted but not run on a Mac (#130), the focus lost when a private window closes, a pre-existing defect (#131), and two buttons named "fermer" in the dialog (#132).

| Level | Head SHA / base | Environment | Targets | Agent / model | Matrix page |
|---|---|---|---|---|---|
| pass (product part; security part not run) | e4b4223 / 8d68e68 (`origin/main`, merge base) | local only (asv has no staging tier): own production build of the head on `http://127.0.0.1:8788` (`pnpm build`, then `tsx src/transports/node/main.ts` with `ASV_STATIC_ROOT=dist`, `ASV_LOG_FILE` and `ASV_VAULT_FILE` in a scratch folder, not tunnel mode, dev mailer, in-memory accounts) | W | qa-tester · Opus 5.5 | not published (orchestrator) |

Checklist: `33fcba30f63f`

**Plan.** Diff `8d68e68...e4b4223`: `src/web/screens/AccountPanel.tsx` (the panel becomes a modal `dialog` opened with `showModal()`, Escape and `cancel` handlers, focus back to the opener on unmount, the notice rendered inside it), `src/web/screens/Notice.tsx` (new, extracted from `App.tsx`), `src/web/App.tsx` (page notice hidden while the panel is open in the chat), `src/web/screens/PseudoMenu.tsx` (focus back on the pseudo before the action), `src/web/styles.css` (`.overlay` max height and scroll, `::backdrop`), unit tests, the `web-ui/04` and `web-ui/06` studies and the test plan. Domains in: A11Y (A11Y-01 keyboard, A11Y-02 outline regression), UI (UI-01 1440 × 900, 1440 × 600, 390 × 844, 844 × 390; UI-02; UI-03 Firefox and WebKit since the diff adds a top-layer `dialog` and `::backdrop`; UI-04 dark), FON (JRN-17 first, then JRN-16 regression, smoke JRN-01, JRN-03, JRN-04, JRN-07). Domains out: DAT, PRI, ROB, PERF (no protocol, server, persistence or transport change; bundle 290.79 kB as on #64), SEC (security part not run; client markup, CSS and focus only), MOB (no native app), 768 px (not asked; no rule for that width in the diff).

**Rules of engagement.** Allowed host `127.0.0.1` only (asvchat.fr and the tunnel never touched). Accounts: throw-away members on `example.test` addresses and guests, on the in-memory store; dev-mailer codes read by the test scripts from the server output in the scratch folder, used once, written nowhere else. The server was started through Bash because `.claude/launch.json` only has the Vite entries (same as #23, #64, #89, #91); it was restarted three times to reset the in-memory store and the 10-codes-per-IP quota (BR-071) between the engine runs, and stopped at the end.

**Tools.** Playwright MCP 0.0.83 (Chromium) with one isolated context per user for the main run (keyboard `Tab` / `Shift+Tab` / `Escape` / `Enter`, mouse clicks at measured points, `setViewportSize`, `emulateMedia({ colorScheme })`, in-page measurement of `document.activeElement`, `:modal`, `elementFromPoint`, dialog and window rectangles, `::backdrop` colour, headings). A scratch Node script on `playwright-core` 1.64.1 (Firefox 1555, WebKit 2370, Chromium) replayed JRN-17 a, b, c, d, e, f, g, h, i on each engine with three members and one guest, collecting console errors.

## QA matrix

Gate ❌ · 🔴 Must 1 (A11Y-01 sub-checks, pre-existing and outside the diff: #131, #59) plus the open pre-existing #126 · 🟡 Should 1 (#130, predicted on Safari macOS) · 🔵 Nice 1 (#132) — 33 checks: Pass 21 · Fail 0 · Mixed 2 · Not tested/N/A 10

### JRN-17 (the diff)

Unless stated, each case was run on Chromium in the main run (1440 × 900 light) and replayed by the script on Firefox, WebKit and Chromium (1440 × 900 light, (g) at 390 × 844 dark, (h) at 844 × 390 light), with the same result on all three.

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-17a | A11Y | Open with the keyboard, Tab stays in the panel | Pass | PASS | focus on "Mon compte", Enter: dialog `:modal` true, focus on its first control (member: "me déconnecter de cet appareil"; guest: the e-mail field). 10 Tab and 10 Shift+Tab: every stop is inside the dialog, the only other stop is the browser's own slot (`BODY` in Chromium and WebKit, Firefox stays on the last control), then back to the first control; no element of the page, the members list or the private windows gets the focus. Same at 390 × 844 dark (guest: e-mail, checkbox, "confidentialité", "fermer"; the disabled "recevoir mon code" is skipped) | | 02, 07, 16-* |
| JRN-17b | A11Y | A click on the background does nothing | Pass | PASS | panel open over two private windows; mouse clicks on a member pseudo, the "salons" tab, a private window field and the room composer: the dialog stays open, no pseudo menu opens, the screen stays "# Blabla", the click lands on the backdrop (focus on the `dialog` itself), typed text reaches no field (0 filled inputs). Backdrop `rgba(0, 0, 0, 0.25)`: the page pixel (50, 50) is `rgb(191,186,172)` with the panel against `rgb(255,248,230)` without it | | 02, 16-* |
| JRN-17c | A11Y | Escape closes it, focus back on "Mon compte" (keyboard and mouse) | Pass | PASS | opened with Enter → Escape → panel gone, focus on "Mon compte"; opened with a mouse click → Escape → same, on the three engines. Safari macOS: see JRN-17c-mac | | 02, 16-* |
| JRN-17c-mac | A11Y | Same after a mouse click on Safari macOS | Not tested/N/A | NOT TESTED | no macOS here; WebKit on Linux focuses a clicked button, Safari and Firefox on macOS do not. Simulated on Chromium (panel opened by `button.click()` with nothing focused): after Escape the focus is on `BODY`, because the dialog returns the focus to the element focused when it opened. Predicted failure, filed | #130 | |
| JRN-17d | A11Y | "fermer" closes it, same focus return | Pass | PASS | Tab to "fermer" + Enter, and mouse click on "fermer": panel gone, focus on "Mon compte" | | 11 |
| JRN-17e | A11Y | Privacy page opens and closes from the panel; Escape over it closes the panel | Pass | PASS | guest, e-mail step, "confidentialité" (keyboard Enter, and mouse): the legal page is on top (`elementFromPoint` hits it), outline `H1 asv · H2 # Blabla · H2 Membres (4) · H2 Mon compte · H2 confidentialité`; Tab reaches its "fermer" then the panel's; its "fermer" closes it and leaves the panel open; Escape with it open closes both, focus on "Mon compte". At 1440 light and dark, 390 light and dark, three engines. Sub-observations: after the legal page's own "fermer" the focus is on `BODY` (next Tab goes back into the panel; known #59, commented); at 390 × 844 the page is 1370 px tall and its "fermer" is out of reach (known #126, pre-existing), Escape is the way out | #59, #126 | 13 (×4), 17-* |
| JRN-17f | UI | Panel above two private windows; Escape still closes it after a private window opens | Pass | PASS | member with two private windows (B and C wrote first). 1440 × 900: no overlap, panel in the top layer; 1440 × 600 and 390 × 844 dark, page scrolled so a window passes under the panel: `elementFromPoint` in the overlap hits the panel (the #84 case at 1440 × 600 now passes without z-index). C's window closed, panel opened, C writes again: the window reopens under the modal panel, the focus stays on the panel's first control, Escape closes the panel, focus on "Mon compte", both windows still there | | 02, 03, 04, 05, 06, 07, 08, 09, 16-* |
| JRN-17g | A11Y | A notice opened with the panel (code sent) is read inside it | Pass | PASS | from the entry "recevoir mon code" (panel opens by itself) and from the panel's e-mail step: one `.notice` `role="alert"` "Si l'adresse peut recevoir un code…", inside the dialog, none in the inert page; focus on the code field. After the panel closes the notice moves back to the page banner. Same at 390 × 844 dark on the three engines | #132 | 01, 14, 18-* |
| JRN-17h | UI | "fermer" reachable at 844 × 390 | Pass | PASS | dialog 128 → 378 px (`max-height` 246 px), content 265 px (member) and 384 px (code step + notice): the dialog scrolls; Tab to "fermer" scrolls it into view (339 → 364 px), Enter closes; mouse wheel then click also closes; focus on "Mon compte" | | 10, 11, 15 |
| JRN-17i | A11Y | Guest "message privé" from a pseudo returns focus to the pseudo | Pass | PASS | guest in Blabla, pseudo menu with the keyboard (Enter on the pseudo, focus on "message privé" `aria-disabled`), Enter: the account panel opens on the e-mail step (focus on the e-mail field); Escape → focus on the pseudo button; mouse path with "fermer" → same | | 12 |

### Journeys (regression, smoke and test plan)

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-01 | FON | Enter with a pseudo, gender, age, city | Pass | PASS | 3 members and 1 guest per engine entered; refused pseudo not re-run | | 01 |
| JRN-02 | FON | Away, resume, leave | Not tested/N/A | NOT TESTED | outside the diff; last evidence in the test plan | | |
| JRN-03 | FON | Browse rooms, join | Pass | PASS | rooms list, Blabla joined by four users per engine; posting not re-run | | 02 |
| JRN-04 | FON | Private conversation, two members | Pass | PASS | run as the set-up of JRN-17f on the three engines (window opened from the pseudo menu, message delivered, reopened after a close) | #131 | 02, 03 |
| JRN-05, JRN-06 | FON | Ignore, directory search | Not tested/N/A | NOT TESTED | outside the diff; last evidence in the test plan | | |
| JRN-07 | FON | Sign in with an e-mail code | Pass | PASS | right code for 12 members over the run, from the entry form; the 10-codes-per-IP quota (BR-071) was hit by the 11th request and stopped a script run, as specified; wrong code not re-run | | 01 |
| JRN-08…JRN-15 | FON | Code step after a drop, device, deletion, legal pages, tunnel, BR-088…BR-090 | Not tested/N/A | NOT TESTED | outside the diff; last evidence in the test plan (JRN-12 needs the owner's tester secrets) | | |
| JRN-16 | A11Y | One `h1` per screen, with the account panel open | Pass | PASS | panel open in the room: `H1 asv · H2 # Blabla · H2 Membres (n) · H2 Mon compte` (390: the members `h2` hidden with its panel); with its privacy page: `… · H2 confidentialité`; one `h1` in every state measured at 1440 and 390, light and dark | | 13 (×4) |
| JRN-17 | A11Y | Test plan: account panel modal | Pass | PASS | a…i above on Chromium, Firefox, WebKit (Linux); the Safari macOS part of (c) not run (#130) | #130 | 01–18 |

### Checklist items

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| FON-01 | FON | Nominal journey per the acceptance criteria of #63 | Pass | PASS | JRN-17a…i | | 01–18 |
| FON-02 | FON | Every path the diff touches | Pass | PASS | panel opened from "Mon compte", from the entry code request and from a guest's "message privé"; each step (e-mail, code, signed in); notice inside; privacy page; private window arriving under it; closing by Escape, "fermer", keyboard and mouse | | 01–18 |
| A11Y-01 | A11Y | Keyboard only: no trap, Esc closes a dialog and returns focus | Mixed | FAIL | the account dialog passes (JRN-17a, c, d, h, i). Sub-checks failed, pre-existing and outside the diff: closing a private window with its "×" leaves the focus on `BODY` (#131, new); closing the privacy page with its own "fermer" leaves the focus on `BODY` (#59, open). Safari macOS focus return not run (#130). Panel opened by the server from the entry form: its opener left the page, the focus goes to `BODY` on close, as `web-ui/04` specifies | #130, #131, #59 | |
| A11Y-02 | A11Y | Semantics: one `h1`, heading order | Pass | PASS | JRN-16 row above; the dialog is named by its `h2` (`aria-labelledby="account-title"`); two buttons named "fermer" in it while a notice shows (#132, Nice) | #132 | 13 |
| A11Y-03 | A11Y | Errors announced | Not tested/N/A | NOT TESTED | outside the diff; known #121 | #121 | |
| A11Y-04, A11Y-05 | A11Y | Contrast, target size | Not tested/N/A | NOT TESTED | no colour or size change except the backdrop; A11Y-05 known #105 | #105 | |
| UI-01 | UI | Viewports 1440 × 900, 1440 × 600, 390 × 844, 844 × 390 | Mixed | FAIL | account dialog: no horizontal scroll (`scrollWidth = clientWidth`), its "fermer" reachable at every size, panel above the dock. Sub-check failed, pre-existing: the privacy page opened from the panel at 390 × 844 overflows (bottom 1370 px, no inner scroll) | #126 | 04, 06, 08, 09, 10, 11, 13, 15 |
| UI-02 | UI | Console and network | Pass | PASS | script runs: 0 console errors or warnings on Chromium and Firefox; WebKit only "Refused to apply a stylesheet" from Playwright's screenshot caret style (identified in report SC, not the product); main page: only the known `/favicon.ico` 404 | #62 | |
| UI-03 | UI | Firefox, WebKit | Pass | PASS | JRN-17 a…i replayed on both, same behaviour as Chromium; panel, backdrop, privacy page and dock render the same | | 16-*, 17-*, 18-* |
| UI-04 | UI | Dark scheme | Pass | PASS | panel background `rgb(42, 42, 68)` dark vs `rgb(230, 230, 250)` light, notice and privacy page readable, backdrop dims the dark page | | 05, 07, 09, 13, 14, 18-* |
| PERF-01 | PERF | Lab budget | Not tested/N/A | NOT TESTED | no asset or transport change; known #98 | #98 | |
| SEC-01…SEC-10 | SEC | Security probes | Not tested/N/A | NOT TESTED | security part not run (client focus, markup and CSS only); last evidence FL · 9913901, SC · 77d7c17, BI · fea172c | | |
| ROB-11 | ROB | Firmware safety | Not tested/N/A | N/A | no firmware | | |
| MOB-03 | MOB | iOS simulator | Not tested/N/A | N/A | no native app | | |

## Findings to act on

1. 🔴 Must — A11Y-01 sub-checks, pre-existing, outside the diff: closing a private window leaves the focus on `<body>` (→ #131, new); closing the privacy page with its own "fermer" does too (→ #59, open, commented). The owner may waive them for PR #129 like #121 and #124, since the diff does not touch them.
2. 🔴 Must (known, still open) — UI-01: the privacy page overflows at 390 × 844, also from the modal panel (→ #126). Escape now closes it from the panel.
3. 🟡 Should — JRN-17c on Safari macOS (→ #130): the dialog gives the focus back to the element focused when it opened; Safari and Firefox on macOS do not focus a clicked button, so the focus would land on `<body>`. Simulated, not run on a Mac. Suggested fix (not applied), as `PseudoMenu` already does:

   ```diff
   -            <button type="button" className="bevel" onClick={() => commands.local({ type: "openAccount" })}>{STRINGS.myAccount}</button>
   +            <button type="button" className="bevel" onClick={(event) => { event.currentTarget.focus(); commands.local({ type: "openAccount" }); }}>{STRINGS.myAccount}</button>
   ```

4. 🔵 Nice — two buttons named "fermer" in the dialog while a notice shows (→ #132).

Seen and not filed (already tracked or as specified): the code-sent notice stays after sign-in, now inside the panel (#68); `favicon.ico` 404 (#62); the panel opened by the server from the entry form returns no focus on close, as `web-ui/04` says ("nothing gets it if that element left the page"). #104 (account panel overlapping "créer un salon") now shows the panel over a dimmed backdrop in the top layer (shot 01), which matches its "Expected"; left to the owner to close.

## Not tested

- JRN-17c on Safari macOS: no macOS here (#130 holds the predicted failure; needs a Mac or a BrowserStack-like run).
- JRN-02, JRN-05, JRN-06, JRN-08…JRN-15: outside the diff; their last evidence stays in `test-plan.md`. JRN-12 needs the owner's tester secrets.
- SEC-01…SEC-10: security part not run; the diff changes client focus handling, markup and CSS only.
- A11Y-03, A11Y-04, A11Y-05, PERF-01: not re-run; A11Y-03 (#121), A11Y-05 (#105) and PERF-01 (#98) are known.
- 768 × 1024: not asked; no rule for that width in the diff.
- Screen reader (A11Y-14): Orca missing on this machine; the dialog role, name and `role="alert"` notice were read from the DOM instead.

## Delta vs previous report

`2026-11-05-64-one-h1-pass.md` (0d48cd1): fixed 0 of its findings (#126 still open; this pass re-saw it from the panel), JRN-16 still PASS with the modal panel, new 3 (#130, #131, #132), commented 1 (#59). The account panel covered by the dock at 1440 × 600 (PD, #84) passes through the top layer.

Gate line:

```
| QA local | ❌ pass (1 Must: A11Y-01 sub-checks #131, #59, pre-existing; known #126 open; 1 Should #130 Safari macOS predicted; 1 Nice #132) · journey: entry code request → panel with notice → Blabla → two private windows → panel by keyboard and mouse, Tab, background clicks, Escape, fermer → window arriving under the panel → guest message privé → privacy page → 844 × 390, at 1440 / 1440 × 600 / 390, light and dark, Chromium + Firefox + WebKit · inspector: console clean (favicon #62), network clean · security: not run (client focus and CSS only) · domains: A11Y, UI, FON (DAT, PRI, PERF, SEC n/a: no server change) · report: docs/architecture/qa/2026-11-06-63-account-modal-pass.md |
```
