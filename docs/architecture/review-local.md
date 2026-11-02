# Local review — asv (branch docs/74-qa-test-plan)

- Date: 2026-11-02
- Commit: f9970ba + review fixes (same branch)
- Scope: branch diff origin/main...HEAD, docs only (`qa/test-plan.md`, rule lines in `CLAUDE.md`,
  `test-strategy.md`, `README.md`, `traceability-matrix.md`)
- Checks run: docs and accuracy (doc-auditor) · QA smoke (qa-tester). Design, tests, security and correctness
  agents not run: no code, test or config file in the diff.
- Verdict: ship as-is · Must 0 · Should 0 (4 fixed) · Nice 1 open

## Pre-merge gate (head SHA f9970ba, docs-only follow-up commit)
| Step | Result |
|---|---|
| 1 Tests | ✅ `pnpm verify`: 19 files, 638 tests passed |
| 2 Coverage | unchanged by a docs-only diff; enforced by the runner thresholds in `pnpm verify` |
| 3 SonarQube | run with `pnpm sonar` after the last commit, on a clean tree |
| 4 Secrets | ✅ gitleaks clean on origin/main..HEAD · no tracked `.env` · diff read: nothing sensitive (legal-page shots show "(à compléter)" placeholders only) |
| 5 QA pass | ✅ smoke on f9970ba, production build on localhost:8799 · JRN-01, JRN-03, JRN-11 pass · SEC-01 ❌ known #69 · inspector clean apart from favicon #62 · report: docs/architecture/qa/2026-11-02-test-plan-smoke.md |
- Gate: **GREEN — merge authorised on owner approval** (once step 3 reports PASSED)

## 🔴 Must Have
_None._

## 🟡 Should Have
- Fixed: `qa/test-plan.md` evidence cells cited 09f44e7 for checks only run on e774c8c (SEC, PRI, ROB, FON-09); now
  e774c8c with a note.
- Fixed: FON domain row overstated coverage; now cites FP and CS rows and marks FON-08b not covered.
- Fixed: wrong issue numbers for A11Y (#64 is the missing `h1`, #65 the covered input).
- Fixed: rate-limit evidence now cites FP SEC-07 and CS SEC-07 with their SHAs.

## 🔵 Nice to Have
- `qa/test-plan.md` JRN-01 `[docs]` · the French `entryRefused` message (FP N3) is not a separate row · add one when
  the entry journey next changes.

## ⚪ Disagree / Intentional
- Gaps table lists gaps "to file on owner approval" instead of issue numbers · skill `test-plan` step 5 files
  issues only after the owner confirms the list.

## Per-dimension summary
- Docs: links resolve, UC/BR mapping matches the traceability matrix, rule wording identical in three files ·
  QA: smoke rows of the plan now carry f9970ba evidence.
