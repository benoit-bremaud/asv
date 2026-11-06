# QA pass — legal pages scroll so "fermer" stays reachable, issue #126 (2026-11-06)

QA pass of PR #139 on the local production build: every JRN-19 case passes. That is 48 cases on Chromium (the 3 legal pages from the entry footer and the privacy page from the account panel, at 6 sizes, light and dark), replayed on Firefox and WebKit. The JRN-16 and JRN-17 regression checks pass, and so does the smoke of JRN-01, JRN-03 and JRN-04. No new finding.

| Level | Head SHA / base | Environment | Targets | Agent / model | Matrix page |
|---|---|---|---|---|---|
| pass (product part; security part not run) | 31c19ff / 5a9ebb5 (`origin/main`, merge base) | local only (asv has no staging tier): own production build of the head on `http://127.0.0.1:8788` (`pnpm build`, bundle `index-CaBpcsHW.js` and `index-DDkSzQuO.css`, which holds `max-height:calc(100dvh - 2*var(--gap))`; then `tsx src/transports/node/main.ts` with `ASV_PORT=8788`, `ASV_STATIC_ROOT=dist`, `ASV_ALLOWED_ORIGINS=http://127.0.0.1:8788`, `ASV_LOG_FILE` and `ASV_VAULT_FILE` in a scratch folder, not tunnel mode, dev mailer, in-memory accounts, per-process keys) | W | qa-tester · Opus 5.5 | not published (orchestrator) |

Checklist: `33fcba30f63f`

**Plan.** Diff `5a9ebb5...31c19ff`: `src/web/styles.css` (`.legal-page` gets `max-height: calc(100dvh - 2 * var(--gap))`; the box keeps the user-agent `dialog` height `fit-content`), one unit test in `src/web/App.test.tsx`, the `web-ui/04` "Legal page scroll (#126)" note, and the test plan (JRN-19). Domains in:
- UI: UI-01 at 320 × 568, 390 × 844, 768 × 1024, 844 × 390, 1440 × 600 and 1440 × 900; UI-02; UI-03 on Firefox and WebKit, because `dvh` is a recent viewport unit; UI-04 dark.
- FON: JRN-19 first, then the JRN-16 and JRN-17 regressions, then the smoke of JRN-01, JRN-03 and JRN-04.
- A11Y: the heading outline (JRN-16) and the Escape focus return (JRN-17) only.

Domains out:
- DAT, PRI, ROB, PERF: no protocol, server, persistence or transport change. The bundle is 291.17 kB, as on #121.
- SEC: the security part was not run; the diff changes one CSS declaration.
- MOB: no native app.

**Rules of engagement.**
- Allowed host: `127.0.0.1` only. asvchat.fr and the tunnel were never touched.
- Accounts: one guest and two throw-away members on `example.test` addresses, on the in-memory store. The test script read the dev-mailer codes from the server output in the scratch folder. Each code was used once and written nowhere else.
- Server: started through Bash, because `.claude/launch.json` only has the Vite entries (as on #23, #63, #64, #89, #91 and #121). It was restarted once, for the Firefox and WebKit runs, and stopped at the end.

**Tools.** A scratch Node script on `playwright-core` 1.64.1 (Chromium 1248, then Firefox 1555 and WebKit 2370), one browser context per user. Sizes were set with `setViewportSize` and the scheme with `emulateMedia({ colorScheme })`.

For each page, the script measured these values in the page:
- the `getBoundingClientRect` of the box;
- `scrollHeight` and `clientHeight`;
- the content height: the bottom of the last child, plus padding and border;
- `documentElement.scrollWidth`.

Then it scrolled the box with the **mouse wheel** over it until `scrollTop` stopped moving. It read the rectangle of "fermer" and hit-tested its centre with `elementFromPoint`. It clicked "fermer" with the **mouse** at that point and checked that the page's `dialog` was gone.

The page's CSP (`style-src 'self'`) blocks injected style tags. The control case therefore set `max-height: none` through the CSSOM on the open box. Product files were not changed.

## QA matrix

Gate ✅ · 🔴 Must 0 · 🟡 Should 0 · 🔵 Nice 0 — 31 checks: Pass 24 · Fail 0 · Mixed 0 · Not tested/N/A 7

### JRN-19 (the diff)

How to read the rows below:
- **Capped** means the box is `max-height` tall. Its top is at 12 px and its bottom at the viewport height minus 12 px (`--gap`), and `scrollHeight > clientHeight`.
- **Fits** means the box is as tall as its text: box height equals content height, and `scrollHeight == clientHeight`.
- In every case, "fermer" ends fully inside the viewport, the hit-test returns "fermer" itself, the mouse click closes the page, and `documentElement.scrollWidth` equals the viewport width (no horizontal scroll).
- Light and dark gave identical geometry. Background `rgb(230, 230, 250)` light and `rgb(42, 42, 68)` dark.

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-19a-320 | UI | Entry footer, 320 × 568 | Pass | PASS | rules **capped**: box 12–556, scroll 615 > 540, scrolled 75 px, "fermer" 509–542. Notice **fits** (472 px). Privacy **capped**: 12–556, 1513 > 540, scrolled 973 px, "fermer" 509–542. Light and dark | | 01, 02, 11, 12 |
| JRN-19a-390 | UI | Entry footer, 390 × 844 | Pass | PASS | rules **fits** (556 px). Notice **fits** (409 px). Privacy **capped**: 12–832, 1354 > 816, scrolled 538 px, "fermer" 785–818. Light and dark | | 03, 04, 13 |
| JRN-19a-768 | UI | Entry footer, 768 × 1024 | Pass | PASS | width 720 (`max-width`). All three **fit**: rules 346, notice 304, privacy 791 px (bottom 803 of 1024). Light and dark | | 05 |
| JRN-19a-844x390 | UI | Entry footer, 844 × 390 (phone landscape) | Pass | PASS | rules and notice **fit** (bottom 358 and 316 of 390). Privacy **capped**: 12–378, 787 > 362, scrolled 425 px, "fermer" 331–364. Light and dark | | 06, 07, 14 |
| JRN-19a-1440x600 | UI | Entry footer, 1440 × 600 | Pass | PASS | rules and notice **fit**. Privacy **capped**: 12–588, 787 > 572, scrolled 215 px, "fermer" 541–574. Light and dark | | 08, 09 |
| JRN-19a-1440x900 | UI | Entry footer, 1440 × 900 | Pass | PASS | All three **fit**, so nothing scrolls: rules 346, notice 304, privacy 791 px, "fermer" clicked. Light and dark | | 10, 15 |
| JRN-19b | UI | Privacy page from the account panel (guest in Blabla, "Mon compte" then "confidentialité"), the same 6 sizes, light and dark | Pass | PASS | The same geometry as the entry privacy page at every size: capped at 320, 390, 844 × 390 and 1440 × 600, fits at 768 and 1440 × 900. "fermer" was reached by the wheel, hit-tested and clicked in all 12 cases. After it closes, the account panel is still open (`dialog:modal` count 1), as the study says | | 17–28 |
| JRN-19-short | UI | Short pages not stretched at 1440 × 900 | Pass | PASS | Box height equals text height: notice 304 px and rules 346 px in a 900 px viewport. The dropped `height: auto` is not needed: the computed height stays `fit-content` | | 10, 15 |
| JRN-19-control | UI | Base behaviour reproduced without the fix | Pass | PASS | Privacy at 390 × 844 with `max-height` removed in the page: box 12–1370 px in an 844 px viewport, so "fermer" is out of reach. This is #126 as filed, and it proves that the head's `max-height` declaration is what fixes it | #126 | 16 |
| JRN-19-engines | UI | Firefox 1555 and WebKit 2370 | Pass | PASS | The same 48 cases on each engine: 0 deviations, the same box geometry (privacy 390: 12–832, 1354 > 816), and the control at 1370 px. The first WebKit attempt aborted before writing its results, and its error was not kept. The rerun on the same server completed all 48 cases plus the regressions and the smoke, so this is recorded as a harness hiccup, not a product defect | | |

### Regressions and smoke

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-16 | A11Y | One `h1` with each legal page open | Pass | PASS | Entry with each page open (1440 light, 390 dark): `h1 asv` → `h2 Entrer sans compte` → `h2 Membres` → `h2 <page>`. Room, account panel and privacy page (1440 and 390, light and dark): `h1 asv` → `h2 # Blabla` → (`h2 Membres (1)` at 1440) → `h2 Mon compte` → `h2 confidentialité`. Identical on the 3 engines | | 15, 23 |
| JRN-17 | A11Y | Escape still closes the account modal with its privacy page open | Pass | PASS | At 1440 × 900, 390 × 844 and 844 × 390, Escape was pressed twice: once with focus on "confidentialité" just after opening it, and once with focus on the privacy page's "fermer". Each time: 0 `dialog:modal`, 0 open `.legal-page`, focus on "Mon compte". Identical on the 3 engines | | 29 |
| JRN-01 | FON | Enter as a guest with pseudo, gender, age, city | Pass | PASS | QaLegalG (F, 25, Nantes) entered and the rooms list was shown | | |
| JRN-03 | FON | Join a room | Pass | PASS | Blabla joined, message field present | | 17–28 |
| JRN-04 | FON | Private conversation, two members | Pass | PASS | QaLegalA opened "message privé" from QaLegalB's pseudo menu and sent "salut qa126"; the text was shown on QaLegalB's page (on all 3 engines) | | 30 |
| JRN-02, JRN-05…JRN-15, JRN-18 | FON | Other journeys | Not tested/N/A | NOT TESTED | outside the diff; their last evidence stays in `test-plan.md` | | |
| JRN-19 | UI | Test plan: legal pages scroll | Pass | PASS | a and b above: 6 sizes, light and dark, 3 engines | | 01–29 |

### Checklist items

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| FON-01 | FON | Nominal journey per the acceptance criteria of #126 | Pass | PASS | The privacy page at 390 px: its "fermer" is reachable by scrolling inside the page and closes it (JRN-19a-390) | | 03, 04 |
| FON-02 | FON | Every path the diff touches | Pass | PASS | All `.legal-page` openers: the 3 entry footer links and the account panel's "confidentialité" | | 01–28 |
| UI-01 | UI | Viewports | Pass | PASS | 6 sizes, no horizontal scroll (`scrollWidth` equals the viewport width in every case) | | 01–28 |
| UI-02 | UI | Console and network | Pass | PASS | 0 console messages, 0 page errors and 0 HTTP ≥ 400 across the three engine runs | | |
| UI-03 | UI | Firefox, WebKit | Pass | PASS | JRN-19-engines | | |
| UI-04 | UI | Dark scheme | Pass | PASS | All 24 dark cases per engine. Text and box colours follow the dark tokens | | 11–15, 25–28 |
| A11Y-01 | A11Y | Keyboard (focus return only) | Pass | PASS | JRN-17 Escape → "Mon compte". Escape on a legal page opened from the entry footer is #59, not re-run | #59 | 29 |
| A11Y-02 | A11Y | Semantics (outline) | Pass | PASS | JRN-16 | | |
| A11Y-04, A11Y-05 | A11Y | Contrast, target size | Not tested/N/A | NOT TESTED | no colour or control change; A11Y-05 already tracked by #105 | #105 | |
| A11Y-14 | A11Y | Screen reader | Not tested/N/A | NOT TESTED | Orca missing; no semantic change | | |
| PERF-01 | PERF | Lab budget | Not tested/N/A | NOT TESTED | one CSS declaration; bundle unchanged at 291.17 kB; known #98 | #98 | |
| SEC-01…SEC-10 | SEC | Security probes | Not tested/N/A | NOT TESTED | security part not run (CSS only); last evidence: FL · 9913901 | | |
| ROB-11 | ROB | Firmware safety | Not tested/N/A | N/A | no firmware | | |
| MOB-03 | MOB | iOS simulator | Not tested/N/A | N/A | no native app; phone sizes emulated in the browser only | | |

Shots (prefix `2026-11-06-126-`):

| No. | Name |
|---|---|
| 01 | `entry-rules-top-320x568-light` |
| 02 | `entry-rules-fermer-320x568-light` |
| 03 | `entry-privacy-top-390x844-light` |
| 04 | `entry-privacy-fermer-390x844-light` |
| 05 | `entry-privacy-top-768x1024-light` |
| 06 | `entry-privacy-top-844x390-light` |
| 07 | `entry-privacy-fermer-844x390-light` |
| 08 | `entry-privacy-top-1440x600-light` |
| 09 | `entry-privacy-fermer-1440x600-light` |
| 10 | `entry-notice-top-1440x900-light` |
| 11 | `entry-privacy-top-320x568-dark` |
| 12 | `entry-privacy-fermer-320x568-dark` |
| 13 | `entry-notice-top-390x844-dark` |
| 14 | `entry-rules-top-844x390-dark` |
| 15 | `entry-rules-top-1440x900-dark` |
| 16 | `control-privacy-no-max-height-390x844-light` |
| 17 | `account-privacy-top-320x568-light` |
| 18 | `account-privacy-fermer-320x568-light` |
| 19 | `account-privacy-top-768x1024-light` |
| 20 | `account-privacy-fermer-768x1024-light` |
| 21 | `account-privacy-top-844x390-light` |
| 22 | `account-privacy-fermer-844x390-light` |
| 23 | `account-privacy-top-1440x900-light` |
| 24 | `account-privacy-fermer-1440x900-light` |
| 25 | `account-privacy-top-390x844-dark` |
| 26 | `account-privacy-fermer-390x844-dark` |
| 27 | `account-privacy-top-1440x600-dark` |
| 28 | `account-privacy-fermer-1440x600-dark` |
| 29 | `account-escape-closed-390x844-light` |
| 30 | `jrn04-private-received-1440-light` |

All shots are Chromium. Shots 20 and 24 show a page that fits, so nothing scrolled. Numbers were measured on all three engines.

## Findings to act on

None. #126 is fixed on 31c19ff (JRN-19, control case 16).

Seen and not filed: the code-sent notice stays in the page banner after sign-in (shot 30, known #68). #59, about focus and Escape on a legal page opened from the entry footer, is still open and was not re-run, since the study keeps it out of #126.

## Not tested

- JRN-02, JRN-05…JRN-15, JRN-18: outside the diff; their last evidence stays in `test-plan.md`.
- SEC-01…SEC-10: security part not run; the diff is one CSS declaration.
- A11Y-04, A11Y-05, A11Y-14, PERF-01: no colour, control, semantic or asset change. A11Y-14 needs Orca.
- A real phone and Safari on macOS: needs a device or a Mac. WebKit on Linux and emulated sizes stand in for them.

## Delta vs previous report

- `2026-11-05-64-one-h1-pass.md` (0d48cd1), the report that filed #126 (privacy page overflow at 390 px, Must): fixed. Now 12–832 px at 390 × 844, and the control without the fix reproduces the 1370 px box.
- `2026-11-06-63-account-modal-pass.md` (e4b4223), which noted the overflow from the panel: fixed (JRN-19b).
- `2026-11-06-121-aria-invalid-pass.md` (79bbd89): no overlap.

Fixed 1, still failing 0, new 0.

Gate line:

```
| QA local | ✅ pass (0 Must) · journey: entry footer → règles du chat / mentions légales / confidentialité → wheel to "fermer" → closed; room → Mon compte → confidentialité → same; 320 × 568, 390 × 844, 768 × 1024, 844 × 390, 1440 × 600, 1440 × 900, light and dark, Chromium + Firefox + WebKit (144 cases, 0 deviation) · regressions JRN-16 outline, JRN-17 Escape → "Mon compte" PASS · smoke JRN-01, JRN-03, JRN-04 PASS · inspector: console clean, no HTTP ≥ 400 · security: not run (CSS only) · domains: UI, FON, A11Y (DAT, PRI, PERF, SEC n/a: no server change) · report: docs/architecture/qa/2026-11-06-126-legal-scroll-pass.md |
```
