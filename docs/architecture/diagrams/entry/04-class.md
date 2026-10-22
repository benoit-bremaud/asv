# Class diagram — entry — identity and session

> **Feature**: entry
> **Business rules**: BR-001 to BR-015, BR-060
> **Related ADRs**: ADR-0005, ADR-0006, ADR-0009, ADR-0011, ADR-0014

## Context

Entities created at entry, the away record and the legal log. Does not cover rooms, private
conversations or moderator credentials (see their studies) nor the hub aggregate (see
`platform/04b-class-hub-state`).

## Diagram

```mermaid
classDiagram
  class Member {
    +MemberId id
    +Pseudo pseudo
  }
  class Pseudo {
    +String value
    +normalized() String
  }
  class Session {
    +SessionId id
    +SessionStatus status
    +String connectionId
    +Date openedAt
    +Gender gender
    +Profile profile
    +String ip
    +String moderatorName
    +AccountId accountId
    +String deviceTokenHash
    +ResumeTokenHash resumeTokenHash
  }
  class SessionStatus {
    <<enumeration>>
    connected
    away
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
  class AwayRecord {
    +SessionId sessionId
    +String connectionId
    +String pseudo
    +AccountId accountId
    +ResumeTokenHash resumeTokenHash
    +Date awayUntil
    +RoomId[] rooms
    +ConversationId[] windows
    +SessionId[] ignored
    +PrivateMessage[] buffered
  }
  class ConnectionLog {
    +String connectionId
    +String ip
    +Number sourcePort
    +String protocol
    +String pseudo
    +AccountId accountId
    +Date startedAt
    +Date endedAt
  }
  class ContentLogLine {
    +String connectionId
    +String contentId
    +ContentOperation operation "only under injunction"
    +Date at
  }
  class ContentOperation {
    <<enumeration>>
    creation
    change
    deletion
  }
  Session "1" --> "1" Member
  Member *-- Pseudo
  Session *-- Profile
  Session --> Gender
  Session --> SessionStatus
  Session ..> AwayRecord : saved as when away
  ContentLogLine --> ConnectionLog : connectionId
  ContentLogLine --> ContentOperation
```

## Notes

- A session exists only once entry is accepted. Closed and expelled sessions are removed, they are not statuses.
- `moderatorName` is empty for ordinary chatters. A non-empty value means moderator rights.
- `accountId` is empty until the session is linked to an account (UC17, ADR-0012).
- `AwayRecord` holds no gender, age or city (ADR-0011). `buffered` is capped at 50 messages (BR-013).
- The resume token itself is only sent to the client. The server keeps its hash and rotates it at each resume.
- `ConnectionLog` is persisted with plain values: one line per session, with a random connection id (BR-060).
  The session, its socket attachment and its away record carry that id, so content lines and the end time
  attach to the right connection row after a rebuild or a resume (ADR-0011). The id is linked to nothing else. `sourcePort` and `accountId` are optional (empty without a port or an account).
- `ContentLogLine` is written for every creation, change or deletion (decree 2021-1362 arts. 5 and 7), never the
  content. `operation` is filled only while a Prime Minister's injunction is in force (CPCE L34-1 III, art. 6). Both logs are kept 1 year
  and read only by the owner (BR-082).
- Pseudo colour is derived from `Session.gender` in the web client.
