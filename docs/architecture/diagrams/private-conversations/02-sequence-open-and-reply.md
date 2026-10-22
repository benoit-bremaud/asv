# Sequence diagram — private-conversations — open and reply

> **Feature**: private-conversations
> **Use cases**: UC6, UC8
> **Business rules**: BR-040 to BR-043, BR-060
> **Related ADRs**: ADR-0007, ADR-0009, ADR-0014

## Context

Both chatters hold their single socket to the hub. Does not cover the away buffer delivery, shown in
`entry/02b`.

## Diagram

```mermaid
sequenceDiagram
  actor A as Chatter A
  participant WA as Web client A
  participant H as Hub
  participant D as Domain
  participant WB as Web client B
  participant L as Connection log store
  A->>WA: Click pseudo B, type first message
  WA->>H: sendPrivate(B, text)
  H->>D: sendPrivate(state, sessionA, pseudoB, text, now)
  alt A or B has no account
    D-->>H: Refused (account required)
    H-->>WA: error(accountRequired)
  else Limits exceeded
    D-->>H: Refused
    H-->>WA: warning
  else B gone
    D-->>H: Refused (offline)
    H-->>WA: error(offline)
  else B ignores A
    D-->>H: Window for A only, message dropped
    H-->>WA: privateWindow(B) + echo
  else B away
    D-->>H: Buffered for B
    H-->>WA: privateWindow(B, away) + echo
  else Delivered
    D-->>H: Conversation + message
    H-->>WA: privateWindow(B) + echo
    H-->>WB: privateMessage(from A)
    H->>L: content line (connection id, content id, creation, now)
  end
```

## Notes

- The conversation is keyed by both session ids sorted, so replies use the same window.
- The content line is written for every accepted message, also when it is buffered for an away chatter or
  dropped by an ignore, and never holds the text (BR-060). The operation is added only under a Prime Minister's injunction. Only the delivered branch is drawn.
- The ignored chatter is never told (Caramail behaviour, avoids escalation).
