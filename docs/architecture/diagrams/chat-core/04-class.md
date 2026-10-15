# Class diagram — chat-core — domain model

> **Feature**: chat-core
> **Related ADRs**: ADR-0004, ADR-0005, ADR-0006

## Context

Domain entities of V1. `Member` is separate from `Session` so accounts can come in V2 (ADR-0005).
Persisted records hold snapshot values, not links to ephemeral objects. Does not cover transport or
storage classes.

## Diagram

```mermaid
classDiagram
  class Member {
    +MemberId id
    +Pseudo pseudo
  }
  class Session {
    +SessionId id
    +Date openedAt
    +Gender gender
    +Profile profile
    +IgnoreList ignored
    +Boolean isModerator
    +String ip
  }
  class Pseudo {
    +String value
  }
  class Gender {
    <<enumeration>>
    woman
    man
    unspecified
  }
  class Profile {
    +Number age
    +String city
  }
  class Room {
    +RoomId id
    +String name
    +RoomKind kind
    +Number capacity
  }
  class RoomKind {
    <<enumeration>>
    themed
    regional
    user
  }
  class Message {
    +String text
    +Date sentAt
  }
  class PrivateConversation {
    +SessionId first
    +SessionId second
  }
  class Report {
    +ReportReason reason
    +String excerpt
    +Pseudo authorPseudo
    +Pseudo targetPseudo
    +Date createdAt
    +ReportStatus status
  }
  class Ban {
    +String ipKeyedHash
    +Pseudo pseudo
    +Date until
  }
  class ConnectionLog {
    +String ip
    +Pseudo pseudo
    +Date connectedAt
    +Date disconnectedAt
  }
  Session "1" --> "1" Member
  Member "1" *-- "1" Pseudo
  Session "1" *-- "1" Profile
  Session --> Gender
  Room --> RoomKind
  Room "1" o-- "0..*" Session : present
  Room "1" *-- "0..*" Message
  PrivateConversation "1" *-- "0..*" Message
  PrivateConversation --> "2" Session
```

## Notes

- Pseudo colour is derived from `Session.gender` at render time, never stored.
- Declared age must be 18 or more at entry (ADR-0004).
- Messages live only in memory while the room or conversation is alive.
- `Report`, `Ban` and `ConnectionLog` are persisted and hold snapshot values only. V2 may add an
  optional `memberId` when accounts exist.
- `ConnectionLog` keeps the raw IP (legal log). `Ban` keeps an HMAC of the IP with a server secret:
  pseudonymised, not anonymised.
