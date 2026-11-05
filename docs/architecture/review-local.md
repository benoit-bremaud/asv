# Local review — asv (branch fix/91-refuse-control-bidi-characters)

This report records the pre-push review of issue #91 (BR-090: refuse control, bidi and zero-width characters in free text).

- Date: 2026-11-05
- Commit: db44453
- Scope: branch diff origin/main...HEAD (`src/domain/text.ts`, its callers in `rooms`, `private`, `entry`, the web composers and entry form, their tests; business rules, rooms, private-conversations, entry, web-ui and platform diagrams, traceability, STRIDE table, test plan)
- Checks run: adversarial (Opus, 2 rounds) · tests and design (test-auditor) · security and correctness (adversarial pass) · execution checks (pre-push mode)
- Verdict: ship as-is · Must 0 · Should 0 open (6 adversarial and 3 test-audit Should fixed) · Nice 4

## Adversarial review (#236)
- Round 1 on `73aeb65`: Must 2 · Should 6 · Nice 5 · unverified 0 · Push gate: closed
- Round 2 on `db44453`: 12 fixed · 1 not fixed (Nice N3) · 0 regressed · new Must 0 · **Push gate: open**
- Hosted reviewers (filled at the pre-merge run): Copilot pending · Codex optional

## Pre-merge gate (head SHA db44453)
| Step | Result |
|---|---|
| 0 CI mirror | `ci.yml` job `verify` mirrored by `pnpm verify`; CodeQL, dependency review and Scorecard are CI-only |
| 1 Tests | ✅ `pnpm verify`: 701 passed (lint, typecheck, build green) |
| 2 Coverage | tests 98.65 % stmts / 94.61 % branches (floor 80) · docs ⏸ deferred to the pre-merge run |
| 3 SonarQube | ⏸ deferred to the pre-merge run (`pnpm sonar` on the PR head) |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · no tracked .env · diff read: nothing sensitive |
| 5 E2E/smoke | ⏸ deferred to the pre-merge run · JRN-15 not covered yet (QA pass) |
- Gate: `--push`: **pre-push green**, steps 2 (docs), 3 and 5 deferred (never GREEN)

## 🔴 Must Have
_None open._ Fixed in db44453: BR-090 missing from the UC4 and UC6 specs and their sequences; JRN-15 without a coverage row.

## 🟡 Should Have
_None open._ Fixed in db44453: the client checks BR-090 before sending and keeps the text (owner choice A, 405/500); the character set is widened to the characters shown as blanks (owner choice A, 440/500); a resume test with a BR-090 city; BR-090 in the business-rule headers and UC13; a STRIDE spoofing row; the refusal test asserts the state is untouched.

## 🔵 Nice to Have
- `src/domain/text.test.ts:24` `[adversarial]` · U+034F, U+115F, U+1160, U+180E, U+FFA0, U+206F and U+FFFB are not tested one by one · add one row each.
- `docs/architecture/diagrams/web-ui/03-component.md:58` `[adversarial]` · no lint rule keeps `src/domain/text.ts` the only domain module the web imports, and web-ui/03 has no arrow for it · add a `src/web/**` `no-restricted-imports` pattern and the arrow.
- `src/web/screens/EntryScreen.tsx:107` `[adversarial]` · the city notice sits inside the label, so it joins the input's accessible name · move it out and link it with `aria-describedby`.
- `docs/architecture/qa/test-plan.md` JRN-15 `[adversarial]` · split the UI check (send disabled, `invisibleChars`) from the WebSocket probe (`warning invalidText`).

## ⚪ Disagree / Intentional
- `src/domain/text.ts:12` `[adversarial]` · U+034F sits outside the character class · ESLint `no-misleading-character-class`; same behaviour.
- `src/domain/text.ts:12` `[adversarial]` · U+200C and U+200D stay allowed · owner choice (emoji sequences, Persian), tested.

## Per-dimension summary
- Adversarial: 2 Must and 6 Should fixed, gate open · Design: one pure function, three domain callers and three screens, right-sized · Docs: the study lists BR-090 everywhere the refusals are named · Tests: unit and UI tests can fail, none mock the domain · Security: server enforces BR-090, the client check is a convenience · Correctness: client and server both check the trimmed text.
