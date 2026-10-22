# ADR-0011 — Hub state across hibernation, heartbeat and alarms

- Status: accepted
- Date: 2026-10-15
- Deciders: Benoît Bremaud

## Context

The local review of 2026-10-15 found that ADR-0007 and ADR-0009 did not say how live state survives
Durable Object hibernation. Facts checked on 2026-10-15 in the Cloudflare docs
([WebSockets best practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/),
[State API](https://developers.cloudflare.com/durable-objects/api/state/),
[Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)):

- During hibernation, in-memory state is reset. The constructor runs again on the next event.
- Each WebSocket can carry a serialized attachment of at most 16,384 bytes. It survives hibernation but
  is **lost when the connection closes**.
- `setWebSocketAutoResponse("ping", "pong")` answers pings without waking the object.
  `getWebSocketAutoResponseTimestamp(ws)` gives the last auto-response time.
- A Durable Object has **one alarm**: `setAlarm` replaces the previous one. Alarms run at least once.
- A Worker calls a Durable Object through a stub, by forwarding a request or calling RPC methods.

The open question was where an away session lives, since its socket is closed.

## Options and MCDA — away session storage

Scores 0–5. Criteria: privacy (gender, age, city off disk) 35, resume reliability 30, simplicity 20,
storage load 15.

| Option | Privacy | Reliability | Simplicity | Load | Total /500 |
|---|---|---|---|---|---|
| **B. Store a minimal away record, client resends its profile on resume** | 5 | 4 | 3 | 4 | **415** |
| C. Keep away sessions in memory only, lost if the hub hibernates | 5 | 1 | 5 | 5 | 380 |
| A. Store the full session snapshot for up to 5 minutes | 2 | 5 | 4 | 3 | 345 |

Sensitivity (privacy 15, reliability 50, simplicity 20, load 15): A 405, B 395.

## Decision

1. **Connected sessions** live in their WebSocket attachment: session id, connection id, pseudo, gender, age, city,
   joined rooms, ignored session ids, moderator name. On wake-up, the hub rebuilds sessions and room
   memberships from `getWebSockets()`.
2. **Away sessions** are stored in Durable Object storage as a minimal record: session id, connection id, pseudo,
   resume token hash, away deadline, joined rooms, open private windows, ignored session ids, buffered
   private messages. Gender, age and city are **not** stored: the client keeps them in
   `sessionStorage` and resends them with `resume`. The record is deleted on resume or expiry.
3. **Heartbeat**: the client sends `ping` every 25 seconds, auto-answered `pong`. The client reconnects
   if no `pong` arrives within 10 seconds. The hub treats a socket whose last auto-response is older
   than 60 seconds as lost.
4. **One alarm** is always set to the earliest of: next away deadline, next heartbeat sweep (every
   60 seconds while sockets exist), next daily run: retention purge (BR-060 to BR-062, legal vault BR-081, access entries BR-082 and account expiries) and retry of pending
   statements of reasons (BR-076, ADR-0012).
5. **Worker ↔ hub**: the Worker forwards WebSocket upgrades to the hub and calls hub RPC methods for
   everything else (passkey ceremonies, invitations). Only the hub touches storage.
6. Flood counters and entry attempts stay in memory. Losing them on hibernation is accepted.
7. On Node, the in-memory hub implements the same behaviour without hibernation.

## Consequences

- Buffered private messages are written to disk for at most 5 minutes. Documented in the privacy notice.
- The heartbeat sweep wakes the hub once a minute while chatters are connected. Negligible cost.
- The hub state model is in `diagrams/platform/04b-class-hub-state.md`.
