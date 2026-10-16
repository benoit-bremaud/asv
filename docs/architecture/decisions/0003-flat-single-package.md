# ADR-0003 — Flat single package

- Status: accepted
- Date: 2026-10-15
- Deciders: Benoît Bremaud

## Context

The repo holds a React front, a Hono server, a pure domain and two transports.

## Options and MCDA

Scores 0–5. Criteria: KISS 40, domain/infra boundary held 25, two build targets 20, scalability 15.

| Option | KISS | Boundary | Build targets | Scalability | Total /500 |
|---|---|---|---|---|---|
| **A. Single package, folders + import lint rule** | 5 | 4 | 4 | 3 | **425** |
| B. pnpm workspace with 3 packages | 2 | 5 | 4 | 5 | 360 |

- A: one `package.json`, the boundary is a lint rule rather than a package wall.
- B: physical boundary, but three manifests and cross-package builds for a small project.

Sensitivity (KISS 25, boundary 25, build 20, scalability 30): B 405, A 395.

## Decision

A single package with folders `src/domain`, `src/server`, `src/transports/node`,
`src/transports/cloudflare`, `src/web`, and `src/shared/protocol` (proposed, confirmed in brick 2)
for message types shared by web and server. The boundary is enforced by an ESLint import rule.

## Consequences

Split into packages only when a real second consumer of the domain appears.
