# Local review — asv (branch diff main...chore/11-tooling)

- Date: 2026-10-23
- Commit: reviewed d64a9ed, fixes in the following commit
- Scope: branch diff `main...HEAD` (brick 2 tooling: study, scaffold, protocol schemas, CI)
- Checks run: design · docs · tests · security · correctness
- Verdict: ship after fixes · Must 3 (fixed) · Should 9 (8 fixed, 1 disagree) · Nice 6 (2 fixed, 1 issue, 3 accepted)

## Pre-merge gate (head SHA of the fix commit)
| Step | Result |
|---|---|
| 1 Tests | ✅ 17 Vitest tests (node + jsdom projects), lint fixtures included |
| 2 Coverage | tests 100 % stmts / 100 % branches / 100 % funcs / 100 % lines (floor 80) · docs 100 % of `src` exports after fixes (was ~13 %) |
| 3 SonarQube | ✅ PASSED on localhost:9000 (project `asv`), re-run with `pnpm sonar` after push to post the status |
| 4 Secrets | ✅ gitleaks clean (`--all`, 7 commits) · no tracked .env · diff read: nothing sensitive |
| 5 QA pass | ✅ smoke: `vite preview` renders the shell "asv", console clean · screenshot `qa/2026-10-23-brick2-smoke.jpg` |
- Gate: **GREEN** locally; GitHub checks run on push.

## 🔴 Must Have
- `eslint.config.js:9` `[security|design]` · bare Node built-ins (`fs`, `path`) and `process`/`Buffer` passed the domain rule · fixed: `builtinModules` patterns + `no-restricted-globals`, fixture `domain/bare-builtin.ts`.
- `scripts/sonar-status.sh` `[correctness|design]` · could post a stale gate on a new SHA; `qualitygate.wait` made the failure branch dead · fixed: clean tree checked first, task status and analysis revision must equal HEAD, status script runs even when the gate fails.
- `src/shared/protocol/messages.ts` `[docs]` · doc coverage ~13 % (floor 90) · fixed: TSDoc on every export.

## 🟡 Should Have
- `src/shared/protocol/messages.ts` `[design|security]` · `errorCode` unused · fixed: `error.code` uses it, test added.
- `src/shared/protocol/messages.ts` `[design]` · member fields repeated three times · fixed with `z.extend` / `z.pick`.
- `src/domain/index.ts:2` `[design]` · comment allowed imports from `src/shared/protocol`, the study does not · fixed: comment aligned, `**/shared/**` forbidden in the domain.
- `eslint.config.js:50` `[design|tests]` · protocol rule untested and `./../` slipped through · fixed: regex `\./[^.]`, fixture `protocol/forbidden.ts`.
- `test/dependency-rule.test.ts` `[tests]` · loose and brittle assertions, full-`src` lint duplicated CI · fixed: per-rule `toEqual` with `stringContaining`, duplicate test dropped.
- `scripts/sonar-status.sh` `[security]` · token in curl argv · fixed: curl config on stdin.
- `.github/workflows/*.yml` `[security]` · checkout token persisted · fixed: `persist-credentials: false`.
- `src/shared/protocol/messages.test.ts` `[tests]` · boolean-only refusal asserts · fixed on the gender case (path asserted).

## 🔵 Nice to Have
- `src/shared/protocol/messages.ts` `[security]` · strings have no transport-level cap · follow-up issue for brick 7 (WebSocket frame limit + field caps).
- `tsconfig.json` `[design]` · `eslint.config.js` included without `allowJs` · fixed.
- `package.json` `[design]` · `verify` runs `tsc` twice · accepted (milliseconds today).
- `scripts/sonar-status.sh` `[security]` · host hard-coded · accepted (ADR-0016: local only, YAGNI).
- `src/server/app.test.ts`, `src/web/App.test.tsx` `[tests]` · smoke-level tests · accepted, replaced in brick 7.

## ⚪ Disagree / Intentional
- `.github/workflows/codeql.yml` `[security]` · "SARIF upload fails on fork PRs" · the CodeQL action handles fork pull requests, the official starter workflow has no fork guard; revisit only if a fork PR goes red.

## Per-dimension summary
- Design: matches the study, no over-engineering · Docs: full after fixes · Tests: healthy pyramid, lint rule now proven per folder · Security: rule gaps and token exposure closed · Correctness: SonarQube status bound to HEAD.
