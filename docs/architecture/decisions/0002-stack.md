# ADR-0002 — Stack: Hono, pure domain, Node transport for dev, Durable Objects in production

- Status: accepted, Durable Object topology superseded by [ADR-0007](0007-single-hub-durable-object.md)
- Date: 2026-10-15
- Deciders: Benoît Bremaud

## Context

asv is a real-time chat: rooms with presence and broadcast, private messages, light moderation.
Expected scale: tens to a few hundred concurrent users. No message history required.

## Options and MCDA

Scores 0–5. Criteria: KISS 25, real-time multi-room fit 20, hosting cost/ops 15, testability 15,
portability 10, reuse of existing accounts 10, local dev loop 5.

| Option | KISS | Real-time | Hosting | Tests | Portability | Accounts | Dev loop | Total /500 |
|---|---|---|---|---|---|---|---|---|
| A. Next.js + Socket.IO on Fly.io | 3 | 4 | 3 | 3 | 4 | 4 | 3 | 340 |
| B. Vite React + Workers + Durable Objects only | 3 | 5 | 5 | 3 | 2 | 4 | 4 | 375 |
| C. Vite React + Hono + ws on Fly.io | 4 | 4 | 3 | 4 | 5 | 3 | 4 | 385 |
| **D. Vite React + Hono, pure domain, Node + Durable Objects transports** | 3 | 5 | 5 | 5 | 4 | 4 | 5 | **430** |

- A: Next.js App Router cannot serve WebSockets in route handlers, a custom server is needed.
- B: no server to run, but tests need the Workers test pool and the code is locked to Cloudflare.
- C: simplest code, but a paid always-on machine to run and patch.
- D: domain tested with plain Vitest on Node, production on Cloudflare, Node transport as exit door.

Sensitivity: with KISS 40 and portability/dev loop 0, D still leads (410 vs 380 / 375).

Facts checked on 2026-10-15:

- Durable Objects are available on the Workers Free plan since 2025-04-07, SQLite backend only.
  Free limits: 100,000 requests/day and 13,000 GB-s/day. Incoming WebSocket messages count 20:1
  as requests, outgoing messages are free.
  ([pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
  [release notes](https://developers.cloudflare.com/durable-objects/release-notes/))
- Fly.io has no free tier for new organizations. Smallest always-on machine: 2.19 $/month, card
  required. ([pricing](https://docs.fly.io/about/pricing))
- Hono `upgradeWebSocket` keeps the same handler signature on Node and Workers. `@hono/node-ws`
  is deprecated in favour of `upgradeWebSocket` from `@hono/node-server`.
  ([Hono on Node.js](https://hono.dev/docs/getting-started/nodejs),
  [WebSocket helper](https://hono.dev/docs/helpers/websocket))

## Decision

Option D.

- `src/domain/`: rooms, presence, private conversations, moderation, pseudo colour. Pure
  TypeScript, no runtime import.
- Node transport: local dev and integration tests with plain Vitest.
- Cloudflare transport: production, topology in ADR-0007.
- Each transport builds the Hono app and plugs its own wiring in. The server never imports a transport.

## Consequences

- Expected to fit the Workers Free plan at tens to low hundreds of users. To be measured once live.
- The Node transport is also the exit door: deployable on Fly.io if Cloudflare is left.
- Risk: domain logic leaking into transports. Mitigated by the dependency rule and a lint rule
  on imports from `src/domain/`.
