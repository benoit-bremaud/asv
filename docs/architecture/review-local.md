# Local review — asv (hub refactor, issues #25 and #36)

- Date: 2026-10-24
- Commit: 454fe51
- Scope: branch `refactor/25-36-hub-handler-map`, diff `main...HEAD`
- Checks run: design · docs · tests · security · correctness
- Verdict: ship. Must 0 · Should 0 open (8 fixed) · Nice 2 open (3 fixed)

## Pre-merge gate (head SHA 454fe51)
| Step | Result |
|---|---|
| 1 Tests | ✅ 17 files, 536 tests (`pnpm test:coverage`), typecheck, lint and build green |
| 2 Coverage | tests 98.6 % stmts / 95.5 % branches / 97.3 % funcs / 99.3 % lines (floor 80) · docs 16/16 exported symbols of the touched files (100 %, floor 90; one type re-export left out of the count) |
| 3 SonarQube | ✅ PASSED on 454fe51 (new coverage 97.7 %). The first scan on 1ddfbc7 failed on one new S7503 issue, fixed in 454fe51 |
| 4 Secrets | ✅ gitleaks clean (`main..HEAD`) · no tracked .env · diff read: nothing sensitive |
| 5 QA pass | ✅ full: enter, join Lyon, post, request a code (`codeSent`), wrong code (`codeWrong`, tries left). The console errors come from the first run on port 5174, before `ASV_ALLOWED_ORIGINS` was set (port 5173 was held by another project). Screenshots: `qa/2026-10-24-hub-refactor-{room,code-sent,code-wrong}.jpg` |
- Gate: **GREEN. The merge is authorised once the PR CI is green.**

## 🔴 Must Have
_None._

## 🟡 Should Have
- ✅ fixed — `src/server/hub-accounts.ts` `[design]` · account commands were dispatched three times (map, `handle` switch, `onAccountWide` branch) · one guarded handler per command, mapped directly.
- ✅ fixed — `src/server/hub-accounts.ts:16` `[design]` · type import cycle with `hub.ts`, and the full `HubDeps` was handed to the account commands · `AccountDeps` (random, accounts, mailer, onStoreError).
- ✅ fixed — `platform/04c` `[docs|design]` · drift: `HubContext.out` type, missing `keysOf`/`roomJoined`/`unlink`, `HubDeps` without the brick 5 fields, account commands still listed as `notAvailable` · study synced.
- ✅ fixed — `src/server/hub-accounts.ts` `[docs]` · `createAccountHandlers` had no docstring · added the never-rejects contract.
- ✅ fixed — `src/server/outgoing.ts` `[docs]` · `Payload`, `OutgoingModule`, `warning` and the module contract (one `seq` counter, empty recipients dropped) were undocumented.
- ✅ fixed — `src/server/hub.test.ts:179` `[tests]` · only `search` pinned `notAvailable` · `it.each` over the 12 later-brick commands, plus `forbidden` without a session.
- ✅ fixed — `src/transports/node/hub-accounts.test.ts:130` `[tests]` · the store guard was proven on `requestCode` only · `it.each` over `verifyCode`, `signOutEverywhere`, `deleteAccount`.
- ✅ fixed — `src/server/hub.ts:322` `[correctness]` · Sonar S7503, `async` without `await` · `Promise.resolve`.

## 🔵 Nice to Have
- ✅ fixed — `src/server/outgoing.ts:121` `[design]` · `roomRefused` built a warning inline · uses `warning()`.
- ✅ fixed — `src/server/hub.ts:351` `[correctness]` · the correlated-union annotation was easy to break · added a comment.
- ✅ fixed — `src/server/hub-accounts.ts:139` `[correctness]` · `default` branch would swallow a future account command · gone with the per-command handlers.
- `src/server/hub.ts:305` `[correctness]` · `command as Pick<ClientMessage, "seq">` in `roomCommand` · pass `seq` as its own handler argument if a command ever drops `seq`.
- `src/server/hub.ts:94` `[design]` · `Command<T>` is defined in both `hub.ts` and `hub-accounts.ts` · share it if a third copy appears.

## ⚪ Disagree / Intentional
- `src/server/hub.ts:350` `[design]` · `runBound` exists only so the type checker accepts the map lookup. It has no runtime role and is commented.

## Per-dimension summary
- Design: clean split by command group; dependency rule holds. Docs: study and code in sync. Tests: the handler map is fully pinned; nothing is over-mocked. Security: no change in behaviour (Opus adversarial pass: seq order, error texts, state commits and the guard are unchanged). Correctness: no Must; type casts are documented.
