# ADR-0007 — Single Hub Durable Object in production

- Status: accepted, supersedes the Durable Object topology of ADR-0002
- Date: 2026-10-15
- Deciders: Benoît Bremaud

## Context

ADR-0002 first planned one Durable Object per room, one per DM pair, and a Directory object.
The local review of 2026-10-15 found this over-engineered for tens to a few hundred users, and
under-specified: no object owned a chatter's connection or ignore list, a client would hold many
sockets, and an expel could not reach sockets held by other objects.

## Options and MCDA

Scores 0–5. Criteria: simplicity 30, clear session ownership (ignore, expel) 25, consistency with
the Node transport and testability 20, scale headroom 15, cost 10.

| Option | Simplicity | Ownership | Node consistency | Headroom | Cost | Total /500 |
|---|---|---|---|---|---|---|
| **B. One Hub object for everything** | 5 | 5 | 5 | 2 | 4 | **445** |
| C. Hub for sessions and DMs + one object per room | 3 | 3 | 3 | 4 | 4 | 325 |
| A. One object per room and per DM pair + Directory | 2 | 1 | 2 | 5 | 4 | 240 |

- B: one socket per chatter, the hub holds rooms, DMs, ignore lists and moderation, like the Node
  transport's in-memory hub.
- C: rooms scale independently, but presence and ignore filtering cross objects.
- A: best headroom, but session state is scattered.

Sensitivity (simplicity 5, ownership 25, consistency 20, headroom 40, cost 10): B 370, C 350.

## Decision

- Production uses **one Hub Durable Object** with WebSocket hibernation.
- Each chatter has **one WebSocket** to the hub. Rooms and private conversations are domain state
  inside the hub.
- The hub's SQLite storage holds the persisted data: connection logs, reports, bans.
- Both transports expose the same storage ports (`ModerationStore`, `ConnectionLogStore`,
  `AwayStore`, and `ModeratorStore` from ADR-0008), defined next to the domain and implemented in
  memory (Node) and in SQLite (Cloudflare). Details in ADR-0011 and `diagrams/platform/03-component.md`.

## Consequences

- One object is the throughput ceiling. Acceptable at the expected scale.
- **Shard trigger**: if measured hub CPU or message latency degrades under real load, split rooms
  into their own objects (option C). Not before.
- The Node and Cloudflare transports now share the same shape, which keeps integration tests
  representative of production.
