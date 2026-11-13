# Local review — asv (feat/210-moderator-passkeys)

- Date: 2026-11-13
- Commit: 9b4bd1b
- Scope: branch diff origin/main...HEAD (brick 8b code: moderator passkeys on Node)
- Checks run: adversarial (Opus, 5 rounds) · SonarQube · Codex · tests · coverage · secrets · audit; design, docs, security and correctness carried by the adversarial pass
- Verdict: ship as-is · Must 0 · Should 0 · Nice 0 (3 out-of-scope items filed as follow-ups)

## Adversarial review (#236)
- Round 1 on `cb26b6c`: Must 4 · Should 7 · Nice 4 · unverified 0 · Push gate: closed
- Round 2 on `9aee6b7`: all round-1 findings fixed · 1 regressed (BR-098 start check broke the local QA launch) · Push gate: closed
- Round 3 on `bb94fa2`: regression fixed · new Nice 2 (fixed in `8df25d1`) · Push gate: open
- Round 4 on `2789c8f` (SonarQube and Codex fixes): new Must 1 (409 sign-in answer in no study) · Nice 1 · Push gate: closed
- Round 5 on `9b4bd1b`: Must fixed (`02f` note), Nice fixed · new findings 0 · **Push gate: open**
- Optional second review: Codex on PR #219 raised 2 P2 (IP-host public origin, parallel sign-in counter), both fixed in `2789c8f`; Codex on #218 raised 2 P1, both handled by the code; replies inline, threads left open

## Pre-merge gate (head SHA 9b4bd1b)
| Step | Result |
|---|---|
| 1 Tests | ✅ 1077 unit/integration (`pnpm verify`) |
| 2 Coverage | tests 98.6 % stmts / 94.68 % branches (floor 80) · docs ⏸ deferred to the pre-merge run (`--push`) |
| 3 SonarQube | first run FAILED (10 new issues: complexity, async without await, mapped IP literal, `role="status"`), fixed in `8ce9a1c`; ✅ PASSED on `2789c8f`, re-run on the pushed head before merge |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · no tracked .env · diff read: nothing sensitive · `pnpm audit --prod` clean |
| 5 E2E/smoke | ⏸ deferred; JRN-37 and JRN-38 not covered yet (QA pass with a virtual authenticator, owner's call) |
- Gate: **pre-push green** — `pnpm verify` passed, SonarQube passed, QA deferred

## 🔴 Must Have
_None._ (round 1: dev proxy for `/mod`, `web-ui/09` conformance, code vs `02f`/`04c`/`04-class`, BR-091 leftovers — all fixed)

## 🟡 Should Have
_None._ (owner validation of the aligned studies `02f`, `04c`, `04-class`, `web-ui/09` and the BR-098 sentence is asked before the PR)

## 🔵 Nice to Have
_None._

## ⚪ Disagree / Intentional
- `src/server/moderator-routes.ts` · a correct owner secret is refused with 429 while the IP is locked out · BR-096 counts owner secrets in the same window
- `src/web/screens/EntryScreen.tsx` · state adjusted during render on a new `entryError` · React's documented pattern instead of an effect

## Out of scope (pre-existing, follow-ups)
- `src/web/strings.ts` `entryRefused.rate` says "une minute", the BR-096 window is 10 minutes
- `src/server/app.ts` · no `bodyLimit` on the Hono app (`/account/*`, `/mod/*`)
- `src/server/moderator-routes.ts` · 200 pending challenges with a per-IP bucket of 10: about 20 IPs can block sign-in for 5 minutes (before 8c exposure)

## Per-dimension summary
- Adversarial: gate open after 3 rounds · Tests: 1073 green, new modules at ~100 % · Security: owner secret constant-time, loopback and tunnel guards, encrypted store, gitleaks and audit clean · Docs: studies aligned with the code, awaiting owner validation
