# Class diagram — platform — WebSocket protocol contract

> **Feature**: platform
> **Use cases**: all chat use cases
> **Related ADRs**: ADR-0007, ADR-0011

## Context

JSON messages exchanged over the single WebSocket, as a discriminated union on `type`. This is the
contract shared by client and server. Does not cover passkey ceremonies, which use HTTPS, or the
heartbeat, which is the raw text `ping` auto-answered `pong` (ADR-0011).

## Diagram

```mermaid
classDiagram
  class Envelope {
    +String type
    +Number seq
    +Object payload
  }
  class ClientMessage {
    <<union>>
    enter
    resume
    joinRoom
    leaveRoom
    createRoom
    postRoom
    sendPrivate
    ignore
    unignore
    search
    report
    listOpenReports
    warn
    expel
    closeReport
    removeRoom
    leave
  }
  class ServerMessage {
    <<union>>
    entered
    entryRefused
    resumed
    resumeRefused
    roomList
    roomJoined
    memberJoined
    memberLeft
    memberAway
    memberBack
    roomMessage
    privateWindow
    privateMessage
    ignoreUpdated
    searchResults
    reportSent
    openReports
    warned
    expelled
    roomClosed
    warning
    error
  }
  Envelope <|-- ClientMessage
  Envelope <|-- ServerMessage
```

## Payloads (one line each)

Client to server:

| Type | Payload |
|---|---|
| enter | pseudo, gender?, age, city?, adultConfirmed, termsAccepted, moderatorGrant? |
| resume | resumeToken, profile (gender?, age, city?) |
| joinRoom / leaveRoom | roomId |
| createRoom | name |
| postRoom | roomId, text |
| sendPrivate | targetPseudo, text |
| ignore / unignore | targetSessionId |
| search | query |
| report | targetKind, targetPseudo?, targetRoomId?, reason, excerpt, context (≤ 20 lines) |
| listOpenReports | — |
| warn | targetSessionId, text |
| expel | targetSessionId, duration (1h, 24h, 7d) |
| closeReport | reportId, outcome |
| removeRoom | roomId |
| leave | — |

Server to client:

| Type | Payload |
|---|---|
| entered | sessionId, resumeToken, roomList, isModerator |
| entryRefused | reason (rate, banned until, pseudo invalid, pseudo taken, age) |
| resumed | resumeToken, rooms, windows, buffered |
| resumeRefused | — |
| roomList | rooms (id, name, kind, count) |
| roomJoined | roomId, members (sessionId, pseudo, gender, age, city, away) |
| memberJoined / memberLeft / memberAway / memberBack | roomId?, sessionId, pseudo |
| roomMessage | roomId, authorSessionId, pseudo, gender, text, sentAt |
| privateWindow | conversationId, other (sessionId, pseudo, gender, away) |
| privateMessage | conversationId, authorSessionId, text, sentAt |
| ignoreUpdated | ignored (session ids) |
| searchResults | results (sessionId, pseudo, gender, age, city, rooms, away) |
| reportSent | reportId |
| openReports | reports (with triage) |
| warned | text |
| expelled | until |
| roomClosed | roomId |
| warning / error | code, message, replyTo (seq) |

## Notes

- Every incoming message is validated against its schema before reaching the domain.
- `seq` lets the client match `warning` and `error` to the command that caused them.
- `error` codes include `offline` (private message target gone), `forbidden`, `invalid`.
