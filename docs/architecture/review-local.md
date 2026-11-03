# Local review — asv (branch fix/89-socket-frame-limit)

- Date: 2026-11-03
- Commit: cf4eda2
- Scope: branch diff origin/main...HEAD (BR-088 frame budget: `src/server/frame-budget.ts`, `src/server/hub.ts`, `src/transports/node/server.ts`, their tests, `platform/02`, `platform/04c`, business rules, traceability, test plan)
- Checks run: design · docs · tests · security · correctness (pre-push mode, QA pass at the pre-merge gate)
- Verdict: ship as-is after the fixes in cf4eda2 · Must 0 · Should 0 open (11 fixed) · Nice 4

## Pre-merge gate (head SHA cf4eda2)
| Step | Result |
|---|---|
| 1 Tests | ✅ `pnpm verify`: 651 passed (lint, typecheck, build green) |
| 2 Coverage | tests 98.61 % stmts / 94.4 % branches / lines 99 %+ (floor 80) · docs ~85 % of the new surface before fixes, public API now documented |
| 3 SonarQube | ✅ PASSED on b96ea98 (local SonarQube, ADR-0016) |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · no tracked .env · `pnpm audit` clean · diff read: nothing sensitive |
| 5 QA pass | ❌ full pass, waived: JRN-13 a–f all pass, SEC 9/10 (SEC-01 #69, pre-existing); red only on pre-existing P0s #105, #64, #98 · issues #104–#111 filed · report: docs/architecture/qa/2026-11-03-89-frame-limit-full.md |
- Gate: **GREEN under owner waiver (2026-11-03, MCDA 450/500)**: the three QA P0 failures (#105 tab close 16 px, #64 no `h1`, #98 LCP 2.6 s uncompressed locally) predate this PR, which does not touch them; each has its own issue.

## 🔴 Must Have
_None._

## 🟡 Should Have (all fixed in cf4eda2)
- `src/transports/node/server.ts` `[security|design|correctness]` · after an `invalidFrames` close, frames in flight still reached the hub and refreshed `lastSeen` · `refuse()` marks every closing socket, its frames are ignored and no longer refresh `lastSeen`.
- `src/server/frame-budget.ts` `[security|design|docs]` · a clock stepping back drained the bucket · elapsed time clamped at 0, unit test added.
- `src/server/hub.ts:53` `[design]` · `closeSocket(code?, reason?)` let the hub pick a WebSocket code · reason only, the transport maps it to 1008.
- `src/server/frame-budget.ts:22` `[design]` · unused `limits` parameter · removed.
- `src/server/frame-budget.ts` `[docs]` · `createFrameBudget` and `take` docstrings · added.
- `src/server/hub.test.ts` `[tests]` · only one invalid branch counted, sixth frame not checked · `it.each` over the three branches, sixth frame asserted not to re-close.
- `src/transports/node/server.test.ts` `[tests]` · nothing proved frames past the budget go unanswered, nor the fifth answer · pong count bounded to 40–41, exactly 5 answers before the 1008 close (the close now waits one turn so the fifth answer goes first).
- `platform/02` `[docs]` · last seen recorded before the size check; Cloudflare ping auto-response not covered · diagram and notes corrected.

## 🔵 Nice to Have
- `src/server/frame-budget.ts:9` `[design]` · `invalidInRow` is a hub setting kept next to the bucket limits; fine while BR-088 stays one rule.
- `src/server/hub.ts` `[correctness]` · `===` closes once; `>=` would retry if a close ever failed silently.
- `src/server/frame-budget.test.ts` `[tests]` · split the refill and cap scenarios.
- `src/transports/node/server.test.ts` `[tests]` · the flood test uses the real clock; injecting `now` would remove the small margin.

## ⚪ Disagree / Intentional
- `src/transports/node/server.ts` `[design]` · the bucket runs before the `ping` reply: BR-088 counts `ping` on purpose.

## Per-dimension summary
- Design: dependency rule holds, proportionate · Docs: matches BR-088 and the study · Tests: pyramid healthy, every branch covered · Security: no bypass left once closing sockets are ignored · Correctness: no bug left.
