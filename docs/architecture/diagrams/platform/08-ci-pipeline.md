# Data-flow diagram — platform — checks before merge

> **Feature**: platform (roadmap brick 2)
> **Requirements**: ASV-NF-009, NF-010
> **Related ADRs**: ADR-0003, ADR-0015, ADR-0016

## Context

Which checks run where, and what the `main` ruleset requires. Does not cover deployment (brick 9,
see `07-deployment`).

## Diagram

```mermaid
flowchart LR
  Dev["Owner machine"]
  subgraph Local ["local — owner machine"]
    Verify["pnpm verify: lint, typecheck, test with coverage, build"]
    Sonar["pnpm sonar: scanner with global token"]
    SQ["SonarQube Community Build, localhost:9000"]
    Status["scripts/sonar-status.sh"]
  end
  subgraph Hosted ["GitHub-hosted runners"]
    CI["ci: lint, typecheck, test, build"]
    CodeQL["codeql: javascript-typescript"]
    Gitleaks["gitleaks"]
  end
  Ruleset["main ruleset: required checks"]
  Dev --> Verify --> Sonar --> SQ
  SQ -->|"quality gate of the analysis"| Status
  Status -->|"commit status sonarqube"| Ruleset
  Dev -->|"push branch"| CI
  Dev -->|"push branch"| CodeQL
  Dev -->|"push branch"| Gitleaks
  CI --> Ruleset
  CodeQL --> Ruleset
  Gitleaks --> Ruleset
```

## Notes

- No self-hosted runner: no code from a pull request runs on the owner's machine unless the owner
  checks it out (ADR-0016).
- The SonarQube token never leaves the machine. The status is posted with the owner's `gh` login.
- Lint enforces the dependency rule with ESLint `no-restricted-imports` (see `03-component`).
