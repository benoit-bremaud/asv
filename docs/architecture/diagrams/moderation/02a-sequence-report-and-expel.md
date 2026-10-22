# Sequence diagram — moderation — report, triage, expel

> **Feature**: moderation
> **Use cases**: UC9, UC12, UC11
> **Business rules**: BR-050 to BR-057
> **Related ADRs**: ADR-0007, ADR-0010

## Context

From a chatter's report to the expulsion of the target. Does not cover moderator sign-in (see 02c).

## Diagram

```mermaid
sequenceDiagram
  actor C as Reporter
  actor M as Moderator
  participant H as Hub
  participant D as Domain
  participant ST as Moderation store
  participant AI as Report triage
  participant LS as Connection log store
  participant T as Target client
  participant O as Other members
  C->>H: report(target, reason, excerpt, context)
  H->>D: createReport(state, sessionId, ..., now)
  alt Report limit exceeded
    D-->>H: Refused
    H-->>C: warning
  else Accepted
    D-->>H: Report
    H->>ST: save report
    H-->>C: reportSent
    H->>AI: triage(context with neutral labels)
    AI-->>H: category, urgency, summary or unavailable
    H->>ST: save triage on report
  end
  M->>H: listOpenReports()
  H->>D: authorize(session)
  alt No moderator rights
    D-->>H: Refused
    H-->>M: error
  else Moderator
    H->>ST: open reports by urgency
    ST-->>H: reports
    H-->>M: openReports
    M->>H: expel(target, duration)
    H->>D: expel(state, target, duration, moderator, now)
    D-->>H: Ban + session to close + rooms and windows to notify
    H->>ST: save ban
    H->>LS: close(target connection id, now)
    H-->>T: expelled(until) then close socket
    H-->>O: memberLeft(T)
    M->>H: closeReport(reportId, expelled)
    H->>ST: close report with outcome and moderator
  end
```

## Notes

- Triage is asynchronous: the reporter gets `reportSent` before the AI answers.
- The AI never sanctions (ADR-0010). Pseudos are replaced by neutral labels before triage.
- The connection line is closed only if the target is connected. An away target has no open line (closed on socket loss, `entry/02b`).
- The ban key is an HMAC of the IP with a server secret: pseudonymised, not anonymised.
