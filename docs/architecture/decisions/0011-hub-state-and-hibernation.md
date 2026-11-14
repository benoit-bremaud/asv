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
2. **Away sessions** are stored in Durable Object storage as a minimal record: session id, pseudo,
   resume token hash, away deadline, joined rooms, open private windows, ignored session ids, buffered
   private messages. Gender, age and city are **not** stored: the client keeps them in
   `sessionStorage` and resends them with `resume`. The record is deleted on resume or expiry. It holds no
   connection id: the connection line is closed when the socket is lost, and a resume draws a new id, opens a new
   line and stores the id in the new socket attachment (BR-060).
3. **Heartbeat**: the client sends `ping` every 25 seconds, auto-answered `pong`. The client reconnects
   if no `pong` arrives within 10 seconds. The hub treats a socket whose last auto-response is older
   than 60 seconds as lost.
4. **One alarm** is always set to the earliest of: next away deadline, next heartbeat sweep (every
   60 seconds while sockets exist), next daily run: retention purge (BR-060 to BR-062, legal vault BR-081, access entries BR-082 and account expiries) and retry of pending
   statements of reasons (BR-076, ADR-0012).
5. **Worker ↔ hub**: the Worker forwards WebSocket upgrades to the hub and calls hub RPC methods for
   everything else (passkey ceremonies, invitations). Only the hub touches storage.
6. **On wake-up**, the hub closes every open connection line whose id is in no socket attachment, at the last known
   time (the socket died while the hub was evicted).
7. Flood counters and entry attempts stay in memory. Losing them on hibernation is accepted.
8. On Node, the in-memory hub implements the same behaviour without hibernation.

## Consequences

- Buffered private messages are written to disk for at most 5 minutes. Documented in the privacy notice. (Suspended in brick 9: buffered private messages stay in memory, ADR-0020, BR-109.)
- The heartbeat sweep wakes the hub once a minute while chatters are connected. Negligible cost.
- The hub state model is in `diagrams/platform/04b-class-hub-state.md`.

## Amendment 2026-11-02 — pending sign-in code (issue #72)

On a phone, reading the code in the mail app suspends the tab: the socket drops, and the tab may even be
reloaded. Besides the resume token and the profile, the client now keeps a second `sessionStorage` key with
the deadline of the pending sign-in code, a number only (BR-087). No e-mail and no code are stored. The
pending code itself stays on the server under the session id, which a resume keeps. Owner choice
2026-11-02, 440/500, against keeping the step in memory only (430/500, lost on a reload); matrix in
issue #72. A resume without a reload keeps the panel as it is (owner choice 2026-11-02, 470/500).

## Amendment 2026-11-14 — no hibernation in brick 9 (ADR-0020)

The owner chose to run the Hub Durable Object without hibernation (ADR-0020 D1, 380/500 against this ADR as
written, 365/500). Points 1, 2 and 6 (rebuild from attachments, stored away records, closing orphan connection
lines on wake-up) are suspended: the hub stays in memory, away records and buffered private messages too, and a
deploy or restart sends every chatter back to the entry screen (BR-109). Orphan connection lines are instead
closed by the Hub constructor at its start time, before any socket (BR-109, as BR-084 on Node). Point 3 (heartbeat)
changes in substance: with `server.accept()` the auto-response API (`setWebSocketAutoResponse`) is not available,
so the transport answers `ping` itself as on Node (BR-088) and the sweep uses its own last-frame time per socket;
the 25-second ping, the 10-second client timeout and the 60-second silence limit hold. Points 5 (Worker ↔ hub) and
7 (flood counters in memory) hold, point 5 extended: the Hono app runs inside the hub object (ADR-0020 §1). Point
4 becomes timers plus one alarm (BR-110). Moving to this ADR's design is a follow-up.
