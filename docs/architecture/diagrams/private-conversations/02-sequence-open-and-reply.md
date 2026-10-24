# Sequence diagram — private-conversations — open and reply

> **Feature**: private-conversations
> **Use cases**: UC6, UC8
> **Business rules**: BR-013, BR-020, BR-021, BR-040 to BR-043, BR-060
> **Domain API**: `private-conversations/07`
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
  A->>WA: Click pseudo B, "message privé", type first message
  WA->>H: sendPrivate(B, text)
  H->>D: sendPrivate(state, sessionA, pseudoB, text, now)
  alt A or B has no account
    D-->>H: privateRefused(accountRequired)
    H-->>WA: error(accountRequired)
  else B gone (or B is A)
    D-->>H: privateRefused(offline or self)
    H-->>WA: error(offline) or warning(self)
  else Empty, too long, flood or 3 windows open
    D-->>H: privateRefused(reason)
    H-->>WA: warning(reason)
  else Accepted
    D-->>H: windows opened + privateMessage(recipients)
    H->>L: appendContribution(connection id, protocols #59; content id, operation, date and time under injunction)
    alt Write fails
      L-->>H: error
      H-->>WA: error(logUnavailable), state kept, message not delivered
    else Written, A or B ignores the other
      H-->>WA: privateWindow(B) + privateMessage echo
    else Written, B away
      H-->>WA: privateWindow(B, away) + privateMessage echo
      Note over H: buffered for B, sent in resumed.buffered (entry/02b)
    else Written, B connected
      H-->>WA: privateWindow(B) + privateMessage echo
      H-->>WB: privateWindow(A) + privateMessage(from A)
    end
  end
  A->>WA: Close the window
  WA->>H: closePrivate(conversationId)
  H->>D: closePrivate(state, sessionA, conversationId)
  Note over H,WB: nothing sent; B's window stays open
  Note over H,WB: B goes away, comes back or leaves → memberAway, privateWindow, memberLeft (no roomId) to A if its window is open
```

## Notes

- The conversation is keyed by both session ids sorted, so replies use the same window.
- The contribution line is written for every accepted message, also when it is buffered for an away chatter or
  dropped by an ignore, and never holds the text (BR-060). The content id, operation, date and time are added only
  under a Prime Minister's injunction. 
- The line is written before the state is kept. If the write fails, the message is refused, nothing is
  opened, buffered or counted.
- `privateWindow` is sent only to a side whose window was just opened; replies in an open window only
  carry `privateMessage`.
- The ignored chatter is never told (Caramail behaviour, avoids escalation).
