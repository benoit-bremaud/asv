# Sequence diagram — chat-core — join a room and post

> **Feature**: chat-core
> **Use cases**: UC3 Join a room, UC4 Post a message in a room, UC8 Ignore a chatter
> **Related ADRs**: ADR-0002, ADR-0007

## Context

The chatter already has a session and its single WebSocket to the hub (UC1). Shown with the
production hub. The Node transport has the same shape with an in-memory hub. Does not cover entry.

## Diagram

```mermaid
sequenceDiagram
  actor C as Chatter
  participant W as Web client
  participant H as Hub
  participant D as Domain
  participant O as Other room members
  C->>W: Click a room
  W->>H: join(roomId) over the session socket
  H->>D: join(state, sessionId, roomId)
  alt Room full
    D-->>H: Refused (full)
    H-->>W: error
  else Joined
    D-->>H: New state + member list
    H-->>W: member list
    H-->>O: "X joined"
  end
  C->>W: Type a message
  W->>H: post(roomId, text)
  H->>D: post(state, sessionId, roomId, text, now)
  alt Flood limit hit or text too long
    D-->>H: Refused
    H-->>W: warning
  else Accepted
    D-->>H: Message + recipients minus ignorers
    H-->>O: message
    H-->>W: message echo
  end
```

## Notes

- The domain decides everything (presence, flood, length, ignore filtering). The hub only moves bytes.
- `now` is passed in so the domain stays deterministic and testable.
- No message history is stored: a newcomer only sees messages posted after joining.
