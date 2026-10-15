# Sequence diagram — chat-core — report and expel

> **Feature**: chat-core
> **Use cases**: UC9 Report, UC12 Review reports, UC11 Expel a chatter
> **Related ADRs**: ADR-0004, ADR-0005, ADR-0007

## Context

The DSA notice-and-action loop in its simplest form. Reports and bans are persisted through the
`ReportStore` port. Does not cover how a moderator authenticates (open question).

## Diagram

```mermaid
sequenceDiagram
  actor C as Reporter
  actor M as Moderator
  participant H as Hub
  participant D as Domain
  participant ST as Report store
  participant T as Target client
  participant O as Other members
  C->>H: report(target, reason, excerpt)
  H->>D: createReport(..., now)
  D-->>H: Report
  H->>ST: save report
  H-->>C: "Report sent"
  M->>H: listOpenReports()
  H->>D: authorize(session)
  alt Not a moderator
    D-->>H: Refused
    H-->>M: error
  else Moderator
    H->>ST: read open reports
    ST-->>H: reports
    H-->>M: reports
    M->>H: expel(target, duration)
    H->>D: expel(state, target, duration, now)
    D-->>H: Ban + session to close + rooms to notify
    H->>ST: save ban and close report
    H-->>T: "You have been expelled" then close socket
    H-->>O: "T left"
  end
```

## Notes

- Reports keep a short excerpt of the reported message as evidence. It is personal data with a
  limited retention period (to be defined in the privacy notice).
- A ban targets a keyed hash of the IP and the pseudo for a duration, because V1 has no accounts (ADR-0005).
- With a single hub, expel reaches the target's only socket directly (ADR-0007).
