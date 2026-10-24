# Local review — asv (branch feat/54-real-tester-exposure)

- Date: 2026-10-24
- Scope: branch diff main...HEAD (code for issue #54: file log and vault, tunnel IP, security headers, legal pages)
- Checks run: design · docs · tests · security · correctness (Opus reviewer) · QA in tunnel mode
- Verdict: ship — every Must and Should fixed · Must 0 · Should 0 · Nice 2

## Pre-merge gate
| Step | Result |
|---|---|
| 1 Tests | ✅ 616 passed (`pnpm verify`) |
| 2 Coverage | 98.59 % stmts / 94.27 % branches / 98.06 % funcs / 99.39 % lines (floor 80) |
| 3 SonarQube | run after push (`pnpm sonar`) |
| 4 Secrets | ✅ gitleaks clean · no tracked .env · diff read: owner identity only from env vars |
| 5 QA pass | ✅ build served by Node in tunnel mode, desktop and mobile; headers, CSP, WebSocket entry, log file 0600; screenshots `qa/2026-10-24-tester-exposure-*.jpg` |

## 🔴 Must Have (fixed)
- `file-stores.ts` rewrite `[correctness]` · a purge cut mid-write could empty the legal files · temp file, fsync and rename.
- `file-stores.ts` readLines `[correctness]` · a line cut by a crash blocked start-up · unreadable lines kept raw, with a warning.

## 🟡 Should Have (fixed)
- `account-io.ts` `[correctness]` · the opening record was written after the account was saved · now written before.
- `file-stores.ts` `[correctness]` · connections cut by a crash never got an end · closed at start-up.
- `main.ts` `[security]` · tunnel mode without an https origin · start refused.
- `file-stores.ts` `[correctness]` · an unreadable date could drop a vault record · kept.
- Tests `[tests]` · file modes, cut lines, ordering and start-up purge now asserted.
- `file-stores.ts` `[security]` · 0600/0700 not applied to existing paths · chmod on prepare.
- BR-086 `[docs]` · Hono's extra default headers now listed. `LOOPBACK` reduced to IP literals.

## 🔵 Nice to Have
- A direct local process can still connect and claim any IP through the header: accepted on the owner machine.
- `LegalPage` is a non-modal dialog without focus move; acceptable, revisit with the full legal pack (brick 10).

## ⚪ Disagree / Intentional
_None._
