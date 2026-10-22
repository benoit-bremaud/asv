# State diagram — entry — connection and session lifecycle

> **Feature**: entry
> **Use cases**: UC1, UC10, UC11, UC13
> **Related ADRs**: ADR-0004, ADR-0005, ADR-0009

## Context

`Anonymous` and `Refused` are states of the connection before any session exists. A session is
created on `Connected`. Does not cover room membership or private windows, which are data, not states.

## Diagram

```mermaid
stateDiagram-v2
  [*] --> Anonymous
  Anonymous --> Anonymous: pseudo invalid, reserved or taken
  Anonymous --> Refused: 18+ missing, rate limit, active ban
  Anonymous --> Connected: entry accepted, session created
  Connected --> Away: socket lost or heartbeat timeout
  Away --> Connected: resume with valid token
  Away --> Closed: 5 minutes elapsed
  Connected --> Closed: leave
  Connected --> Closed: moderator expels, ban created
  Away --> Closed: moderator expels, ban created
  Refused --> [*]
  Closed --> [*]
```

## Notes

- Closing frees the pseudo and notifies rooms and windows. The connection line closes when the socket is lost,
  on leave and on expel, not on away expiry (BR-060).
- An expulsion is a close with a ban as side effect (see `moderation/02a`).
- Moderator rights are `Session.moderatorName`, not a state (see `moderation`).
