# QA pass — mark fields refused before sending with aria-invalid, issue #121 (2026-11-06)

QA pass of PR #135 on the local production build: every JRN-18 case (a…f) passes at 1440 and 390 px on the room field, a private window field (both sides of the conversation) and the entry city field, with the described ids resolving to the counter and the BR-090 notice; the smoke of JRN-01 and JRN-15 passes; one new Nice finding is filed (#137, the too-long state is described only by "501/500"), and the city notice link stays open in #120 as the study says.

| Level | Head SHA / base | Environment | Targets | Agent / model | Matrix page |
|---|---|---|---|---|---|
| pass (product part; security part not run) | 79bbd89 / 15e3d6c (`origin/main`, merge base) | local only (asv has no staging tier): own production build of the head on `http://127.0.0.1:8788` (`pnpm build`, bundle `index-CdyschGV.js`; then `tsx src/transports/node/main.ts` with `ASV_STATIC_ROOT=dist`, `ASV_ALLOWED_ORIGINS=http://127.0.0.1:8788`, `ASV_LOG_FILE` and `ASV_VAULT_FILE` in a scratch folder, not tunnel mode, dev mailer, in-memory accounts, per-process keys) | W | qa-tester · Opus 5.5 | not published (orchestrator) |

Checklist: `33fcba30f63f`

**Plan.** Diff `15e3d6c...79bbd89`: `src/web/screens/RoomScreen.tsx` and `PrivateWindows.tsx` (`aria-invalid` and `aria-describedby` on the composer field, ids `<field>-count` on the counter and `<field>-invisible` on the BR-090 notice), `src/web/screens/EntryScreen.tsx` (`aria-invalid` on the city field), unit tests, the `web-ui/04` "Refused fields" rule, the `web-ui/07` pointer and the test plan (JRN-18). Domains in: A11Y (A11Y-03, the diff), FON (JRN-18 first, then smoke JRN-01 and JRN-15), UI (UI-01 at 1440 × 900 and 390 × 844, UI-02). Domains out: DAT, PRI, ROB, PERF (no protocol, server, persistence or transport change), SEC (security part not run; client attributes only), UI-03 (no layout primitive changed, attributes only), UI-04 dark (no style change; not asked), MOB (no native app).

**Rules of engagement.** Allowed host `127.0.0.1` only (asvchat.fr and the tunnel never touched). Accounts: throw-away members on `example.test` addresses and one guest, on the in-memory store; dev-mailer codes read by the test script from the server output in the scratch folder, used once, written nowhere else. The server was started through Bash because `.claude/launch.json` only has the Vite entries (same as #23, #63, #64, #89, #91), and stopped at the end.

**Tools.** Playwright MCP 0.0.83 (Chromium) for the entry city at 1440 and the JRN-01 smoke; a scratch Node script on `playwright-core` 1.64.1 (Chromium 1248) with one isolated context per member for the room and private cases at 1440 × 900 and 390 × 844. Each state was read three ways: the DOM attributes, each `aria-describedby` id resolved with `getElementById` (tag, text, and that the id is unique in the document), and Chromium's computed accessibility node through CDP `Accessibility.getPartialAXTree` (`invalid` property and accessible `description`), which is what a screen reader receives. Text was set with `fill` and, once per field, typed key by key and fixed with Backspace.

## QA matrix

Gate ❌ · 🔴 Must 1 (A11Y-03 sub-check, pre-existing and deferred by the study to #120: the city notice is not linked to its field) · 🟡 Should 0 · 🔵 Nice 1 (#137) — 32 checks: Pass 17 · Fail 0 · Mixed 1 · Not tested/N/A 14

### JRN-18 (the diff)

Room cases were run on member QaAriaE in Blabla, at 1440 × 900 then 390 × 844. Private cases on the window QaAriaE opened from QaAriaF's pseudo menu (sender, 1440 and 390) and on QaAriaF's window for the same conversation (receiver, 1440). The private field id is `private-<conversationId>`, written below as `private-<c>`.

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-18a | A11Y | Room field with U+202E: `aria-invalid="true"`, described by the notice | Pass | PASS | `bonjour <U+202E> test` in `#message`: `aria-invalid="true"`, `aria-describedby="message-invisible"`, the id resolves to one `OUTPUT` "Caractères invisibles ou de contrôle : retire-les pour envoyer."; AX node `invalid: true`, description = the notice text; "envoyer" disabled; Enter leaves the text in the field. Same at 1440 and 390 | | 02, 06 |
| JRN-18b | A11Y | Room field over 500: described by the counter | Pass | PASS | 501 × `x`: `aria-describedby="message-count"`, the id resolves to one `SPAN` "501/500"; AX `invalid: true`, description "501/500". Boundary in code points: 500 × 😀 (1000 UTF-16 units) not marked, 501 × 😀 marked. Same at 1440 and 390. Description wording: #137 | #137 | 03 |
| JRN-18c | A11Y | Both: both ids | Pass | PASS | 501 × `x` + U+202E: `aria-describedby="message-count message-invisible"`, both ids resolve once; AX description "502/500 Caractères invisibles ou de contrôle : retire-les pour envoyer." (counter first, then notice). Same at 1440 and 390 | | 04, 07 |
| JRN-18d | A11Y | Same in a private window field | Pass | PASS | a, b, c and f replayed on the sender's window at 1440 and 390 and on the receiver's window at 1440: ids `private-<c>-invisible`, `private-<c>-count`, both in that order, each resolving to one element inside the same `dialog`; AX `invalid` and description as in the room. The room field stays unmarked while the private field is invalid (attributes per field). At 390 the notice and "envoyer" sit below the fold, reachable by scrolling (page 1356 px, scrolled to the end: "envoyer" bottom 818 px of 844; no horizontal scroll) | | 08, 09, 10, 11, 12, 13, 14, 17 |
| JRN-18e | A11Y | Entry city with U+202E: `aria-invalid="true"` | Pass | PASS | `Paris<U+202E>eteb`: `aria-invalid="true"`, notice shown, ENTRER disabled; same with U+200B and NUL; AX `invalid: true`. At 1440 (Playwright MCP) and 390 (script). No `aria-describedby` (AX description empty): out of this diff, the study leaves the link to #120 (see A11Y-03) | #120 | 01, 15, 16 |
| JRN-18f | A11Y | Each removed once fixed | Pass | PASS | room, private (both sides) and city: after the text is fixed, `aria-invalid` and `aria-describedby` are absent (not `"false"`), AX `invalid: false`, description empty, "envoyer" enabled. Transitions checked: notice → fixed; 501 → 500; both → notice only (`describedby` drops the counter id) → fixed; typed `ok<U+202E>` then Backspace. Empty field unmarked | | 05, 11 |
| JRN-18-edges | A11Y | BR-090 and BR-020 edges on the composers | Pass | PASS | U+200B and NUL marked with the notice; an emoji family with joiners (👨‍👩‍👧) not marked; 500 code points not marked; 501 emojis marked. Same on the room and both private sides, 1440 and 390 | | |

### Journeys (smoke and test plan)

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-01 | FON | Enter with a pseudo, gender, age, city | Pass | PASS | guest QaGuest121 (F, 25, Nantes) entered from the form, rooms list shown; refused city covered by JRN-18e; refused pseudo seen once ("Ce pseudo est déjà pris." on a pseudo still held by an earlier tab) | | 18 |
| JRN-02 | FON | Away, resume, leave | Not tested/N/A | NOT TESTED | outside the diff; last evidence in the test plan | | |
| JRN-03 | FON | Browse rooms, join | Pass | PASS | Blabla joined by six members over the runs | | 02 |
| JRN-04 | FON | Private conversation, two members | Pass | PASS | run as the set-up of JRN-18d twice (window opened from the pseudo menu, "salut" delivered to the other member) | | 08, 12, 17 |
| JRN-05, JRN-06 | FON | Ignore, directory search | Not tested/N/A | NOT TESTED | outside the diff; last evidence in the test plan | | |
| JRN-07 | FON | Sign in with an e-mail code | Pass | PASS | right code for six members from the entry form (the code step validates the six digits by itself) | | |
| JRN-08…JRN-14 | FON | Code step after a drop, device, deletion, legal pages, tunnel, BR-088, BR-089 | Not tested/N/A | NOT TESTED | outside the diff; last evidence in the test plan (JRN-12 needs the owner's tester secrets) | | |
| JRN-15 | FON | BR-090 refusal (smoke) | Pass | PASS | room: "bonjour qa121" delivered to the other member; `pirate <U+202E> txt` + Enter not sent, kept in the sender's field, absent on the receiver; city refused (JRN-18e) | | 02, 15 |
| JRN-16, JRN-17 | A11Y | One `h1`; account panel modal | Not tested/N/A | NOT TESTED | outside the diff; last evidence in the test plan | | |
| JRN-18 | A11Y | Test plan: refused fields marked | Pass | PASS | a…f and edges above, 1440 and 390 | #137 | 01–17 |

### Checklist items

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| FON-01 | FON | Nominal journey per the acceptance criteria of #121 | Pass | PASS | JRN-18a…f: attributes set while refused, removed when fixed, read on the production build | | 01–17 |
| FON-02 | FON | Every path the diff touches | Pass | PASS | room composer, private composer on both sides, entry city; set by paste-like `fill` and by typing; fixed by editing and by Backspace | | 01–17 |
| A11Y-01, A11Y-02 | A11Y | Keyboard, semantics | Not tested/N/A | NOT TESTED | no focus or heading change in the diff; open #131, #59 unchanged | #131, #59 | |
| A11Y-03 | A11Y | Errors announced: `aria-invalid` on the field and a message that says how to fix | Mixed | FAIL | the two composers pass (`aria-invalid`, description resolved, removed when fixed). Sub-check failed, pre-existing and out of this diff by the validated study: the city field is marked invalid but its notice is not tied to it, so its accessible description is empty (#120). Polish: the too-long description is only "501/500" (#137, Nice) | #120, #137 | 01, 03, 15, 16 |
| A11Y-04, A11Y-05 | A11Y | Contrast, target size | Not tested/N/A | NOT TESTED | no colour or size change; A11Y-05 known #105 | #105 | |
| A11Y-14 | A11Y | Screen reader | Not tested/N/A | NOT TESTED | Orca missing on this machine; Chromium's computed accessibility node (CDP) read instead for every state | | |
| UI-01 | UI | Viewports 1440 × 900 and 390 × 844 | Pass | PASS | no horizontal scroll (`scrollWidth` 390 at 390); room composer row and the notice fit at 1440 (shot 04); private composer at 390: notice wraps under the field, "envoyer" reachable by scrolling (JRN-18d) | | 04, 07, 14, 17 |
| UI-02 | UI | Console and network | Pass | PASS | script runs: 0 console messages, 0 page errors, 0 HTTP ≥ 400; MCP page: only the known `/favicon.ico` 404 | #62 | |
| UI-03 | UI | Firefox, WebKit | Not tested/N/A | NOT TESTED | no layout primitive changed (two ARIA attributes and two ids) | | |
| UI-04 | UI | Dark scheme | Not tested/N/A | NOT TESTED | no style change; not asked | | |
| PERF-01 | PERF | Lab budget | Not tested/N/A | NOT TESTED | no asset or transport change (bundle 291.17 kB vs 290.79 kB on #63); known #98 | #98 | |
| SEC-01…SEC-10 | SEC | Security probes | Not tested/N/A | NOT TESTED | security part not run (client attributes only); last evidence FL · 9913901, SC · 77d7c17, BI · fea172c | | |
| ROB-11 | ROB | Firmware safety | Not tested/N/A | N/A | no firmware | | |
| MOB-03 | MOB | iOS simulator | Not tested/N/A | N/A | no native app | | |

Shots (prefix `2026-11-06-121-`): 01 `entry-city-rlo-invalid-1440` · 02 `room-rlo-invalid-1440` · 03 `room-501-invalid-1440` · 04 `room-both-invalid-1440` · 05 `room-fixed-valid-1440` · 06 `room-rlo-invalid-390` · 07 `room-both-invalid-390` · 08 `private-rlo-invalid-sender-1440` · 09 `private-501-invalid-sender-1440` · 10 `private-both-invalid-sender-1440` · 11 `private-fixed-valid-sender-1440` · 12 `private-both-invalid-receiver-1440` · 13 `private-rlo-invalid-sender-390` · 14 `private-both-invalid-sender-390` · 15 `entry-city-rlo-invalid-390` · 16 `entry-city-rlo-invalid-390-focus` · 17 `private-both-invalid-sender-390-scrolled` · 18 `jrn01-guest-rooms-1440`. The red frame on the fields is the focus style, not an invalid style (the diff adds none). Shots 13 and 14 are unscrolled: the notice is below the fold there, shot 17 shows it.

## Findings to act on

1. 🔴 Must (known, pre-existing, deferred by the study) — A11Y-03 sub-check: the entry city field gets `aria-invalid="true"` but its BR-090 notice sits inside the `label` without `aria-describedby`, and Chromium computes its name as "ville" and no description, so a screen-reader user hears "invalid" without the reason (→ #120, open; `web-ui/04` assigns the link to it). The owner may waive it for PR #135 as the study already does.
2. 🔵 Nice — the too-long state is described only by "501/500" (→ #137, new). Suggested fix (not applied): a visually hidden text in or beside the counter while over 500, e.g. "message trop long : raccourcis-le", referenced by `aria-describedby`; decide in `web-ui/04`.

Seen and not filed: `favicon.ico` 404 (#62); the code-sent notice stays in the page banner after sign-in (#68); at 390 × 844 the private composer's notice and "envoyer" are below the fold until the page scrolls (layout tracked by #108 and #109).

## Not tested

- JRN-02, JRN-05, JRN-06, JRN-08…JRN-14, JRN-16, JRN-17: outside the diff; their last evidence stays in `test-plan.md`. JRN-12 needs the owner's tester secrets.
- SEC-01…SEC-10: security part not run; the diff adds ARIA attributes and ids only.
- A11Y-01, A11Y-02, A11Y-04, A11Y-05, UI-03, UI-04, PERF-01: no focus, heading, colour, size, layout, style or asset change.
- A11Y-14: Orca missing; the CDP accessibility node stands in for a screen reader (needs Orca or NVDA for a spoken check).
- 768 × 1024: not asked; no rule for that width in the diff.

## Delta vs previous report

`2026-11-05-91-invisible-chars-pass.md` (fea172c), its A11Y-03 finding #121: fixed on the two composers and on the city's `aria-invalid` (this pass); the city notice link stays with #120. `2026-11-06-63-account-modal-pass.md` (e4b4223): no overlap; its findings #130, #131, #132 unchanged. New 1 (#137).

Gate line:

```
| QA local | ❌ pass (1 Must: A11Y-03 city notice not linked, pre-existing, #120 per web-ui/04; 1 Nice #137) · journey: entry city U+202E / U+200B / NUL → fixed; member sign-in → Blabla → room field U+202E, 501, both, fixed → private window both sides, same cases, at 1440 and 390 · inspector: console clean (favicon #62), network clean, AX nodes read through CDP · security: not run (client attributes only) · domains: A11Y, FON, UI (DAT, PRI, PERF, SEC n/a: no server change) · report: docs/architecture/qa/2026-11-06-121-aria-invalid-pass.md |
```
