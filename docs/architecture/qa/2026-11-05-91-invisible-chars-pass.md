# QA pass — refuse control, bidi and zero-width characters, issue #91 (2026-11-05)

QA pass of PR #119 (BR-090) on the local production build: every JRN-15 case passes in the browser and through raw WebSocket frames, the smoke of JRN-01, JRN-03 and JRN-04 passes, and two new findings are filed (A11Y-03 `aria-invalid` missing, #121; entry notice wording, #122).

| Level | Head SHA / base | Environment | Targets | Agent / model | Matrix page |
|---|---|---|---|---|---|
| pass (product part; JRN-15e WebSocket probe and SEC-01/02/04/06 run here, security part not run) | fea172c / c8c3eaf (`origin/main`, merge base) | local only (asv has no staging tier): own production build `http://127.0.0.1:8788` (`pnpm build`, then `tsx src/transports/node/main.ts` with `ASV_STATIC_ROOT=dist`, `ASV_LOG_FILE` and `ASV_VAULT_FILE` in a scratch folder, not tunnel mode, dev mailer, in-memory accounts) | W, A | qa-tester · Opus 5.5 | not published (orchestrator) |

Checklist: `33fcba30f63f`

**Head moved during the run.** The caller named 9deefab. Commit fea172c ("show the BR-090 notice in an output element", SonarQube S6819, three web files, `role="status"` span → `<output>`) landed on the branch at 14:39 UTC, after the server process started (14:38 UTC) and before the browser loaded the page. The browser ran bundle `index-BTP5vXwG.js`; a rebuild at fea172c gives the same hash, so the client tested is fea172c. The server process loaded `src/` before fea172c, and `src/domain/`, `src/server/` and `src/transports/` are identical in 9deefab and fea172c. Every result below holds for both SHAs.

**Plan.** Diff `c8c3eaf...fea172c`: `src/domain/text.ts` (new `hasForbiddenChar`), `entry.ts` (city refused at entry and resume), `rooms.ts` and `private.ts` (`invalidText` refusal), `src/web/screens/EntryScreen.tsx`, `RoomScreen.tsx`, `PrivateWindows.tsx` (client check, disabled send, notice in an `<output>`), `strings.ts`, tests and study. Domains in: FON (JRN-15 a…e first, then BR-090 edges), DAT (refusal contract), UI (viewports, dark), A11Y (the new notice), USA (wording), PRI (logs), SEC-01/02/04/06 alongside. Smoke: JRN-01, JRN-03, JRN-04. Domains out: PERF (no asset or transport change; PERF-01 known #98, waived), ROB (no connection change), MOB (no native app), ROB-11 (no firmware), JRN-12 tunnel mode (needs the owner's tester secrets), UI-03 Firefox and WebKit (no layout primitive changed; one inline notice).

**Rules of engagement.** Allowed host `127.0.0.1` only (asvchat.fr and the tunnel never touched). Scripted clients bound to `127.0.0.91`…`127.0.0.94` so the probe used its own BR-007 entry budget. Accounts: two throw-away members on `example.test` addresses on the in-memory store; dev-mailer codes read from the server output, written nowhere. The production server was started through Bash because `.claude/launch.json` only has the Vite entries (same as #23 and #89); it was stopped at the end.

**Tools.** Playwright MCP 0.0.83 (Chromium) with two isolated browser contexts (QaBidiA, QaBidiB), CDP `Network.webSocketFrameSent` / `Received` for frames; Node `ws` 8 for the raw probe; `curl`; `jq` on the connection log. The first navigation of the session failed with `DNS_PROBE_FINISHED_NXDOMAIN` on a rewritten `www.127.0.0.1.com` (browser start-up, not the product); the second loaded normally.

## QA matrix

Gate ❌ · 🔴 Must 1 new (A11Y-03 sub-check, pattern predating #91, #121) plus the waived pre-existing P0 items (#105, #64, #98) · 🟡 Should 0 · 🔵 Nice 1 new (#122) — 47 checks: Pass 23 · Fail 1 · Mixed 2 · Not tested/N/A 21

### JRN-15 / BR-090 (the diff)

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-15a | FON | Room composer with U+202E, U+200B or NUL: send disabled, notice, text kept, nothing delivered | Pass | PASS | QaBidiA in Blabla, six texts filled one after the other: U+202E, U+200B, NUL, U+2066, U+00AD (and a leading U+FEFF, see JRN-15f). For each of the five: "envoyer" `disabled`, `<output>` "Caractères invisibles ou de contrôle : retire-les pour envoyer.", Enter pressed, field value unchanged. CDP on A: no `postRoom` frame sent for them; CDP on QaBidiB: no `roomMessage` for them | | 02, 03, 08-390, 08-768, 09 |
| JRN-15b | FON | Same in a private window between two members | Pass | PASS | QaBidiA and QaBidiB signed in with e-mail codes; A opens a private window to B, "coucou en privé" delivered. Then U+202E, U+200B, NUL, U+200F in A's window: "envoyer" `disabled`, notice in the window, Enter pressed, text kept; A sent no `sendPrivate` frame for them, B received no `privateMessage` for them and its window shows only the delivered lines | | 05, 06 |
| JRN-15c | FON | Emoji ZWJ sequence 👨‍👩‍👧 delivered | Pass | PASS | room: A sends "famille 👨‍👩‍👧 et Ly‌on" (U+200D twice, U+200C once), button enabled, no notice; B's `roomMessage.text` is byte-identical. Private: B sends "merci 👨‍👩‍👧" to A, A's `privateMessage.text` byte-identical | | 04, 05, 06 |
| JRN-15d | FON | City with U+202E keeps ENTRER disabled, at entry and at resume | Pass | PASS | browser: pseudo, age 30, both boxes ticked, ENTRER enabled; city "Lyon‮gpj.exe" (renders "Lyonexe.jpg"): ENTRER `disabled`, notice under the city, text kept; same for U+200B, NUL and a trailing "Lyon ‮"; "Ly‍on" (U+200D) leaves ENTRER enabled; city "Lyon" then enters. Raw frames: `enter` with that city → `error invalid`; `resume` with a valid token and that city → `error invalid`, then the same token with "Lyon" → `resumed` (the session was still there) | #122 | 01 |
| JRN-15e | SEC | Raw `postRoom` frame with U+202E: `warning invalidText`, nothing delivered | Pass | PASS | probe P and observer O (Node `ws`, allowed origin) in Blabla, plus QaBidiA and QaBidiB in the browser. P sends `postRoom` "regarde gpj.‮exe": P gets `warning {code: invalidText, replyTo: 3}`, O gets nothing, B's room shows nothing. From QaBidiA's own socket (in-page): `sendPrivate` with U+202E and with U+200B to QaBidiB, `postRoom` with NUL → three `warning invalidText` (replyTo 9001…9003); B received no frame; A's banner shows "Message refusé : caractères invisibles ou de contrôle." | | 07 |
| JRN-15f | FON | BR-090 edges through raw frames | Pass | PASS | `warning invalidText` and nothing to O for: interior U+FEFF, U+2028, U+034F, U+2800, C1 U+0085, TAB. "  U+FEFF  " → `warning empty` (trimmed to nothing). "U+FEFF ok U+FEFF" → delivered as "ok" (JavaScript `trim()` removes U+FEFF and U+2028 at the edges, on the client and the server alike; nothing invisible reaches anyone, as BR-090 "checked after trimming"). U+200C "Ly‌on" delivered unchanged. Guest `sendPrivate` with U+202E → `error accountRequired` (members only, checked first) | | |
| JRN-15g | PRI | Refused messages leave no contribution line | Pass | PASS | connection log after the run: 6 `open`, 4 `close`, 9 `contribution` = exactly the 9 delivered messages (3 room by A incl. the SEC-04 probe, 3 room by P, 3 private); no content, no refused attempt logged; `grep` of the log and server output for the message texts: 0 hits | | |

### Journeys (smoke)

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-01 | FON | Enter with a pseudo, gender, age, city | Pass | PASS | QaBidiA (age 30, Lyon) and QaBidiB (age 31, no city) entered in the browser; rooms list shown; refused pseudo and rate limit not re-run (entry rules unchanged apart from the city) | | 01 |
| JRN-02 | FON | Away, resume, leave | Not tested/N/A | NOT TESTED | not in scope; resume with a city covered at protocol level in JRN-15d | | |
| JRN-03 | FON | Browse rooms, join, post | Pass | PASS | both joined Blabla, posts delivered both ways; flood and user room not re-run | | 02, 04 |
| JRN-04 | FON | Private conversation, two members | Pass | PASS | A opens a window from B's pseudo menu ("message privé"), messages both ways, B's window opens on the first message; minimise not re-run | | 05, 06 |
| JRN-05 | FON | Ignore a chatter both ways | Not tested/N/A | NOT TESTED | outside the diff; last evidence in the test plan | | |
| JRN-06 | FON | Directory search | Not tested/N/A | NOT TESTED | outside the diff; last evidence in the test plan | | |
| JRN-07 | FON | Sign in with an e-mail code | Not tested/N/A | NOT TESTED | sign-in with a right code done for both members (JRN-15b set-up); wrong code and quota not re-run | | |
| JRN-08 | FON | Code step across a drop and a reload | Not tested/N/A | NOT TESTED | outside the diff; last evidence in the test plan | | |
| JRN-09 | FON | Remembered device, sign out | Not tested/N/A | NOT TESTED | outside the diff; last evidence in the test plan | | |
| JRN-10 | FON | Delete my account | Not tested/N/A | NOT TESTED | outside the diff; last evidence in the test plan | | |
| JRN-11 | FON | Legal pages | Not tested/N/A | NOT TESTED | outside the diff; last evidence in the test plan | | |
| JRN-12 | FON | Tunnel mode | Not tested/N/A | NOT TESTED | needs the owner's tester secrets | | |
| JRN-13 | FON | Frame budget (BR-088) | Not tested/N/A | NOT TESTED | outside the diff; last evidence in the test plan | | |
| JRN-14 | FON | Upgrade limits (BR-089) | Not tested/N/A | NOT TESTED | outside the diff; last evidence in the test plan | | |

### Checklist items

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| FON-01 | FON | Nominal journey per the acceptance criteria of #91 | Pass | PASS | JRN-15a…e | | 01–07 |
| FON-02 | FON | Every path the diff touches, with its failure branch | Pass | PASS | entry, resume, room, private; client branch (disabled) and server branch (`invalidText` / `invalid`) both exercised | | 01–07 |
| FON-03 | FON | Boundaries and classes on the new input rule | Pass | PASS | JRN-15f: allowed joiners vs forbidden format characters, edge vs interior, C0 / C1 / TAB, empty after trim | | |
| DAT-01 | DAT | Contract of the refusal | Pass | PASS | `warning` with `code: invalidText`, `message`, `replyTo` = the client `seq`; `error invalid` for the city; the client parses both (notice shown) | | 07 |
| DAT-02 | DAT | Persistence | Not tested/N/A | N/A | the diff persists nothing new (in-memory chat, BR-090 stores nothing) | | |
| UI-01 | UI | Viewports with the notice | Pass | PASS | room composer with a long BR-090 text at 390 × 844, 768 × 1024 and 1440 × 900: no horizontal scroll (`scrollWidth = clientWidth`); at 390 the notice wraps on two lines under the field, at 768 it pushes "smileys" and "envoyer" to a second line; nothing clipped | | 08-390, 08-768, 02 |
| UI-02 | UI | Console and network | Pass | PASS | console of both pages: only `favicon.ico` 404 (known #62); network: assets 200, `/api/stats` 200 every 30 s while on the entry screen only, `/account/device` 204; no other host | #62 | |
| UI-04 | UI | Dark scheme | Pass | PASS | dark emulated: notice `#ff7a70` on `#1b1b2f`, readable | | 09 |
| A11Y-03 | A11Y | Errors announced, `aria-invalid`, says how to fix | Mixed | FAIL | the notice is an `<output>` (implicit `role="status"`, polite) and says how to fix; sub-check failed: no `aria-invalid` on `#message`, the private composer or the city input, and the room / private notices are not tied to their field by `aria-describedby` (city link already in #120). Screen reader not run (Orca missing) | #121 | 01, 02, 05 |
| A11Y-04 | A11Y | Contrast of the notice | Pass | PASS | `--brand` on the page background: light `#b3261e` / `#fff8e7` 6.17 : 1, dark `#ff7a70` / `#1b1b2f` 6.65 : 1 (bold small text, ≥ 4.5 : 1) | | 02, 09 |
| A11Y-01 | A11Y | Keyboard only | Not tested/N/A | NOT TESTED | not re-run; Enter in the composer with a refused text sends nothing (JRN-15a) | | |
| A11Y-02, A11Y-05 | A11Y | Semantics (one `h1`), target size | Not tested/N/A | NOT TESTED | not re-run; known P0 failures #64 and #105, waived by the caller | #64, #105 | |
| PERF-01 | PERF | Lab budget | Not tested/N/A | NOT TESTED | not re-run (no asset or transport change, bundle 290 kB as before); known #98, waived by the caller | #98 | |
| USA-03 | USA | Messages say what happened and how to fix, input kept | Mixed | FAIL | composers: clear and actionable, text kept, server notice "Message refusé : caractères invisibles ou de contrôle." for a modified client; entry form: the city notice says "retire-les pour envoyer" on a screen whose button is ENTRER | #122 | 01, 07 |
| PRI-01 | PRI | No personal data or content in logs, URLs, storage | Pass | PASS | JRN-15g; storage: session storage key `asv.session` only, no local storage; cookie `asv_device` only | | |
| SEC-01 | SEC | Security headers | Fail | FAIL (known) | `curl -I /`: CSP `default-src 'self'` … `frame-ancestors 'none'; base-uri 'none'`, nosniff, `Referrer-Policy: no-referrer`, COOP / CORP; still no `Permissions-Policy` and no `object-src 'none'` | #69 | |
| SEC-02 | SEC | Cookies | Pass | PASS | `asv_device`: `HttpOnly`, `SameSite=Lax`, `Path=/`; not `Secure` on plain-HTTP localhost (tunnel mode not run) | | |
| SEC-03 | SEC | Origin / CSWSH | Not tested/N/A | NOT TESTED | security part not run | | |
| SEC-04 | SEC | XSS | Pass | PASS | `<img src=x onerror=alert(1)> "><svg onload=alert(1)>` posted in Blabla: shown as text on B, 0 `img` / `svg` in `main`, no dialog | | |
| SEC-05 | SEC | Authn / authz | Not tested/N/A | NOT TESTED | security part not run | | |
| SEC-06 | SEC | Input limits | Pass | PASS | for BR-090 only: 13 crafted texts and 2 crafted cities refused or delivered cleanly, server up, no socket closed, no error in the server output | | |
| SEC-07…SEC-10 | SEC | Rate limits, error leaks, bundle, third parties | Not tested/N/A | NOT TESTED | security part not run | | |
| ROB-11 | ROB | Firmware safety | Not tested/N/A | N/A | no firmware | | |
| MOB-03 | MOB | iOS simulator | Not tested/N/A | N/A | no native app | | |
| JRN-15 | FON | Test plan: BR-090 journey | Pass | PASS | a…g above | | 01–09 |

## Findings to act on

1. 🔴 Must — A11Y-03 sub-check: fields refused before sending carry no `aria-invalid` and the composer notices are not tied to their field (→ #121). Seen: the `<output>` notice is announced, but `#message`, the private composer and the city input stay unmarked; same for the existing BR-020 too-long state. Expected: `aria-invalid="true"` and `aria-describedby` while the refusal holds. Repro: Blabla, paste "a‮b" in the composer, inspect the input. Suggested fix (not applied), after the `web-ui` study:

   ```diff
   - <input id="message" value={text} maxLength={2000} autoComplete="off" onChange={(e) => setText(e.target.value)} />
   + <input id="message" value={text} maxLength={2000} autoComplete="off" aria-invalid={tooLong || invisible || undefined}
   +   aria-describedby={invisible ? "message-invisible" : undefined} onChange={(e) => setText(e.target.value)} />
   - {invisible && <output className="small too-long">{STRINGS.invisibleChars}</output>}
   + {invisible && <output id="message-invisible" className="small too-long">{STRINGS.invisibleChars}</output>}
   ```

   The pattern predates #91 (no field in `src/web` uses `aria-invalid`); the owner may waive it like #105, #64 and #98.
2. 🔵 Nice — USA-03: the entry city notice says "retire-les pour envoyer" while the button is ENTRER (→ #122). Suggested: a city-specific string such as "Caractères invisibles ou de contrôle dans la ville : retire-les pour entrer."

Seen and not filed (already tracked): `favicon.ico` 404 (#62); the "Si l'adresse peut recevoir un code…" banner stays after sign-in (#68); city notice inside its label without `aria-describedby` (#120).

## Not tested

- JRN-02, JRN-05…JRN-14: outside the diff; their last evidence stays in `test-plan.md`.
- SEC-03, SEC-05, SEC-07…SEC-10: security part not run (product part only); last evidence FL · 9913901 and SC · 77d7c17.
- A11Y-01, A11Y-02, A11Y-05, PERF-01: not re-run; A11Y-02 (#64), A11Y-05 (#105) and PERF-01 (#98) are known P0 failures the caller waived.
- Screen reader (A11Y-14): Orca missing on this machine.
- UI-03 Firefox / WebKit: not run (no layout primitive in the diff).
- JRN-12 tunnel mode: needs the owner's tester secrets.

## Delta vs previous report

`2026-11-05-23-socket-caps-full.md` (77d7c17): fixed 0, still failing 4 known (SEC-01 #69, A11Y-02 #64, A11Y-05 #105, PERF-01 #98; not re-run except SEC-01), new 2 (#121, #122).

Gate line:

```
| QA local | ❌ pass (1 Must: A11Y-03 #121, pre-existing pattern; waived P0s #105, #64, #98) · journey: entry → Blabla → post → private window, with BR-090 refusals · inspector: console clean (favicon #62), network clean, WS frames ok (invalidText, nothing delivered), storage ok · security SEC-01, 02, 04, 06: 3 ✅, SEC-01 ❌ → #69 (others not run) · domains: FON, DAT, UI, A11Y, USA, PRI (PERF, ROB n/a: no transport change) · report: docs/architecture/qa/2026-11-05-91-invisible-chars-pass.md |
```
