# Sequence diagram — entry — enter the chat

> **Feature**: entry
> **Use cases**: UC1
> **Business rules**: BR-001 to BR-008
> **Related ADRs**: ADR-0004, ADR-0005, ADR-0007, ADR-0011

## Context

From the entry form to the room list. Production path shown, the Node transport has the same shape
with plain function calls. Does not cover moderator sign-in (see `moderation/02c`).

## Diagram

```mermaid
sequenceDiagram
  actor V as Visitor
  participant W as Web client
  participant WK as Worker
  participant H as Hub
  participant ST as Moderation store
  participant AS as Account store
  participant D as Domain
  participant LS as Connection log store
  V->>W: Fill pseudo, gender, age, city, tick 18+
  W->>WK: WebSocket upgrade /ws
  WK->>WK: Check Origin header
  WK->>H: Forward upgrade with client IP and device cookie hash if any
  W->>H: enter(form)
  H->>ST: activeBan(ipKeyedHash, pseudo, now)
  ST-->>H: ban or none
  H->>AS: accountForDevice(deviceTokenHash, now)
  AS-->>H: account or none
  H->>D: enter(state, form, ip, activeBan, account, now, random)
  alt Refused (rate, ban, pseudo, age)
    D-->>H: Refusal with reason
    H-->>W: entryRefused(reason)
  else Accepted
    D-->>H: New state + session + resume token
    H->>H: Draw connection id
    H->>LS: open(connection id, IP, port, protocols, pseudo, account id, now)
    H->>H: Save session and connection id in socket attachment
    H-->>W: entered(sessionId, resumeToken, roomList, accountId)
    W-->>V: Show rooms
  end
```

## Notes

- `now` and `random` are passed as arguments so the domain is deterministic in tests.
- The IP comes from the platform (`CF-Connecting-IP` on Cloudflare, socket address on Node).
- The client keeps the resume token and its own profile in `sessionStorage` (ADR-0011).
- A device cookie pointing to a deleted account yields no account and `entered.staleDevice = true`.
  The client then calls `POST /account/sign-out` to clear the stale cookie (ADR-0013), since it cannot
  read the `HttpOnly` cookie itself.
- The connection line is closed by connection id on socket loss, leave and expel (see `entry/02b` and `moderation/02a`).
  Away expiry closes nothing: the line was closed when the socket was lost.
