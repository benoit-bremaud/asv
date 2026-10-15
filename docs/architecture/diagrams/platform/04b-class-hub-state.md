# Class diagram — platform — hub state aggregate

> **Feature**: platform
> **Related ADRs**: ADR-0007, ADR-0011
> **Business rules**: BR-002, BR-007, BR-021, BR-042

## Context

The single aggregate the domain functions take and return as `state`. Shows what lives in memory and
how it is rebuilt after hibernation. Does not cover persisted records (see `moderation/04`, `entry/04`).

## Diagram

```mermaid
classDiagram
  class HubState {
    +Map~SessionId, Session~ sessions
    +Map~String, SessionId~ pseudoIndex
    +Map~RoomId, Room~ rooms
    +Map~ConversationId, PrivateConversation~ conversations
    +Map~SessionId, IgnoreList~ ignores
    +Map~SessionId, FloodCounter~ flood
    +Map~String, EntryAttempts~ entryAttempts
    +Map~String, EntryAttempts~ codeRequests
  }
  class Session
  class Room
  class PrivateConversation
  class IgnoreList
  class FloodCounter
  class EntryAttempts {
    +String ip
    +Date[] recent
  }
  HubState *-- Session
  HubState *-- Room
  HubState *-- PrivateConversation
  HubState *-- IgnoreList
  HubState *-- FloodCounter
  HubState *-- EntryAttempts
```

## Rebuild after hibernation (Cloudflare)

| Part | Source on wake-up |
|---|---|
| Connected sessions, pseudo index, ignore lists, room memberships, linked account ids | WebSocket attachments (`getWebSockets()`) |
| Accounts, devices, pending codes, e-mail blocks, strike carry-overs | Account store in hub storage (never held whole in memory) |
| Away sessions | Away records in storage |
| Official rooms | Configuration |
| User rooms | Derived from members' attachments and away records |
| Private conversations | Derived from attachments (open windows) and away records |
| Flood counters, entry attempts, code requests | Reset, accepted (ADR-0011) |

## Notes

- Domain functions are pure: `(state, command, now, random) → (newState, effects)`. Effects are messages
  to send, records to persist, alarms to set.
- `pseudoIndex` enforces BR-002 across connected and away sessions.
