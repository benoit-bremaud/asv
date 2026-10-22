# Sequence diagram — rooms — join a room and post

> **Feature**: rooms
> **Use cases**: UC3, UC4, UC8
> **Business rules**: BR-020 to BR-023, BR-060
> **Related ADRs**: ADR-0007, ADR-0014

## Context

The chatter already has a session and its single WebSocket (see `entry`). Does not cover room creation,
which follows the same path with a `createRoom` command.

## Diagram

```mermaid
sequenceDiagram
  actor C as Chatter
  participant W as Web client
  participant H as Hub
  participant D as Domain
  participant L as Connection log store
  participant O as Other room members
  C->>W: Click a room
  W->>H: joinRoom(roomId)
  H->>D: joinRoom(state, sessionId, roomId)
  alt Room full
    D-->>H: Refused (full)
    H-->>W: error
  else Joined
    D-->>H: New state + member list
    H-->>W: roomJoined(members)
    H-->>O: memberJoined(X)
  end
  C->>W: Type a message
  W->>H: postRoom(roomId, text)
  H->>D: postRoom(state, sessionId, roomId, text, now)
  alt Too long or flood
    D-->>H: Refused
    H-->>W: warning
  else Accepted
    D-->>H: Message + recipients minus ignorers
    opt Prime Minister's injunction in force
      H->>L: content line (connection id, content id, creation, now)
    end
    H-->>O: roomMessage
    H-->>W: roomMessage echo
  end
```

## Notes

- The domain decides presence, limits and ignore filtering. The hub only routes.
- No history (BR-034).
- The content line holds no text (BR-060). It is written only while an injunction under CPCE L34-1 III is in
  force; the message itself is never stored.
