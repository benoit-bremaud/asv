# Class diagram — moderation — reports, bans, moderators

> **Feature**: moderation
> **Business rules**: BR-050 to BR-057, BR-061, BR-062
> **Related ADRs**: ADR-0008, ADR-0010, ADR-0011

## Context

Persisted moderation records and the ports that store them. Records hold snapshot values, never links
to ephemeral sessions. Does not cover connection logs or sessions (see `entry`).

## Diagram

```mermaid
classDiagram
  class Report {
    +ReportId id
    +ReportReason reason
    +ReportTarget targetKind
    +String targetPseudo
    +AccountId targetAccountId
    +String targetIpKeyedHash
    +RoomId targetRoomId
    +String excerpt
    +String[] context
    +String authorPseudo
    +Date createdAt
    +ReportStatus status
    +Triage triage
    +ReportOutcome outcome
    +String handledBy
    +Date handledAt
  }
  class ReportReason {
    <<enumeration>>
    harassment
    seemsMinor
    spam
    illegalContent
    other
  }
  class ReportTarget {
    <<enumeration>>
    chatter
    message
    room
  }
  class ReportStatus {
    <<enumeration>>
    open
    closed
  }
  class ReportOutcome {
    <<enumeration>>
    noAction
    warned
    expelled
    suspended
    severeDeleted
    roomRemoved
  }
  class Triage {
    +String category
    +Urgency urgency
    +String summary
  }
  class Urgency {
    <<enumeration>>
    unknown
    low
    medium
    high
  }
  class Ban {
    +String ipKeyedHash
    +String pseudo
    +Date until
    +String decidedBy
  }
  class Moderator {
    +String name
    +String credentialId
    +String publicKey
    +Number signCount
  }
  class Invitation {
    +String tokenHash
    +String moderatorName
    +Date expiresAt
    +Boolean used
  }
  class ModerationStore {
    <<interface>>
    +saveReport(report)
    +saveTriage(reportId, triage)
    +openReports() Report[]
    +closeReport(id, outcome, by, at)
    +saveBan(ban)
    +activeBan(ipKeyedHash, pseudo, now) Ban
    +purgeExpired(now)
  }
  class ModeratorStore {
    <<interface>>
    +saveInvitation(invitation)
    +consumeInvitation(tokenHash, now) Invitation
    +saveModerator(moderator)
    +findByCredential(id) Moderator
    +updateSignCount(id, count)
    +deleteModerator(name)
  }
  class ReportTriage {
    <<interface>>
    +triage(context) Triage
  }
  Report --> ReportReason
  Report --> ReportTarget
  Report --> ReportStatus
  Report --> ReportOutcome
  Report *-- Triage
  Triage --> Urgency
  ModerationStore ..> Report
  ModerationStore ..> Ban
  ModeratorStore ..> Moderator
  ModeratorStore ..> Invitation
```

## Notes

- Store ports sit next to the domain, implemented in memory (Node) and in Durable Object SQLite (Cloudflare).
- `ReportTriage` wraps the third-party AI (ADR-0010). A no-AI adapter returns urgency `unknown`.
- `purgeExpired` applies BR-061 and BR-062 and is called by the hub's daily alarm (ADR-0011).
- `signCount` helps detect cloned authenticators.
- Strikes and e-mail blocks live with accounts (see `accounts/04-class`). `targetAccountId` and
  `targetIpKeyedHash` are captured when the report is filed, so a strike or a suspension ban can be
  applied after the target has left.
