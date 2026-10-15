# Class diagram — private-conversations — conversations and ignore

> **Feature**: private-conversations
> **Business rules**: BR-040 to BR-043

## Context

Private conversation model in the hub state. Does not cover sessions (see `entry`).

## Diagram

```mermaid
classDiagram
  class PrivateConversation {
    +ConversationId id
    +SessionId first
    +SessionId second
    +Date openedAt
    +static keyFor(a, b) ConversationId
  }
  class PrivateMessage {
    +ConversationId conversationId
    +SessionId author
    +String text
    +Date sentAt
  }
  class IgnoreList {
    +SessionId owner
    +SessionId[] ignored
    +ignores(sessionId) Boolean
    +add(sessionId) IgnoreList
    +remove(sessionId) IgnoreList
  }
  PrivateConversation "1" ..> "0..*" PrivateMessage : delivers
  PrivateConversation --> "2" SessionId
```

## Notes

- Messages are delivered and forgotten, except the away buffer on the session (BR-013).
- `IgnoreList` belongs to the session and dies with it. It holds session ids, not pseudos, so a newcomer
  who takes a freed pseudo does not inherit someone else's ignore.
