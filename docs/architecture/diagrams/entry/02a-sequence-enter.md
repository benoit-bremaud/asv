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
  participant D as Domain
  participant LS as Connection log store
  V->>W: Fill pseudo, gender, age, city, tick 18+
  W->>WK: WebSocket upgrade /ws
  WK->>WK: Check Origin header
  WK->>H: Forward upgrade with client IP
  W->>H: enter(form)
  H->>ST: activeBan(ipKeyedHash, pseudo, now)
  ST-->>H: ban or none
  H->>D: enter(state, form, ip, activeBan, now, random)
  alt Refused (rate, ban, pseudo, age)
    D-->>H: Refusal with reason
    H-->>W: entryRefused(reason)
  else Accepted
    D-->>H: New state + session + resume token
    H->>LS: open log(ip, pseudo, now)
    H->>H: Save session in socket attachment
    H-->>W: entered(sessionId, resumeToken, roomList)
    W-->>V: Show rooms
  end
```

## Notes

- `now` and `random` are passed as arguments so the domain is deterministic in tests.
- The IP comes from the platform (`CF-Connecting-IP` on Cloudflare, socket address on Node).
- The client keeps the resume token and its own profile in `sessionStorage` (ADR-0011).
- The connection log is closed on leave, away expiry and expel (see `entry/02b` and `moderation/02a`).
