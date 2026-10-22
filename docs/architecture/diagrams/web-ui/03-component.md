# Component diagram — web-ui — front-end structure

> **Feature**: web-ui (roadmap brick 7)
> **Requirements**: ASV-NF-004, NF-005, NF-006, NF-011, NF-012
> **Design**: `docs/architecture/design-pack.md`

## Context

Modules of the React single-page app and their dependencies. Does not cover visual styling (see the
design pack) or the server side (see `platform`).

## Diagram

```mermaid
flowchart LR
  subgraph Web ["src/web"]
    subgraph Screens ["Screens"]
      Entry["EntryScreen"]
      Rooms["RoomsScreen"]
      Room["RoomScreen"]
      Search["SearchPanel"]
      Windows["PrivateWindows"]
      Mod["ModeratorPanel"]
      Account["AccountPanel"]
    end
    Store["Client state store"]
    Conn["Connection manager: socket, heartbeat, backoff, resume"]
    Render["Message renderer: text + smiley whitelist"]
    Strings["UI strings, French first"]
    Passkey["Passkey client"]
  end
  Shared["src/shared/protocol, proposed"]
  Screens --> Store
  Screens --> Render
  Screens --> Strings
  Store --> Conn
  Conn --> Shared
  Mod --> Passkey
  Entry --> Passkey
```

## Notes

- Only the connection manager talks to the network. Screens read and update the store.
- The connection manager owns BR-010 (heartbeat), automatic reconnection with backoff, and resume (UC13).
- The renderer is the single place that turns text into DOM, enforcing BR-022.
- `src/shared/protocol` is the typed message contract shared with the server (see `platform/04`).
- The entry screen keeps "enter" disabled until the 18+ box and the terms box are ticked, and caps the city field at 40 characters. The server still refuses such input with `error invalid` (`entry/07`).
