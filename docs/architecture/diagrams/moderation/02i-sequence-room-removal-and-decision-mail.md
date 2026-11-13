# Sequence diagram — moderation — room removal and reporter decision e-mail

> **Feature**: moderation (brick 8c, #211)
> **Use cases**: UC11 room variant, UC12
> **Business rules**: BR-057, BR-106, BR-107

## Context

Removing a reported user room, and telling a member reporter the decision on any closed report.

## Diagram

```mermaid
sequenceDiagram
  actor M as Moderator
  participant H as Hub
  participant D as Domain
  participant ST as Moderation store
  participant AS as Account store
  participant ML as Mailer
  participant R as Room members
  M->>H: removeRoom(reportId)
  H->>ST: load report (targetRoomId)
  H->>D: removeRoom(state, roomId, moderator, now)
  alt Official room or room gone
    D-->>H: Refused
    H-->>M: warning(reportInvalid)
  else User room
    D-->>H: new state + members to notify
    H-->>R: roomClosed(roomId)
    H->>ST: close report roomRemoved
    H-->>M: reportClosed
  end
  Note over H,ML: After any report close (all outcomes)
  opt Report has reporterAccountId and the account exists
    H->>AS: read reporter e-mail
    H-)ML: decision e-mail, general terms, automated means used or not (BR-107)
  end
```

## Notes

- The decision e-mail never names the target or the sanction; it says "mesure prise" or "aucune mesure",
  whether AI triage ranked the report, and how to contest by replying to the contact address.
- The pending mail keeps the address encrypted until accepted, 7 days max, like BR-076.
- Removing a room does not sanction its creator; the moderator can expel on another report.
