# Class diagram — rooms — rooms and messages

> **Feature**: rooms
> **Business rules**: BR-020 to BR-034

## Context

Room model inside the hub state. Does not cover sessions (see `entry`).

## Diagram

```mermaid
classDiagram
  class Room {
    +RoomId id
    +String name
    +RoomKind kind
    +Number capacity
    +SessionId owner
    +SessionId[] members
    +join(sessionId) Room
    +leave(sessionId) Room
    +isEmpty() Boolean
  }
  class RoomKind {
    <<enumeration>>
    themed
    regional
    user
  }
  class RoomMessage {
    +RoomId roomId
    +SessionId author
    +String text
    +Date sentAt
  }
  class FloodCounter {
    +SessionId sessionId
    +Date[] recent
    +allows(now) Boolean
  }
  Room --> RoomKind
  Room "1" ..> "0..*" RoomMessage : broadcasts
```

## Notes

- `owner` is set only for user rooms (BR-031).
- Messages are not stored in the room, they are broadcast and forgotten (BR-034).
- `FloodCounter` is shared with private messages (BR-021).
