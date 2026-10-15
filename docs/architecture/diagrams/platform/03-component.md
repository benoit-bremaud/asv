# Component diagram — platform — structure and dependencies

> **Feature**: platform (roadmap bricks 2, 6, 8)
> **Requirements**: ASV-NF-003, NF-009, NF-010
> **Related ADRs**: ADR-0002, ADR-0003, ADR-0007, ADR-0008, ADR-0010, ADR-0011

## Context

Folders of the single package and the direction of dependencies. Two transports adapt the same domain
and the same server. Does not cover the web modules (see `web-ui`).

## Diagram

```mermaid
flowchart LR
  subgraph Web ["src/web"]
    Conn["Connection manager"]
  end
  Shared["src/shared/protocol, proposed"]
  subgraph Server ["src/server — Hono app"]
    Routes["HTTP routes, WebSocket upgrade, passkey ceremonies"]
  end
  subgraph Domain ["src/domain — pure TypeScript"]
    Core["Hub state and rules: sessions, rooms, private conversations, moderation"]
    Ports["Ports: ModerationStore, ModeratorStore, AccountStore, ConnectionLogStore, AwayStore, ReportTriage, Mailer"]
  end
  subgraph NodeT ["src/transports/node — dev and tests"]
    NodeMain["Node entry: builds Hono app"]
    NodeHub["In-memory hub"]
    NodeStore["In-memory stores, no-AI triage, console mailer"]
  end
  subgraph CfT ["src/transports/cloudflare — production"]
    WorkerEntry["Worker entry: builds Hono app"]
    HubDO["Hub Durable Object"]
    Sqlite["Durable Object SQLite stores"]
  end
  AIAdapter["AI triage adapter, chosen in brick 8"]
  MailAdapter["Mailer adapter, provider chosen in brick 5"]
  Conn -->|"one WebSocket"| Routes
  Conn --> Shared
  Routes --> Shared
  NodeMain -->|"builds and wires"| Routes
  WorkerEntry -->|"builds and wires"| Routes
  NodeMain --> NodeHub
  WorkerEntry -->|"forwards WebSocket, RPC"| HubDO
  NodeHub --> Core
  HubDO --> Core
  NodeStore -.->|"implements"| Ports
  Sqlite -.->|"implements"| Ports
  AIAdapter -.->|"implements ReportTriage"| Ports
  MailAdapter -.->|"implements Mailer"| Ports
  HubDO --> MailAdapter
  NodeHub --> NodeStore
  HubDO --> Sqlite
  HubDO --> AIAdapter
```

## Notes

- Every arrow into `src/domain` is inbound. The domain imports nothing from other folders (lint rule).
- `src/server` never imports a transport. Each transport entry point builds the Hono app and plugs in its hub.
- Time and randomness are passed to domain functions as arguments (`now`, `random`), not as ports.
- Passkey verification (SimpleWebAuthn) lives in `src/server` and reaches stores only through the hub (ADR-0008).
- `src/shared/protocol` holds only message types and their validation schema. Confirmed in brick 2.
