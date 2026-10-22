# Local review — asv (branch diff main...chore/5-repo-compliance)

- Date: 2026-10-22
- Commit: a51cd61
- Scope: branch diff `main...HEAD` (CI config, governance docs, PROJECT_LOG)
- Checks run: design · docs · tests · security · correctness (one combined read-only pass, config and docs only)
- Verdict: ship as-is · Must 0 · Should 0 open · Nice 0 open

## Pre-merge gate (head SHA a51cd61)
| Step | Result |
|---|---|
| 1 Tests | n/a: no application code; `actionlint` clean on all workflows |
| 2 Coverage | n/a: no code |
| 3 SonarQube | ⚠️ not run: no asv project yet; owner waiver for docs/config PRs until brick 2 |
| 4 Secrets | ✅ gitleaks clean (full history and tree) · no tracked .env · diff read: nothing sensitive |
| 5 QA pass | n/a: no runnable product; GitHub settings verified through the API |
- Gate: **GREEN — merge authorised** (SonarQube waiver)

## 🔴 Must Have
- `SECURITY.md:10` `[security]` · advisory link needs private vulnerability reporting · fixed: enabled on the repo

## 🟡 Should Have
- `.github/workflows/scorecard.yml` `[security]` · job permissions dropped `contents`/`actions` read · fixed
- `.github/workflows/dependency-review.yml` `[correctness]` · needless checkout · removed
- `.github/dependabot.yml` `[correctness]` · labels must exist · verified
- `PROJECT_LOG.md` `[docs]` · dependency review sees only workflow actions · noted
- `CONTRIBUTING.md` `[docs]` · ruleset and Copilot claims · true once the post-merge ruleset is created

## 🔵 Nice to Have
- `SECURITY.md`, `CONTRIBUTING.md`, PR template `[docs]` · release wording, brick jargon, `review-local` explained · fixed
- `.github/dependabot.yml` `[design]` · group action bumps · added

## ⚪ Disagree / Intentional
_None._

## Per-dimension summary
- Design: proportionate, no new tooling beyond the baseline · Docs: accurate after fixes · Tests: n/a · Security: least privilege, SHA-pinned actions · Correctness: actionlint clean
