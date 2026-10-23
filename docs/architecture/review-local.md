# Local review — asv (brick 5, member accounts)

- Date: 2026-10-23
- Commit: 16f4ca7
- Scope: branch `feat/32-brick-5-accounts`, diff `main...HEAD`
- Checks run: design · docs · tests · security · correctness
- Verdict: ship — Must 0 open (4 fixed) · Should 3 open (6 fixed) · Nice 8

## Pre-merge gate (head SHA 16f4ca7)
| Step | Result |
|---|---|
| 1 Tests | ✅ 17 files, 510 tests (`pnpm verify`), 33 hub account integration tests |
| 2 Coverage | tests 98.56 % stmts / 95.86 % branches / 97.08 % funcs / 99.22 % lines (floor 80) · docs 97/97 exports of the touched files (100 %, floor 90) |
| 3 SonarQube | ✅ PASSED on 16f4ca7 (44 findings of 3228023 fixed) |
| 4 Secrets | ✅ gitleaks clean (`src`, `docs`, `main..HEAD`) · no tracked .env · diff read: dev code only in dev logs |
| 5 QA pass | ✅ full · console clean · screenshots: `qa/2026-10-23-brick5-{members-hint,code-sent,signed-in,device-cookie,confirm-delete,deleted}.jpg` · replayed on 16f4ca7 (dialog overlay): `qa/2026-10-23-brick5-final-{code-dialog,signed-in}.jpg` |
- Gate: **GREEN — merge authorised once the PR CI is green**

## 🔴 Must Have
- ✅ fixed — `src/server/account-io.ts:49` `[design|docs]` · `AccountIo` is in no study (CLAUDE.md "no conception, no code"); `04d` `signOutDevice(tokenHash, now)` vs code without `now` · add `AccountIo` to `platform/04d`, align the signature.
- ✅ fixed — `docs/architecture/diagrams/accounts/07-class-domain-api.md:24-81` `[docs]` · drift from `src/domain/accounts.ts`: `redeemDeviceClaim` takes `random`, `unlinkSessions` returns `{state, unlinked}`, `LinkResult` has no effects and a string claim, `checkCode` signature, `closeAccount` anonymous result · align the diagram.
- ✅ fixed — `src/domain/accounts.ts:13` `[security]` · slow brute force (≈ 1 % per month by rotating IPs) · owner decision 2026-10-23 (A, 435/500): at most 20 wrong tries per e-mail per 24 h, then silent refusal; amend BR-072 and `accounts/02` first.
- ✅ fixed — doc coverage `[docs]` · ≈ 80 % < 90 % · docstrings on `createAccountIo`, `AccountIoDeps`, `toBase64Url`/`fromBase64`, `BrevoOptions`, `createBrevoMailer`, `CodeRefusal`/`CodeDecision`/`CodeCheck`/`LinkResult`.

## 🟡 Should Have
- ✅ fixed — `src/web/screens/AccountPanel.tsx:40` `[correctness]` · auto-send on the sixth digit plus "valider" sends `verifyCode` twice: two tries burned, or `codeMissing` after success · `pendingVerify` flag, button disabled while in flight.
- ✅ fixed — `src/server/hub.ts` `redeemDeviceClaim`/`signOutDevice` `[correctness]` · a failed `saveDevice` consumes the claim, rejects the route, skips `onStoreError` · commit state after the save, catch and report.
- ✅ fixed — `src/server/hub.ts:334`, `src/web/store.ts:113` `[design]` · tries left travel in the human `message` · optional `triesLeft` in the `warning` schema.
- `src/web/store.ts:94` `[design]` · account warning codes are free strings on both sides · one shared union in `src/shared/protocol`.
- ✅ fixed — `src/server/account-io.ts:64` `[design]` · invalid e-mail still queries the store with `""` · answer `emailInvalid` first.
- ✅ fixed — `src/transports/node/memory-accounts.ts:13` `[design]` · BR-081 1-year/5-year limits are bare numbers · add to `ACCOUNT_LIMITS`.
- `src/server/hub.ts:153` `[design]` · hub at 611 lines mixes entry, rooms, accounts · extract `hub-accounts.ts` (follow-up issue).
- ✅ fixed — `src/transports/node/hub-accounts.test.ts:77`, `src/server/mailer/brevo.test.ts:84` `[tests]` · random-code assertion, missing mock restore · stub random, `afterEach(vi.restoreAllMocks)`.
- `src/transports/node/server.ts` `[security]` · production flags hard-coded false, raw socket IP for the quota · fail closed on `NODE_ENV=production`; trusted proxy IP and IPv6 /64 in brick 9 (follow-up issue).

## 🔵 Nice to Have
- `src/domain/accounts.ts:191` `[security]` · claim redeemable after the session unlinks · refuse when the session no longer matches.
- `src/server/hub.ts:359` `[security]` · deletion needs no fresh code · follow-up issue.
- `src/server/crypto/cipher.ts:70` `[security]` · seal binds no AAD · bind `accountId`.
- `src/server/mailer/brevo.ts:62,106` `[security|design]` · ✅ `'` now escaped; derive "10 minutes" from `codeTtlMs`.
- `src/server/hub.ts:85` `[design]` · `open` with four positional parameters · options object.
- `src/domain/ports.ts:74,83` `[design]` · `email` holds ciphertext · rename `emailCiphertext`.
- `src/domain/accounts.ts:7` `[design]` · type-only import cycle with `rooms.ts`.
- `src/web/App.test.tsx`, `src/server/mailer/brevo.test.ts`, `src/server/crypto/cipher.test.ts` `[tests]` · `toBeTruthy` on `getBy*`, mixed scenarios in one `it`.

## ⚪ Disagree / Intentional
- `src/server/app.ts` `secureCookie: false` in the Node transport `[design]` · development-only transport per `platform/04d`; production goes through brick 9.
- "Sign out this device" without a cookie signs out locally only `[correctness]` · known gap, follow-up issue.

## Per-dimension summary
- Design: dependency rule holds; study gap on `AccountIo`, hub growing. · Docs: diagrams drifted, ≈ 80 % coverage. · Tests: pyramid healthy, real crypto, two hygiene fixes. · Security: no Must from the review; slow brute force escalated by owner choice. · Correctness: double verify and claim consumption on store failure.
