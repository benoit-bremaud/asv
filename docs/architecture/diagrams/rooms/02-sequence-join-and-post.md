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
    H->>L: appendContribution(connection id, protocols #59; content id, operation, date and time under injunction)
    alt Write fails
      L-->>H: error
      H-->>W: error(logUnavailable), message not delivered
    else Written
      H-->>O: roomMessage
      H-->>W: roomMessage echo
    end
  end
```

## Notes

- The domain decides presence, limits and ignore filtering. The hub only routes.
- No history (BR-034).
- The contribution line holds no text (BR-060). It always has the connection id and protocols; the content id,
  operation, date and time are added only while an injunction under CPCE L34-1 III is in force. The message
  itself is never stored.
- The line is written before delivery. If the write fails, the message is refused and not delivered.
