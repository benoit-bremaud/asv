# Local review — asv (brick 6, private conversations, ignore and directory, issue #46)

- Date: 2026-10-24
- Commit: 2274842
- Scope: branch `feat/46-brick-6-private-directory`, diff `main...HEAD`
- Checks run: design · docs · tests · security · correctness
- Verdict: ship. Must 0 · Should 0 open (all fixed in d0dbf10) · Nice 4 open (filed as #49)

## Pre-merge gate (head SHA 2274842)
| Step | Result |
|---|---|
| 1 Tests | ✅ 591 tests (`pnpm verify`): typecheck, lint, tests and build all green |
| 2 Coverage | tests about 98.5 % stmts / 93.8 % branches (floor 80) |
| 3 SonarQube | ⏳ to run with `pnpm sonar` on the head SHA after the push |
| 4 Secrets | ✅ gitleaks clean (`main..HEAD`) · no tracked .env · diff read: nothing sensitive |
| 5 QA pass | ✅ full: two members (Lola, Max) on two tabs; search by city, pseudo menu, private message both ways, minimise with an unread counter, phone layout (375 px, no horizontal scroll). Console: WebSocket errors only from before the allowed-origins fix of the QA config. Network: no failed request apart from the dev-only StrictMode abort of `/api/stats`. Screenshots: `docs/architecture/qa/2026-10-24-brick6-*.jpg` |
- Gate: **GREEN once SonarQube passes**

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
