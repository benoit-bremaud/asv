# Sequence diagram — platform — Cloudflare transport: Worker, Hub Durable Object and storage

> **Feature**: platform (roadmap brick 9, issue #233)
> **Use cases**: UC1, UC3, UC4, UC10, UC13, UC16, UC20
> **Business rules**: BR-060, BR-086, BR-088, BR-089, BR-093, BR-109 to BR-113
> **Related ADRs**: ADR-0007 (amended), ADR-0011 (amended), ADR-0017, ADR-0020

## Context

How `src/transports/cloudflare/` wraps the transport-neutral hub (`platform/04c`) in the single Hub Durable
Object, mirroring the Node transport (`platform/02`). The Worker serves assets and checks the request; the Hub
object runs the Hono app (`createApp`, `addModeratorRoutes`) and the hub. Does not cover what the hub does with
each command.

## Diagram

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as Cloudflare Access
  participant W as Worker (assets + checks)
  participant H as Hub Durable Object (Hono app + hub)
  participant S as SQLite of the Hub
  participant C as Owner CLI

  Note over H,S: Constructor in blockConcurrencyWhile: migrate schema, close every open connection_lines row at its start time (BR-109)
  B->>A: GET / (asvchat.fr or staging)
  A-->>B: allowed by the allow-list (BR-113)
  B->>W: GET / , static assets (run_worker_first)
  W->>W: check Cf-Access-Jwt-Assertion, secrets (BR-111, BR-113)
  W-->>B: built web client, BR-086 headers
  B->>W: GET /ws Upgrade, Origin, CF-Connecting-IP
  alt secret missing or invalid (BR-111)
    W-->>B: 503
  else no Access JWT, no CF-Connecting-IP or Origin refused
    W-->>B: 401 / 400 / 403
  else allowed
    W->>H: forward the upgrade request
    H->>H: BR-089 limits on the /64 or IPv4 key (BR-112)
    alt over a limit
      H-->>B: 429 or 503 with Retry-After 10
    else accepted
      H->>H: WebSocketPair, server.accept() (no hibernation, BR-109)
      H->>H: hub.open(socketKey, ip)
      H-->>B: 101 Switching Protocols
    end
  end
  loop each frame
    B->>H: message
    H->>H: frame budget (BR-088), ping answered by the transport, hub.receive
    H->>S: store writes through the ports (ciphertext, ADR-0017)
    H-->>B: outgoing messages
  end
  par timers while a socket is open (BR-110)
    H->>H: hub.tick every second, heartbeat sweep (own last-frame time, 60 s limit)
  and alarm, earliest of next due retry and next daily purge
    H->>S: purge expired rows, retry alerts, decision e-mails and pending statements
    H->>H: setAlarm(next run)
  end
  C->>A: POST /owner/invitations, CF-Access-Client-Id and Secret (service token)
  A->>W: Access owner policy passed (BR-113)
  W->>H: forward, Access JWT verified
  H->>H: owner secret checked in constant time (BR-093)
  H->>S: save invitation
  H-->>C: invitation link
  Note over H: Deploy or restart: every socket closes, memory resets; clients return to entry (BR-109)
```

## Notes

- The Worker never touches SQLite and never builds the Hono app: it serves assets with
  `assets.run_worker_first: true`, checks the Origin, `CF-Connecting-IP` and the Access JWT, and forwards every
  non-asset request to the Hub, which holds the grant key and used nonces (BR-095), the challenge windows
  (BR-096) and the stats. It passes nothing secret in the forwarded request.
- `socketKey` is a counter (`String(nextKey++)`) held in a `Map` of the object, as on Node.
- The Durable Object's tables mirror the Node stores one to one: `connection_lines`, `contribution_lines`,
  `accounts`, `codes`, `code_events`, `devices`, `email_blocks`, `carry_overs`, `vault`, `reports`,
  `alerts`, `pending_mails`, `pending_statements` (encrypted, so a deploy does not drop a pending statement of
  reasons), `bans`, `moderators`, `invitations`. One schema migration runs in the constructor inside
  `blockConcurrencyWhile`; migrations are additive only (`platform/10`).
- Away records, room state, the grant key, pending challenges, triage counters and flood counters are in memory
  and lost on a deploy (BR-109). On Node, pending statements of reasons are in memory only: a known gap, follow-up #234.
- Implementation precisions (brick 9b): the stores are written against a minimal `SqlStorage` interface
  (`sql.exec`, `transactionSync`), so they are tested on `node:sqlite`; every multi-row write runs in one
  `transactionSync`, and a storage error reaches the caller as a rejected promise. The connection line keeps
  IP, port, pseudo and account id in one ciphertext bound to the connection id; dates and protocols stay clear.
  The daily purge time is kept in a `meta` row (`lastPurgeAt`) with the schema version. The hub gains
  `maintain(now, purge)` and `maintenanceInTick: false`, so purges and retry rounds run from the alarm only.
  The `/owner/*` loopback check is off on Cloudflare (`ownerLoopbackOnly: false`, BR-093), and the peer
  address there is `CF-Connecting-IP`. A refused or silent socket is closed with no code or 1008, then the
  hub's close runs at once, as on Node, even when the runtime throws on `close()`. The tick and the sweep start
  with the first accepted socket and stop with the last close; an alarm wake starts neither. An oversize frame
  goes to `hub.receive`, which counts it as invalid (`frameTooLarge`), so the fifth in a row closes the socket
  (BR-088). After a failed daily purge the alarm is re-armed no sooner than 10 minutes. The daily moderation
  purge also drops `pending_statements` past `give_up_at` and `pending_mails` past the 7-day give-up window.
  Closing an account (UC19, BR-081) writes the vault row, the account and device deletes and the carry-over in
  one `transactionSync`.
