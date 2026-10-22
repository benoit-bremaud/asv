# ADR-0016 — SonarQube: local scan, quality gate published as a commit status

- Status: accepted
- Date: 2026-10-22
- Deciders: Benoît Bremaud

## Context

The owner runs a self-hosted SonarQube Community Build on the development machine, with no public
ingress, and wants as many checks as possible to run on that machine. The repository is public until
brick 9. A self-hosted Actions runner attached to a public repository can run code from fork pull
requests; workflow-level guards can be edited by the fork itself.

## Options and MCDA

Scores 0–5. Criteria: runs on the owner's machine 30, machine security 25, gate blocks the pull
request 20, KISS 15, continuity once private 10.

| Option | Machine | Security | Gate | KISS | Private | Total /500 |
|---|---|---|---|---|---|---|
| **D. Local scan, gate published as commit status `sonarqube`** | 5 | 5 | 4 | 4 | 5 | **465** |
| C. Local scan in the pre-merge review only | 5 | 5 | 1 | 5 | 5 | 420 |
| B. Hardened self-hosted runner | 5 | 3 | 4 | 3 | 5 | 400 |
| A. SonarQube Cloud | 0 | 5 | 5 | 4 | 3 | 315 |

- D loses one point on the gate: the status is posted by the owner's credentials, not by a neutral job.
  Accepted for a solo project.
- Sensitivity: with security at 40 and machine at 15, D still leads. Runner-up: C (drop the status).

## Decision

Option D. `pnpm sonar` runs tests with coverage, then `sonar-scanner` with the machine's global
analysis token (never in the repo or CI). `scripts/sonar-status.sh` reads the quality gate of the
analysis and posts a commit status `sonarqube` (success or failure) on the analysed SHA through the
GitHub API. The `main` ruleset requires that status.

## Consequences

- Community Build analyses one branch only: each scan overwrites the previous one. The gate read is
  the one of the analysis just submitted (its task id).
- Lint, type check, tests and build also run on GitHub-hosted runners as neutral required checks.
- Ends the docs-only SonarQube waiver.
