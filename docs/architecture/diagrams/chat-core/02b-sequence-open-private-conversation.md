# Sequence diagram — chat-core — open a private conversation

> **Feature**: chat-core
> **Use cases**: UC6 Open a private conversation, UC8 Ignore a chatter
> **Related ADRs**: ADR-0005, ADR-0007

## Context

Both chatters are connected to the same hub through their own single socket, whatever rooms they
are in. Does not cover the following messages of the conversation, which use the same path.

## Diagram

```mermaid
sequenceDiagram
  actor A as Chatter A
  participant WA as Web client A
  participant H as Hub
  participant D as Domain
  participant WB as Web client B
  A->>WA: Click pseudo B and type a first message
  WA->>H: openPrivate(B, text)
  H->>D: openPrivate(state, sessionA, pseudoB, text, now)
  alt B is offline
    D-->>H: Refused (offline)
    H-->>WA: "B is not connected"
  else B ignores A
    D-->>H: Window for A only, message dropped
    H-->>WA: private window open
  else Allowed
    D-->>H: Conversation + message
    H-->>WA: private window open
    H-->>WB: private window open with the message from A
  end
```

## Notes

- An ignored chatter is not told they are ignored (Caramail behaviour, avoids escalation).
- The conversation is keyed by both session ids sorted, so A to B and B to A share it.
- The same hub serves UC7 (find by pseudo or city) from its session list.
