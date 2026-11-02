# Local review — asv (branch fix/72-keep-code-step-on-resume)

Pre-push and pre-merge review of the fix for issue #72: the sign-in code step survives a tab switch, a resume and a tab reload.

- Date: 2026-11-02
- Commit: 09f44e7 (first pass on e774c8c)
- Scope: branch diff origin/main...HEAD (BR-087, ADR-0011 amendment, web-ui/06, `src/web/connection.ts`, `src/web/store.ts`, account panel)
- Checks run: design · docs · tests · security (Opus) · correctness · QA pass on mobile (Opus)
- Verdict: ship — every Must and Should fixed in 09f44e7 · Must 0 · Should 0 · Nice 1

## Pre-merge gate (head SHA 09f44e7)

| Step | Result |
|---|---|
| 1 Tests | ✅ 638 unit and integration tests (`pnpm verify`: lint, typecheck, tests, build) |
| 2 Coverage | tests 98.62 % stmts / 94.46 % branches / 98.07 % funcs / 99.40 % lines (floor 80) · docs: about 100 % on the new surface (doc-auditor estimate) |
| 3 SonarQube | see the PR: run on the head SHA after this report is committed |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · no tracked .env · diff read: nothing sensitive (the stored deadline is a number only) |
| 5 QA pass | ✅ pass on 09f44e7 · scenarios a–d, F1, N1–N3 pass at 375×812, dev and production build · SEC-01…10: 9 ✅, SEC-01 ❌ → #69 (known, outside the diff) · report: docs/architecture/qa/2026-11-02-code-step-resume.md |

- Gate: **GREEN once step 3 passes**

## 🔴 Must Have

All fixed in 09f44e7:

- `src/web/connection.ts` `[correctness|design|tests|docs|qa]` · the deadline survived `codeExhausted`, `codeExpired`, `codeMissing` and "nouveau code", so a reload reopened a dead code step (QA F1) · cleared on every warning that `ACCOUNT_WARNINGS` maps to `askEmail`, on `forgetCode()` and on a resume with an account.
- `docs/architecture/diagrams/web-ui/06-state-account-panel.md` `[docs]` · `expelled` drawn as leading to `SignedOut` · removed.
- `docs/architecture/diagrams/web-ui/06-state-account-panel.md` `[docs]` · resume transitions incomplete · redrawn after owner choice A (470/500): an in-memory code step is kept as left.

## 🟡 Should Have

All fixed in 09f44e7:

- `src/web/store.ts` `[correctness]` · `pendingVerify` stuck after a restore · reset by `resumedTo` and `codeStepRestored`.
- `src/web/store.ts` `[correctness|qa]` · a resume reopened a panel the chatter had closed (QA N1) · owner choice A.
- `src/web/connection.test.ts` `[tests]` · `expelled`, `leave`, action order, `codeSent` forwarding, deadline boundary, wiring with the real reducer · added.
- `src/web/connection.ts` `[docs|design]` · hidden write in `codePending()` and `forget()` · documented.
- `docs/architecture/decisions/0011-hub-state-and-hibernation.md` `[docs]` · no pointer to the matrix · issue #72 referenced.

## 🔵 Nice to Have

- `src/web/connection.ts` `handle()` `[design]` · mixed early-return and fall-through styles · a `switch` refactor, out of scope for #72.
- Fixed: traceability BR order, `CODE_TTL_MS` link to `ACCOUNT_LIMITS.codeTtlMs`, code field focus (QA N3), `test-strategy.md` line.

## ⚪ Disagree / Intentional

- `src/web/store.ts` `codeStepRestored` `[design]` · a dedicated action rather than `openAccount` + `accountStep` · one dispatch, one render.
- `src/web/connection.ts` `[design]` · `Date.now()` not injected · Vitest fake timers fake `Date` (YAGNI).
- `src/web/connection.ts` `[design]` · second `sessionStorage` key · ADR-0011 amendment, `resumePayload` stays the protocol schema.
- `src/web/connection.ts` `[security]` · deadline computed client-side · UI only, the server checks expiry and tries itself.

## Per-dimension summary

- Design: no over-engineering, single source for the code-ending warnings.
- Docs: diagram, BR-087 and ADR amendment match the code.
- Tests: unit level, no over-mocking, one wiring test with the real reducer.
- Security: no finding; nothing server-side trusts the key.
- Correctness: the resume and reload paths are traced and tested.
