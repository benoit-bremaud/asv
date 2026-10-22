# ADR-0015 — Protocol validation with Zod Mini

- Status: accepted, confirms `src/shared/protocol` proposed in ADR-0003
- Date: 2026-10-22
- Deciders: Benoît Bremaud

## Context

Every WebSocket message is validated against its schema before reaching the domain
(`platform/04-class-protocol`). The schemas live in `src/shared/protocol`, imported by the web client
and the server, so their size counts in the browser bundle and their types should not be written twice.

## Options and MCDA

Scores 0–5. Criteria: type inference from one source 30, KISS and familiarity 25, browser bundle 20,
Hono integration 15, Workers compatibility 10.

| Option | Inference | KISS | Bundle | Hono | Workers | Total /500 |
|---|---|---|---|---|---|---|
| **A. Zod Mini** | 5 | 4 | 4 | 5 | 5 | **455** |
| B. Valibot | 5 | 3 | 5 | 5 | 5 | 450 |
| C. Zod (classic API) | 5 | 5 | 2 | 5 | 5 | 440 |
| D. Hand-written type guards | 2 | 3 | 5 | 1 | 5 | 300 |

- Facts checked on 2026-10-22 (Zod docs via Context7): a four-key object schema bundles to about
  24.1 KB with Zod and 4.6 KB with Zod Mini. Zod Mini and Valibot both implement Standard Schema, so
  `@hono/standard-validator` fits either.
- Sensitivity: with bundle at 30 and KISS at 15, Valibot leads (465 vs 455). Runner-up and fallback:
  Valibot, drop-in at the schema level only (rewrite of `src/shared/protocol`, no other folder changes).

## Decision

Option A. `src/shared/protocol` holds the message types, inferred from Zod Mini schemas, and nothing
else: no runtime logic, no import from `src/domain`, `src/server`, `src/web` or a transport.

## Consequences

- One source for types and validation, shared by client and server.
- Contract tests in Vitest validate valid and invalid samples of each message.
