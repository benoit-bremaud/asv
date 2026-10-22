# Contributing to asv

## No conception, no code

Every change to behaviour implements a UML study under `docs/architecture/` that the owner has
validated. If the study is missing, write it first. See [CLAUDE.md](CLAUDE.md).

## Branches and commits

- One issue, one branch from `main`: `<type>/<issue>-<slug>` (e.g. `chore/5-repo-compliance`).
- [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <description>`.
- `main` takes no direct commits: a ruleset requires a pull request, a green `gitleaks` check and
  blocks force-pushes and deletion. GitHub rulesets need a public repository on the Free plan:
  re-check protection when the repository goes private.

## Labels

Every issue and pull request carries one label of each family:

- `type:` feature, bug, docs, chore, research
- `area:` conception, product, legal, security, ci, governance
- `prio:` P0 (critical) to P3 (low)

## Pull requests

- Fill in the template, link the issue with `Closes #N`, attach the PR to GitHub Project #69.
- Copilot code review is requested automatically by the `main` ruleset.
- Every review comment gets an inline reply before merge. Squash merge only.

## Gates

**Pre-push** (every branch, no trivial-diff exception): run the local review gate (the maintainer's `review-local` agent skill: design, docs, tests, security and correctness review plus a secrets scan)
and resolve every Must Have finding before pushing.

**Pre-merge** (on the merged SHA): test suites, coverage ≥ 80 % and documentation coverage ≥ 90 %
once code exists, SonarQube quality gate (once SonarQube analysis is set up), secrets scan and a manual diff read, QA pass
on the running product with screenshots. All green, or no merge.

## Logbook

After each merge, add an entry to [PROJECT_LOG.md](PROJECT_LOG.md).
