# QA pass — code step kept across a resume, issue #72 (2026-11-02)

QA pass on the running product for branch `fix/72-keep-code-step-on-resume`: on e774c8c the code step survived a socket drop and a reload but a dead code step came back after the code was exhausted; the re-check on 09f44e7 (last section) finds every finding fixed.

| Level | Head SHA | Environment | Targets | Agent / model | Matrix page |
|---|---|---|---|---|---|
| pass | e774c8c, re-check 09f44e7 | local: dev server `http://localhost:5173` (Vite + Node transport on 127.0.0.1:8787, dev mailer, in-memory store) and own production build on `http://localhost:8799` (Node transport, `ASV_STATIC_ROOT=dist`, no `ASV_TUNNEL`) | W | qa-tester · Opus 5.5 (product part and SEC-01…10 in one run) | not published (orchestrator) |

Allowed hosts: `localhost`, `127.0.0.1`. Production (`asvchat.fr`) and `~/.config/asv/tester.env` were not touched.
Accounts: throw-away `*@asv.test` addresses on the in-memory store; the sign-in code was read from the dev
mailer line `mailer.dev_only` in the server log (never written here). Browser: Playwright MCP (Chromium),
viewport 375 × 812; the built-in pane dropped its mobile emulation mid-run and was abandoned.
Socket drop simulated by closing the live `/ws` socket from the page (CDP `Runtime.queryObjects` on
`WebSocket.prototype`, then `close(4000)`); `context.setOffline` does not cut a localhost WebSocket.
Node was v22.21.1, below the `engines` floor 22.22.2 (pnpm warning only, no effect seen).

Plan: domains in FON, UI, PRI, ROB, SEC (diff touches `src/web/connection.ts` and `src/web/store.ts`: client
storage, resume path, account panel). Domains out: A11Y beyond the code field (no markup change), PERF (no
bundle change beyond a few lines), DAT (no server or protocol change), MOB (no native app), firmware.

## QA matrix

Gate ❌ · 🔴 Must 1 · 🟡 Should 0 · 🔵 Nice 3 — 27 checks: Pass 20 · Fail 3 · Mixed 0 · Not tested/N/A 4

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| FON-01 | FON | #72 acceptance: enter, "Mon compte", e-mail, "recevoir mon code", code step | Pass | PASS | code step shown; `asv.codeUntil` = `codeSent` + 595.7 s (10 min minus the 4 s elapsed) | | 01, 02 |
| FON-01a | FON | (a) socket drop at the code step | Pass | PASS | frames: close → new `/ws` → `resume` → `resumed` (no `accountId`); "Connexion perdue, on se reconnecte…" during the gap; dialog open on the code step after 4 s | | 03 |
| FON-01b | FON | (b) full page reload at the code step | Pass | PASS | after reload: `resume` → `resumed`, panel reopened on the code step; same on the production build (8799) | | 04 |
| FON-01c | FON | (c) right code after the reload | Pass | PASS | `verifyCode` → `accountLinked` with `deviceClaim`; "Connecté·e comme membre."; `asv.codeUntil` removed, only `asv.session` left | | 05 |
| FON-01d | FON | (d) `asv.codeUntil` holds a number only | Pass | PASS | value matches `^\d+$` (dev and production build); no e-mail or code in session or local storage | | |
| FON-02 | FON | Diff's failure branches: signed-in drop, expired / garbage deadline, code exhausted, "nouveau code" | Fail | FAIL | signed in + drop: panel stays closed ✅; past deadline, `abc`, `<script>` value: no restore, key removed ✅; **after `codeExhausted` the key stays, a reload reopens a dead code step, the next code gets `codeMissing`, and the key still stays (loop until the 10 min end)** ❌ | F1 | 07 |
| FON-08 | FON | State diagram `web-ui/06` as oracle, refresh mid-flow | Fail | FAIL | `WaitingCode → AskEmail` on "code expired or invalidated" is undone by the next resume (see F1); "nouveau code" (AskEmail) also flips back to WaitingCode on reload | F1, N2 | |
| FON-09 | FON | Rooms regression: join Blabla, post | Pass | PASS | `postRoom` → `roomMessage`, message shown | | 06 |
| UI-01 | UI | 375 × 812, no horizontal scroll | Pass | PASS | `scrollWidth` 375 = viewport; dialog 23–363 px; code input 312 × 33 px, `inputmode=numeric`, `autocomplete=one-time-code` | | 02–05 |
| UI-02 | UI | Console and network | Pass | PASS | production build: requests `/`, one JS, one CSS, `/api/stats`, all same origin, console empty; dev: React DevTools info, StrictMode "WebSocket is closed before the connection is established" (dev noise, absent from the production build), favicon 404 (#62) | #62 | |
| ROB-01 | ROB | Network cut mid-flow | Pass | PASS | banner during the gap, resume within the 1 s backoff, code step kept | | 03 |
| PRI-01 | PRI | No personal data in URL, storage, logs | Pass | PASS | sessionStorage: `asv.session` (resume token, profile: gender and age, as documented) and `asv.codeUntil` (number); localStorage empty; storage empty after "quitter"; server log of 8799 holds no e-mail | | |
| INS-WS | SEC | WebSocket frames, both directions | Pass | PASS | only documented types; `resume` carries token + profile; no e-mail echoed back; code only in `verifyCode` out | | |
| SEC-01 | SEC | Security headers | Fail | FAIL (known) | CSP `default-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`, nosniff, `Referrer-Policy: no-referrer`, COOP / CORP same-origin, `X-XSS-Protection: 0`, no `Server`, `/api/stats` `no-store`; still no `Permissions-Policy`; no explicit `object-src 'none'` (falls back to `'self'`); HSTS only in tunnel mode (not run) | #69 | |
| SEC-02 | SEC | Cookies | Pass | PASS | `asv_device`: HttpOnly, SameSite=Lax, Path=/, 30 days; `Secure` off on plain HTTP by design (BR-086); no `__Host-` prefix (#70 N9) | #70 | |
| SEC-03 | SEC | Origin / CSWSH | Pass | PASS | WS upgrade with `Origin: https://evil.test` and `null`: 403; own origin: 101; `/account/sign-out` with both: 403; no `Access-Control-*` header; OPTIONS 404 | | |
| SEC-04 | SEC | XSS | Pass | PASS | `<img src=x onerror=…>` and `"><svg onload=…>` in a room message shown as text, no element created, no dialog fired; garbage in `asv.codeUntil` ignored | | 06 |
| SEC-05 | SEC | Authn / authz | Pass | PASS | before `enter`: `verifyCode`, `requestCode`, `postRoom` → `forbidden`; forged resume token → `resumeRefused`; `verifyCode` with an extra `accountId` field → stripped, `codeMissing` | | |
| SEC-06 | SEC | Input limits | Pass | PASS | numeric code, 5 000-char code, bad JSON → `invalid`; socket stayed usable (`joinRoom` answered) | | |
| SEC-07 | SEC | Rate limits | Pass | PASS | 8 entries 150 ms apart from one IP: 4 `entered` then `entryRefused: rate` (plus one earlier entry in the window: 5 per minute); UI shows "Trop d'essais, attends une minute."; 5 wrong codes → `codeExhausted` | | |
| SEC-08 | SEC | Error leaks | Pass | PASS | 404 plain text "404 Not Found"; `/account/device` bad JSON and wrong types → 400 empty body; TRACE / PUT / DELETE → 404 | | |
| SEC-09 | SEC | Bundle | Pass | PASS | `dist/` has no `.map`; no key or token pattern; only URLs: react.dev error page, W3C namespaces | | |
| SEC-10 | SEC | Third parties | Pass | PASS | production build loads same-origin requests only | | |
| UI-03 | UI | Firefox, WebKit | Not tested/N/A | NOT TESTED | Chromium only; no CSS change in the diff | | |
| FON-08b | FON | `resumeRefused` / `expelled` clear the key in the browser | Not tested/N/A | NOT TESTED | needs a server restart or a moderator; covered by unit tests in `connection.test.ts` | | |
| A11Y-01 | A11Y | Dialog modal, Esc, focus | Not tested/N/A | N/A | unchanged by the diff; known #63 (`dialog` still non-modal: `:modal` false) | #63 | |
| MOB-03 | MOB | Real phone / iOS | Not tested/N/A | NOT TESTED | no native app; a real phone tab suspend (iOS Safari, Android Chrome) was simulated, not reproduced on a device | | |

## Findings to act on

1. 🔴 Must — **F1** `fix(web): clear the code deadline when the server drops the pending code` (FON-02, FON-08, BR-087).
   - Seen: after the fifth wrong code the server answers `warning codeExhausted` and the panel goes to the
     e-mail step, but `asv.codeUntil` stays. A reload (or any socket drop) within the 10 minutes sends
     `codeStepRestored`, so the panel reopens on the code step for a code the server no longer holds (shot 07).
     Typing any code then gets `codeMissing`, the panel goes back to the e-mail step, and the key is still
     there: every later reload or network blip within 10 minutes reopens the same dead step.
   - Expected: BR-087 says the step comes back "since the server keeps the pending code under the same session
     id"; once the server answered `codeExpired`, `codeExhausted`, `codeMissing`, `blocked` or `gone`, it does
     not, and `web-ui/06` sends WaitingCode to AskEmail on "code expired or invalidated".
   - Repro: enter, "Mon compte", e-mail, "recevoir mon code", type `000000` five times, reload: code step shown.
   - Suggested fix (not applied), plus the same list in BR-087 and a unit test per code:

     ```diff
     --- a/src/web/connection.ts
     +++ b/src/web/connection.ts
     @@ const handle = (message: ServerMessage) => {
     +    } else if (message.type === "warning" && CODE_GONE.has(message.payload.code)) {
     +      // The server no longer holds the code: a resume must not bring the step back (BR-087).
     +      forgetCode();
     ```

     with `const CODE_GONE = new Set(["codeExpired", "codeExhausted", "codeMissing", "blocked", "gone"]);`
     (the warning codes that `store.ts` `ACCOUNT_WARNINGS` maps to `askEmail` after a code was sent).
   - Not filed: the defect is in the unmerged branch of #72, so it belongs in this branch; the owner decides
     (fix here, or a follow-up issue).
2. 🔵 Nice — **N1** the panel pops open on every resume while a code is pending, even after the user closed it
   with "fermer" (seen: close, drop, panel back on the code step). Intended by BR-087 for the mail-app round
   trip; an owner call whether "fermer" should also clear the deadline.
3. 🔵 Nice — **N2** "nouveau code" goes to the e-mail step locally but keeps `asv.codeUntil`, so a reload flips
   back to the code step. Harmless (the old code is still valid on the server) but it undoes the user's choice;
   clearing the key on "nouveau code" (or on the next `requestCode`) fixes it. Same root as F1 if the owner
   prefers one change.
4. 🔵 Nice — **N3** after a restore the code field is not focused (`document.activeElement` is `body`), so on a
   phone the user must tap the field before pasting the code. Not a regression (no autofocus before either);
   an `autoFocus` on the code input would help the #72 journey. Also tracked loosely by #63 (dialog focus).

Known, not re-filed: #62 favicon 404, #63 non-modal account dialog, #69 `Permissions-Policy` (add an explicit
`object-src 'none'` there too), #70 N9 cookie prefix.

## Not tested

- UI-03 Firefox / WebKit: Chromium only; would need Playwright MCP started with `--browser firefox` / `webkit`.
- `resumeRefused` and `expelled` clearing the key in the browser: needs a server restart mid-flow or a
  moderator (brick 8); unit tests cover it.
- Real device tab suspend (MOB-03): the drop was simulated by closing the socket; a check on a real Android
  Chrome and iOS Safari round trip to the mail app would close #72 for good.
- Tunnel mode (`Secure` cookie, HSTS): forbidden by the run rules (production config).

## Delta vs previous report

`docs/architecture/qa/2026-10-24-full-pass.md`: fixed 0 (no finding of that report was in scope), still failing
SEC-01 (#69), A11Y-01 (#63), UI-02 favicon (#62); new 1 Must (F1), 3 Nice (N1–N3).

## Screenshots

`2026-11-02-01-rooms-375` rooms after entry · `02-code-step-375` code step · `03-code-step-after-drop-375`
after the socket drop · `04-code-step-after-reload-375` after a full reload · `05-signed-in-375` signed in after
the right code · `06-room-xss-as-text-375` room post with markup shown as text ·
`07-dead-code-step-after-exhausted-375` code step restored after `codeExhausted` (F1).

## Re-check on 09f44e7

Same branch, same rules: Playwright MCP (Chromium) at 375 × 812, local tier only, `pnpm build` first, dev server
`http://localhost:5173` (dev mailer) and production build on `http://localhost:8799`. Fix commit `09f44e7`
(`fix(web): drop a dead code deadline and keep the panel as left on resume`): the deadline is dropped on every
warning that leads to the e-mail step, on "nouveau code" and on a resume with an account id; an in-memory resume
leaves the panel as the chatter left it; a restore resets `pendingVerify`; the code field has `autoFocus`.
Diff has no server or protocol change, so SEC-01…10 keep their verdicts from the first run (headers, bundle and
network re-read on the production build: same hosts, no `.map`).

Gate ✅ · 🔴 Must 0 · 🟡 Should 0 · 🔵 Nice 0 (new) — 10 checks: Pass 10 · Fail 0 · Mixed 0 · Not tested/N/A 0
(known and out of scope, unchanged: SEC-01 #69, favicon 404 #62, non-modal dialog #63).

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| F1 | FON | 5 wrong codes, then reload | Pass | PASS | warnings `codeWrong` ×4 then `codeExhausted`; panel on the e-mail step and `asv.codeUntil` already gone; after reload no dialog, key absent; a socket drop afterwards: no dialog | | 12 |
| N1 | FON | Close the panel on the code step, drop the socket | Pass | PASS | after `fermer` + drop + resume: no dialog, key kept; "Mon compte" reopens on the code step with the field focused. A full reload with the panel closed reopens it on the code step: that is BR-087's reload case (memory lost), as designed | | 14, 15 |
| N2 | FON | "nouveau code", then reload | Pass | PASS | "nouveau code" → e-mail step and key gone at once; after reload no dialog; "Mon compte" shows the e-mail step | | 13 |
| N3 | A11Y | Focus after a reload restore | Pass | PASS | `document.activeElement` = the code input (`autocomplete=one-time-code`), focus ring visible; also focused after a drop and on first display; dev and production build | | 10 |
| FON-01a | FON | (a) socket drop on the code step | Pass | PASS | panel stays on the code step, key unchanged | | 09 |
| FON-01b | FON | (b) full reload on the code step | Pass | PASS | panel reopened on the code step; production build too | | 10 |
| FON-01c | FON | (c) right code after the reload | Pass | PASS | `verifyCode` → `accountLinked`; "Connecté·e comme membre."; sessionStorage holds `asv.session` only; signed-in drop and reload: no dialog, no key | | 11 |
| FON-01d | FON | (d) `asv.codeUntil` a number only | Pass | PASS | `^\d+$`, `codeSent` + 599.2 s; localStorage empty (dev and production build) | | 08 |
| UI-02 | UI | Console and network on the production build | Pass | PASS | requests: `/`, one JS, one CSS, `/api/stats`, all same origin; console: favicon 404 only (#62) | #62 | |
| UI-01 | UI | 375 × 812, no horizontal scroll | Pass | PASS | screenshots 08–15, layout unchanged | | 08–15 |

Observation, not filed: a second `requestCode` for the same address within 60 s gets the usual `codeSent`
(anti-enumeration answer) and pushes the deadline to now + 10 min, while the server may still hold the earlier
code with an earlier expiry. At worst a reload in that last minute shows the code step, the next try gets
`codeExpired`, and the deadline is now dropped (F1 fix): no loop, no user harm.

Delta vs the first run: fixed 4 (F1, N1, N2, N3), still failing 0 of this report's findings, new 0.

Re-check screenshots: `2026-11-02-08-recheck-code-step-375` · `09-recheck-after-drop-375` ·
`10-recheck-after-reload-focus-375` · `11-recheck-signed-in-375` · `12-recheck-f1-no-dead-step-375` ·
`13-recheck-n2-email-step-375` · `14-recheck-n1-closed-after-drop-375` · `15-recheck-n1-reopened-code-step-375`.
