# Component diagram — chat-core — structure and dependencies

> **Feature**: chat-core
> **Related ADRs**: ADR-0002, ADR-0003, ADR-0007

## Context

Folders of the single package and the direction of dependencies. Two transports adapt the same
domain and the same server. Does not cover deployment (DNS, Workers routes) or the web screens' internals.

## Diagram

```mermaid
flowchart LR
  subgraph Web ["src/web — Vite React"]
    UI["Screens: entry, rooms, room, private windows"]
    WSC["WebSocket client"]
    UI --> WSC
  end
  subgraph Server ["src/server — Hono app"]
    Routes["HTTP routes + WebSocket upgrade"]
  end
  subgraph Domain ["src/domain — pure TypeScript"]
    Core["Hub state: sessions, rooms, private conversations, moderation, colours"]
    Ports["Ports: ReportStore, ConnectionLogStore"]
  end
  subgraph NodeT ["src/transports/node — dev and tests"]
    NodeHub["In-memory hub"]
    NodeStore["In-memory stores"]
  end
  subgraph CfT ["src/transports/cloudflare — production"]
    HubDO["Hub Durable Object"]
    Sqlite["DO SQLite stores"]
  end
  WSC -->|"one WebSocket, JSON"| Routes
  NodeHub -->|"builds and wires"| Routes
  HubDO -->|"builds and wires"| Routes
  Routes --> Core
  NodeHub --> Core
  HubDO --> Core
  NodeStore -.->|"implements"| Ports
  Sqlite -.->|"implements"| Ports
  HubDO --> Sqlite
  NodeHub --> NodeStore
```

## Notes

- Every arrow into `src/domain` is inbound. The domain imports nothing from the other folders.
- The server never imports a transport. Each transport entry point builds the Hono app and plugs
  in its hub and stores (ADR-0002).
- `src/web` shares only protocol message types with the server. The `src/shared/protocol.ts` seam is
  decided in brick 2.
- Only one transport is active per runtime: Node locally, Cloudflare in production.
