# State diagram — chat-core — session lifecycle

> **Feature**: chat-core
> **Related ADRs**: ADR-0004, ADR-0005

## Context

Lifecycle of a chatter's session, from the entry form to the end. Does not cover private windows,
which are not session states, nor a reconnection grace period (not decided yet).

## Diagram

```mermaid
stateDiagram-v2
  [*] --> Anonymous
  Anonymous --> Connected: pseudo free, 18+ ticked, age 18+, terms accepted
  Anonymous --> Anonymous: pseudo taken or invalid, 18+ not ticked, age under 18
  Anonymous --> Refused: IP or pseudo banned, entry rate limit hit
  Connected --> InRoom: join room
  InRoom --> Connected: leave room
  InRoom --> InRoom: post, open private window, ignore, report
  Connected --> Connected: search, open private window, ignore, report
  Connected --> Closed: leave chat or socket lost
  InRoom --> Closed: leave chat or socket lost
  Connected --> Expelled: moderator expels
  InRoom --> Expelled: moderator expels
  Expelled --> [*]
  Closed --> [*]
  Refused --> [*]
```

## Notes

- A chatter in a room or not can hold several private windows at once.
- A reconnection grace period would add a `Reconnecting` state between `Connected/InRoom` and
  `Closed`. Tracked as a follow-up.
- Moderator status is `Session.isModerator`, granted at entry by a secret moderator key (open
  question for V1).
