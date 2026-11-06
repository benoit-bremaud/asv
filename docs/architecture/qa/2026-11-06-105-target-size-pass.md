# QA pass — small controls at least 24 px (44 px on touch), issue #105 (2026-11-06)

QA pass of PR #141 on the local production build. Every JRN-20 case passes on Chromium, Firefox and WebKit. That covers the room tab "×", the private window "_" and "×" on both sides, and the smiley buttons. With a mouse, each measures 24 × 25 CSS px at 320 and 1440, light and dark. With touch emulation (`pointer: coarse`), each measures 44 × 44 at 390 × 844, 844 × 390 and 1024 × 768, and the tab names are 44 px high. Every click works, and axe `target-size` flags none of these controls. The JRN-16 to JRN-19 regressions pass.

The gate is red on two pre-existing P0 findings that the diff does not touch:
- #142: the "smileys" toggle and the member pseudo buttons are 21 px high, and axe `target-size` still reports them.
- #143: the header overflows a phone screen once the pseudo is long.

| Level | Head SHA / base | Environment | Targets | Agent / model | Matrix page |
|---|---|---|---|---|---|
| pass (product part; security part not run) | 3c3fdec / 07b72e8 (`origin/main`, merge base) | local only (asv has no staging tier): own production build of the head on `http://127.0.0.1:8788` (`pnpm build`, bundle `index-yPCT3csd.js` and `index-B4roNZ4y.css`, which holds `.icon-button{…min-width:24px;min-height:24px;display:inline-flex}` and `@media (pointer:coarse){.icon-button{min-width:44px;min-height:44px}.tab .link{min-height:44px}}`; then `tsx src/transports/node/main.ts` with `ASV_PORT=8788`, `ASV_STATIC_ROOT=dist`, `ASV_ALLOWED_ORIGINS=http://127.0.0.1:8788`, `ASV_LOG_FILE` and `ASV_VAULT_FILE` in a scratch folder, not tunnel mode, dev mailer, in-memory accounts, per-process keys) | W | qa-tester · Opus 5.5 | not published (orchestrator) |

Checklist: `33fcba30f63f`

**Plan.** The diff `07b72e8...3c3fdec` changes these files:
- `src/web/styles.css`: the new `.icon-button` rule and its `pointer: coarse` block, with `.tab .link` 44 px high on touch.
- `RoomScreen.tsx`: the class on the tab "×" and on the 8 smiley buttons.
- `PrivateWindows.tsx`: the class on "_" and "×".
- Three unit tests, the `web-ui/04` "Small controls (#105)" rule, and the test plan (JRN-20).

Domains in:
- A11Y: A11Y-05 target size and A11Y-11 axe `target-size`.
- UI: UI-01 at 320 × 568 and 1440 × 900 with a mouse, and at 390 × 844, 844 × 390 and 1024 × 768 with touch; UI-02; UI-03 on Firefox and WebKit, because the diff relies on `inline-flex` and the `pointer` media feature; UI-04 dark.
- FON: JRN-20 first, then the JRN-16, JRN-17, JRN-18 and JRN-19 regressions.

Domains out:
- DAT, PRI, ROB, PERF: no protocol, server, persistence or transport change. The bundle is 291.22 kB (291.17 kB on #126).
- SEC: the security part was not run, because the diff is CSS and class names only.
- MOB: no native app.

**Rules of engagement.**
- Allowed host: `127.0.0.1` only. asvchat.fr and the tunnel were never touched.
- Accounts: 12 throw-away members on `example.test` addresses (two per browser context pair) and 5 guests, all on the in-memory store. The script read each dev-mailer code from the server output in the scratch folder, used it once and wrote it nowhere else.
- Server: started through Bash, because `.claude/launch.json` only has the Vite entries (as on #23, #63, #64, #89, #91, #121 and #126). It was restarted between engine runs, because the per-IP code limit allows only 6 codes. It was stopped at the end.

**Tools.** A scratch Node script on `playwright-core` 1.64.1 (Chromium 1248, Firefox 1555, WebKit 2370) and axe-core 4.14.0, one browser context per user. The mouse pair used plain contexts. The touch pair used `hasTouch: true` and `isMobile: true` (`isMobile` is not supported on Firefox). `matchMedia('(pointer: coarse)')` was read in every case, and it matched the intended mode on all three engines. Sizes were set with `setViewportSize` and the scheme with `emulateMedia({ colorScheme })`.

In each case, user A joined Blabla and Ciné, user B joined Blabla, A opened a private window to B and sent one line, and A opened "smileys". Then the script measured on both pages:
- the `getBoundingClientRect` of every `.icon-button` and every tab name, plus a hit test of each centre with `elementFromPoint` after `scrollIntoView`;
- pairwise overlap between the visible targets, and the gaps between neighbours;
- `documentElement.scrollWidth`;
- axe-core with `runOnly: ['target-size']` on the room screen;
- a control: the same boxes with `icon-button` removed in the page.

Then it clicked, with `mouse.click` on the mouse pair and `touchscreen.tap` on the touch pair:
- each of the 8 smileys, then read the field;
- "_" on both sides, then the restore tab;
- the "×" of Ciné;
- the "×" of the private window, alternating A and B, then the other side's "×".

Product files were not changed.

## QA matrix

Gate ❌ · 🔴 Must 2 · 🟡 Should 0 · 🔵 Nice 0 — 33 checks: Pass 23 · Fail 0 · Mixed 4 · Not tested/N/A 6

Both Musts are pre-existing and outside the diff. #141 does what `web-ui/04` "Small controls (#105)" specifies.

### JRN-20 (the diff)

Each case below is one size × one scheme × one engine, with both users. A case has 15 visible `icon-button` targets: on A, 2 tab "×", 8 smileys, "_" and "×"; on B, 1 tab "×", "_" and "×".

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-20a | A11Y | Room tab "×" (two rooms joined), mouse, 320 × 568 and 1440 × 900, light and dark | Pass | PASS | `quitter Blabla` and `quitter Ciné` measure **24 × 25** in every case, on both users, and the hit test returns the button itself. The tab name and its "×" touch (gap 0 px), but both are ≥ 24 px, so no spacing exception is needed. Light and dark give identical geometry | | 01, 02, 03 |
| JRN-20b | A11Y | Private window "_" and "×", both sides, mouse | Pass | PASS | "réduire" and "fermer" measure **24 × 25** on the sender and the receiver, with an 8 px gap between them and no overlap | | 01, 02, 03 |
| JRN-20c | A11Y | 8 smiley buttons, mouse | Pass | PASS | Each measures **24 × 25** on one row, side by side (gap 0, no overlap) | | 01, 02, 03 |
| JRN-20d | A11Y | Touch (`pointer: coarse` true), 390 × 844, 844 × 390 and 1024 × 768, light and dark | Pass | PASS | All 15 targets measure **44 × 44**, and every tab name button is **44 px** high (`# Blabla` 74.4 × 44, `# Ciné` 54.6 × 44). On 390 the 8 smileys take 352 px on one row, inside the 366 px composer | | 04–07 |
| JRN-20e | FON | Click or tap on each control | Pass | PASS | In all 30 cases (10 per engine): the 8 smileys gave the field `:caramel::):(;):D:P:o<3`; "_" minimised the window to its tab and the tab restored it, on both sides; the "×" of Ciné left Ciné, so its tab was gone and Blabla stayed; the private "×" closed the window on the side that clicked (A and B in turn); the other side showed the line saying the partner left, and its own "×" then closed it | | |
| JRN-20f | A11Y | axe `target-size` on the room screen, smileys and a private window open | Pass | PASS | No `.icon-button` node was reported in any case on any engine (24 or 25 passing nodes on A, 15 or 16 on B). Other nodes on the same screen are still reported, see A11Y-05 / #142 | #142 | |
| JRN-20g | UI | No horizontal scroll | Pass | PASS | `scrollWidth` equals the viewport at 1440, 390, 844 × 390 and 1024 × 768. At 320 the page is 323–326 px wide. The header causes that, not the new targets: removing `icon-button` in the page leaves the same `scrollWidth` (UI-01, #143) | #143 | 01 |
| JRN-20-control | A11Y | Base behaviour reproduced without the class | Pass | PASS | Removing `icon-button` in the page restores the #105 sizes: tab "×" 16.3 and 17.0 px wide, "_" 13.5, private "×" 16.3, smileys 23.0 (22.7 on WebKit). This proves the new rule is what makes the targets big enough | #105 | |
| JRN-20-engines | UI | Firefox 1555 and WebKit 2370 | Pass | PASS | The same 10 cases on each engine, with identical sizes. The first WebKit run stopped on its 10th case (1024 × 768 dark, touch): B's private window did not appear within 30 s, so that case measured nothing. A second WebKit run of 1024 × 768 and 844 × 390, light and dark, passed all 4 cases. No error appeared in the console or the network, and the server has no rate limit on opening private windows. This is recorded as a harness hiccup, with both outcomes kept here | | |

### Regressions and smoke

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-16 | A11Y | One `h1`, outline from `h2` | Pass | PASS | Entry: `h1 asv` → `h2 Entrer sans compte` → `h2 Membres` (+ `h2 confidentialité` with the page open). Room: `h1 asv` → `h2 # Blabla` → `h2 Membres (3)` (+ `h2 Mon compte` with the panel open). One `h1` each | | |
| JRN-17 | A11Y | Account modal | Pass | PASS | Guest in Blabla at 1440: Tab stays inside `dialog:modal`. Escape closes it (0 `dialog:modal` left) and the focus returns to "Mon compte" | | r-02 |
| JRN-18 | A11Y | Refused field marked | Pass | PASS | Room field with U+202E: `aria-invalid="true"`, `aria-describedby="message-invisible"`, notice text present. With the text fixed, both attributes are gone | | |
| JRN-19 | UI | Legal page scroll | Pass | PASS | Privacy page from the entry footer at 390 × 844: box 12–832, `scrollHeight` 1354 > 816. After wheeling to the bottom, "fermer" is at 785–818, the hit test returns "fermer", and the mouse click closes the page. `scrollWidth` 390 | | |
| JRN-20 | A11Y | Test plan: small controls | Pass | PASS | a to g above: 10 cases × 3 engines, light and dark, mouse and touch | | 01–07 |
| JRN-01 | FON | Enter as a guest | Pass | PASS | 5 guests entered (pseudos of 3 to 20 characters) and landed on the rooms list | | r-01 |
| JRN-03 | FON | Join and leave rooms | Pass | PASS | Blabla and Ciné joined; Ciné left with its tab "×" (JRN-20e) | | 01–07 |
| JRN-04 | FON | Private conversation, two members | Pass | PASS | "message privé" from the pseudo menu; "salut qa105" was received; minimise and restore worked on both sides (JRN-20e) | | 01–07 |
| JRN-07 | FON | Sign in with an e-mail code | Pass | PASS | 12 members signed in with the dev-mailer code (6 digits, auto-submitted) | | |
| JRN-02, JRN-05, JRN-06, JRN-08…JRN-15 | FON | Other journeys | Not tested/N/A | NOT TESTED | outside the diff; their last evidence stays in `test-plan.md` | | |

### Checklist items

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| FON-01 | FON | Nominal journey per the acceptance criteria of #105 | Pass | PASS | Tab and private window controls are ≥ 24 px with a mouse and 44 px on touch; each still works (JRN-20) | | 01–07 |
| FON-02 | FON | Every path the diff touches | Pass | PASS | All 12 `icon-button` controls on A and 3 on B; the touch rule `.tab .link` | | 01–07 |
| UI-01 | UI | Viewports 320, 390 × 844, 844 × 390, 1024 × 768, 1440 × 900 | Mixed | FAIL | No horizontal scroll at 390 and above with the test pseudos (11 characters). At 320 the header overflows by 3 to 6 px with an 11-character pseudo. With a **20-character** pseudo (the maximum) the page is 402 px wide at 320, 360, 375 and 390, and "quitter" is fully off screen at 320. Pre-existing: the same `scrollWidth` appears without the #105 class, and the header is not in the diff | #143 | r-01 |
| UI-02 | UI | Console and network | Pass | PASS | 0 console messages, 0 page errors, 0 HTTP ≥ 400 across the Chromium, Firefox and WebKit runs and the regression run | | |
| UI-03 | UI | Firefox, WebKit | Pass | PASS | JRN-20-engines | | |
| UI-04 | UI | Dark scheme | Pass | PASS | Every case run light and dark, with identical geometry | | 03, 05 |
| A11Y-05 | A11Y | Target size | Mixed | FAIL | The diff's 15 targets pass (JRN-20). Two other controls on the room screen stay under 24 px, flagged **serious** by axe in every case: `details.smileys > summary` (192 × 21 at 1440, 352 × 21 at 390, 21 px safe space) and `button.pseudo-button` in the members list (21 px high, 18 px safe space with 4 members listed, seen at 844 × 390 and 1024 × 768). They are not in the #105 list. On touch they are also under the 44 px house floor | #142 | r-03 |
| A11Y-11 | A11Y | axe-core | Mixed | FAIL | `target-size` only: clean on every `.icon-button`; summary and pseudo buttons flagged (A11Y-05). Other rules were not re-run | #142 | |
| A11Y-12 | A11Y | Reflow at 320 px | Mixed | FAIL | Short pseudos reflow, a 20-character pseudo does not (UI-01) | #143 | r-01 |
| A11Y-04, A11Y-14 | A11Y | Contrast, screen reader | Not tested/N/A | NOT TESTED | no colour or semantic change; Orca missing | | |
| PERF-01 | PERF | Lab budget | Not tested/N/A | NOT TESTED | 7 CSS declarations; bundle 291.22 kB; known #98 | #98 | |
| SEC-01…SEC-10 | SEC | Security probes | Not tested/N/A | NOT TESTED | security part not run (CSS and class names only); last evidence: FL · 9913901 | | |
| ROB-11 | ROB | Firmware safety | Not tested/N/A | N/A | no firmware | | |
| MOB-03 | MOB | iOS simulator | Not tested/N/A | N/A | no native app; touch emulated in the browser only | | |

Shots (prefix `2026-11-06-105-`; all Chromium; A = the user with two rooms and the smileys open, B = the receiver):

| No. | Names |
|---|---|
| 01 | `01-A-tabs-320x568-light-mouse`, `01-A-smileys-…`, `01-B-private-…` |
| 02 | `02-A-tabs-1440x900-light-mouse`, `02-A-smileys-…`, `02-B-private-…` |
| 03 | `03-A-tabs-1440x900-dark-mouse`, `03-A-smileys-…`, `03-B-private-…` |
| 04 | `04-A-tabs-390x844-light-touch`, `04-A-smileys-…`, `04-B-private-…` |
| 05 | `05-A-tabs-390x844-dark-touch`, `05-A-smileys-…`, `05-B-private-…` |
| 06 | `06-A-tabs-844x390-light-touch`, `06-A-smileys-…`, `06-B-private-…` |
| 07 | `07-A-tabs-1024x768-light-touch`, `07-A-smileys-…`, `07-B-private-…` |
| r-01 | `r-01-header-overflow-320x568-pseudo20-light` |
| r-02 | `r-02-room-guest-after-escape-1440-light` |
| r-03 | `r-03-composer-smileys-open-1440-light` |

The touch shots are viewport captures taken with touch emulation still on (`pointer: coarse` re-read before each capture). A full-page capture in Chromium drops that emulation, so the first full-page touch shots showed 24 px targets. They were discarded and do not count as evidence.

## Findings to act on

1. 🔴 Must (pre-existing, P0 item A11Y-05) — the "smileys" toggle and the member pseudo buttons are 21 px high, so axe `target-size` is not yet clean on the room screen, which #105's "done when" asks for → #142 (P1). Suggested fix (not applied, study first): extend the `web-ui/04` "Small controls" rule to `.smileys summary` and `.pseudo-button`, with `min-height` 24 px (44 under `pointer: coarse`) and `inline-flex` centring.
2. 🔴 Must (pre-existing, P0 item UI-01; A11Y-12) — `.header-end` does not wrap, so a 20-character pseudo makes the page 402 px wide up to 390 px, and "quitter" is off screen at 320 → #143 (P1). Suggested fix (not applied, study first): `flex-wrap: wrap` and `min-width: 0` on `.header-end`; let the pseudo break or truncate.

Neither finding comes from #141. Whether #105 can close while #142 is open is the owner's call. The issue's "done when" says "axe `target-size` is clean", and on the room screen it is clean only for the controls #105 named.

Seen and not filed: the code-sent notice stays in the page banner after sign-in (shots 01–07, known #68).

## Not tested

- JRN-02, JRN-05, JRN-06, JRN-08…JRN-15: outside the diff; their last evidence stays in `test-plan.md`.
- SEC-01…SEC-10: security part not run; the diff is CSS and class names.
- A11Y-04, A11Y-14, PERF-01: no colour, semantic or asset change. A11Y-14 needs Orca.
- Touch at 320 px: not in the plan. On a 320 px phone the 8 smileys at 44 px (352 px) would wrap onto two rows. Not measured.
- A real phone and Safari on macOS: needs a device or a Mac. Touch emulation and WebKit on Linux stand in for them.

## Delta vs previous report

- `2026-11-03-89-frame-limit-full.md` (9913901), the report that filed #105 (tab "×" 16.3 × 25 px, axe `target-size` serious): fixed for the named controls. The tab "×", the private "_" and "×", and the smileys are now 24 × 25 with a mouse and 44 × 44 on touch. The control without the class reproduces 16.3 px.
- `2026-11-06-126-legal-scroll-pass.md` (31c19ff): JRN-19 still passes; no overlap otherwise.
- New: #142 (summary and pseudo buttons under 24 px; visible now that smileys and several members are on screen during the axe run) and #143 (header overflow with a long pseudo; earlier runs used short pseudos).

Fixed 1, still failing 0, new 2.

Gate line:

```
| QA local | ❌ pass (2 Must, pre-existing, outside the diff) · journey: two members, two rooms, private window, smileys → measure every icon-button, click each (smileys inserted, minimise/restore both sides, tab "×" leaves the room, private "×" closes) at 320 × 568 and 1440 × 900 mouse, 390 × 844, 844 × 390 and 1024 × 768 touch (pointer: coarse), light and dark, Chromium + Firefox + WebKit: 24 × 25 mouse, 44 × 44 touch, tab names 44 px, 0 overlap, axe target-size clean on every icon-button · regressions JRN-16…19 PASS · inspector: console clean, no HTTP ≥ 400 · security: not run (CSS only) · A11Y-05 summary and pseudo buttons 21 px → #142 · UI-01 header overflow with a 20-character pseudo → #143 · report: docs/architecture/qa/2026-11-06-105-target-size-pass.md |
```
