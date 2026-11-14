# Sequence diagram — platform — Cloudflare transport: Worker, Hub Durable Object and storage

> **Feature**: platform (roadmap brick 9, issue #233)
> **Use cases**: UC1, UC3, UC4, UC10, UC13, UC16, UC20
> **Business rules**: BR-060, BR-088, BR-089, BR-093, BR-109 to BR-113
> **Related ADRs**: ADR-0007, ADR-0011 (amended), ADR-0017, ADR-0020

## Context

How `src/transports/cloudflare/` wraps the transport-neutral hub (`platform/04c`) in the single Hub Durable
Object, mirroring the Node transport (`platform/02`). Does not cover what the hub does with each command.

## Diagram

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as Cloudflare Access
  participant W as Worker (Hono app + assets)
  participant H as Hub Durable Object
  participant S as SQLite of the Hub

  B->>A: GET / (asvchat.fr or staging)
  A-->>B: allowed by the allow-list (BR-113)
  B->>W: GET / , static assets
  W-->>B: built web client, BR-086 headers
  B->>W: GET /ws Upgrade, Origin, CF-Connecting-IP
  alt secret missing (BR-111)
    W-->>B: 503
  else no CF-Connecting-IP or Origin refused
    W-->>B: 400 / 403
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
    H->>H: frame budget (BR-088), hub.receive
    H->>S: store writes through the ports (ciphertext, ADR-0017)
    H-->>B: outgoing messages
  end
  par timers while in memory (BR-110)
    H->>H: hub.tick every second, heartbeat sweep
  and daily alarm
    H->>S: purge expired rows, retry alerts and decision e-mails
    H->>H: setAlarm(next run, at most 24 h)
  end
  B->>A: POST /owner/invite (owner CLI)
  A->>W: owner-only policy passed (BR-113)
  W->>H: RPC invite, owner secret checked (BR-093)
  H->>S: save invitation
  H-->>B: invitation link
  Note over H: Deploy or restart: every socket closes, memory resets; clients return to entry (BR-109)
```

## Notes

- The Worker never touches SQLite; it reads the environment once per isolate and passes nothing secret in the
  forwarded request.
- `socketKey` is a random id held in a `Map` of the object, the same role as on Node.
- The Durable Object's tables mirror the Node stores one to one: `connection_lines`, `contribution_lines`,
  `accounts`, `codes`, `code_events`, `devices`, `email_blocks`, `carry_overs`, `vault`, `reports`,
  `alerts`, `pending_mails`, `bans`, `moderators`, `invitations`. One schema migration runs in the constructor
  inside `blockConcurrencyWhile`.
