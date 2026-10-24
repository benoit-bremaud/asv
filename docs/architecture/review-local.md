# Local review — asv (brick 6, private conversations, ignore and directory, issue #46)

- Date: 2026-10-24
- Commit: 407940e
- Scope: branch `feat/46-brick-6-private-directory`, diff `main...HEAD`
- Checks run: design · docs · tests · security · correctness
- Verdict: ship. Must 0 · Should 0 open (all fixed in d0dbf10) · Nice 4 open (filed as #49)

## Pre-merge gate (head SHA 407940e)
| Step | Result |
|---|---|
| 1 Tests | ✅ 591 tests (`pnpm verify`): typecheck, lint, tests and build all green |
| 2 Coverage | tests about 98.5 % stmts / 93.8 % branches (floor 80) |
| 3 SonarQube | ✅ PASSED on 407940e (new coverage 97 %, 0 duplication). The first scan on 0692488 failed on 7 new issues (cognitive complexity, nested ternary, `role="dialog"`, non-native key handler), fixed in 027c37c and 407940e |
| 4 Secrets | ✅ gitleaks clean (`main..HEAD`) · no tracked .env · diff read: nothing sensitive |
| 5 QA pass | ✅ full: two members (Lola, Max) on two tabs; search by city, pseudo menu, private message both ways, minimise with an unread counter, phone layout (375 px, no horizontal scroll). Console: WebSocket errors only from before the allowed-origins fix of the QA config. Network: no failed request apart from the dev-only StrictMode abort of `/api/stats`. Screenshots: `docs/architecture/qa/2026-10-24-brick6-*.jpg` |
| 5b Security probes | S1 headers ❌ none sent → #48 · S2 cookie `HttpOnly` + `SameSite=Lax` ✅ but `Secure` hard-coded off → #50 · S3 forged or missing `Origin` on `/ws` and `/account/*` refused 403 ✅ · S4 XSS payloads: refused as pseudo, kept as text in city and messages, rendered through React text nodes only (no `innerHTML`) ✅ · S5 private actions without an account refused, foreign `closePrivate` / `ignore` ignored, moderator commands refused ✅ · S6 bad JSON, wrong types and unknown types refused with `invalid`, a 200 kB frame closes the socket (1009), the server stays up ✅ · S7 room flood throttled after 4 posts ✅, 30 searches unthrottled → #49 · S8 404 and 400 answers carry no stack or path ✅ · S9 prod bundle: no source map, no secret, 280 kB JS (87 kB gzip) ✅ · S10 no third-party host ✅ |
- Gate: **GREEN — merge authorised**

## 🔴 Must Have
_None._

## 🟡 Should Have
_None open. Fixed in d0dbf10: presence hidden from ignored partners, partner lookup and text cap deduplicated, dead `MAX_WINDOWS` removed._

## 🔵 Nice to Have
- `src/domain/directory.ts` `[security]` · no rate limit on search · #49
- `src/domain/private.ts` `[design]` · conversation lookup scans for the pair · #49
- `src/domain/directory.ts` `[correctness]` · whether an away chatter's rooms show in search (ADR-0011) · #49
- `src/domain/directory.ts` `[security]` · excluding blocked sessions from the results reveals a block · #49

## ⚪ Disagree / Intentional
- Out of scope, found during QA: no secure headers (CSP, frame-ancestors, nosniff, referrer-policy) although the security study requires them. Filed as #48 (P1).

## Per-dimension summary
- Design: pure domain, dependency rule respected · Docs: studies updated for BR-043 (cap 3, targetBusy) · Tests: domain, hub, store and UI covered · Security: no leak; the block is hidden by checking `targetBusy` first · Correctness: shadows close conversations on leave, away, resume and unlink
