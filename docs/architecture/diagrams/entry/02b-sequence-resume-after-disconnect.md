# Sequence diagram — entry — disconnect, away, resume or expire

> **Feature**: entry
> **Use cases**: UC13, UC10 extension 1a
> **Business rules**: BR-010 to BR-015
> **Related ADRs**: ADR-0009, ADR-0011

## Context

A phone locks, the socket dies, the chatter comes back within 5 minutes, or the session expires.
Does not cover the heartbeat sweep in detail (see `platform/05-state-hub`).

## Diagram

```mermaid
sequenceDiagram
  actor C as Chatter
  participant W as Web client
  participant H as Hub
  participant D as Domain
  participant AS as Away records
  participant ACC as Account store
  participant LS as Connection log store
  participant O as Others
  W->>H: ping every 25 s, auto pong
  Note over W,H: Phone locks, socket dies
  H->>D: socketLost(state, sessionId, now)
  D-->>H: Session away until now + 5 min
  H->>LS: close(connection id, now)
  H->>AS: save away record without gender, age, city
  H->>H: Set alarm to earliest deadline
  H-->>O: memberAway(X)
  O->>H: sendPrivate(X, text)
  H->>D: sendPrivate(...)
  D-->>H: Buffered for X
  H->>AS: append to buffer
  alt Chatter returns within 5 minutes
    C->>W: Unlock phone
    W->>H: WebSocket upgrade then resume(token, profile)
    H->>AS: load away record
    H->>ACC: account still exists for record.accountId
    H->>D: resume(state, record, account, token, profile, now, random)
    alt Token valid
      D-->>H: Session connected + new token + buffered messages
      H->>AS: delete away record
      H->>H: Draw new connection id
      H->>LS: open(new connection id, IP, port, protocols, pseudo, account id, now)
      H->>H: Save new connection id in socket attachment
      H-->>W: resumed(sessionId, pseudo, newToken, rooms, windows, buffered, accountId or none)
      H-->>O: memberBack(X)
    else Token invalid
      D-->>H: Refused
      H-->>W: resumeRefused
      W-->>C: Entry screen with previous pseudo prefilled
    end
  else 5 minutes elapse
    H->>D: expireAway(state, sessionId, now)
    D-->>H: Session closed + rooms and windows to notify
    H->>AS: delete away record
    H-->>O: memberLeft(X)
  end
```

## Notes

- Room messages posted while away are not buffered (BR-013 covers private messages only).
- Gender, age and city never reach storage: the client resends them with `resume` (ADR-0011).
- UC10 (leave) follows the same closing steps as expiry, triggered by the `leave` command. It also closes the
  connection line of the current socket, since the socket is still open.
- One connection line per socket connection (BR-060): the line closes on socket loss, a resume opens a new one with
  a new connection id. The away record does not carry the id.
- If the account was deleted while away, the session resumes without it and its private windows close
  (`accountUnlinked`).
