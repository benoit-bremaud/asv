# Sequence diagram — moderation — AI triage of a report

> **Feature**: moderation (brick 8c, #211)
> **Use cases**: UC9, UC12
> **Business rules**: BR-057, BR-100 to BR-102
> **Related ADRs**: ADR-0010, ADR-0019

## Context

How a stored report gets its category, urgency and summary from the EU AI provider, and how the queue
orders it. Does not cover filing limits (see 02a).

## Diagram

```mermaid
sequenceDiagram
  actor C as Reporter
  actor M as Moderator
  participant H as Hub
  participant D as Domain
  participant ST as Moderation store
  participant TR as ReportTriage (Mistral adapter)
  participant AI as Mistral API (EU)
  C->>H: report(target, reason, excerpt, context)
  H->>ST: save report (urgency unknown)
  H-->>C: reportSent
  H->>D: pseudonymise(report)
  D-->>H: labelled lines, e-mails and phones masked (BR-100)
  H-)TR: triage(reason, targetKind, lines)
  alt No key, daily cap reached
    TR-->>H: unavailable
  else Call
    TR->>AI: chat completion, JSON answer, 10 s timeout
    alt Valid answer (BR-101)
      AI-->>TR: category, urgency, summary
      TR-->>H: Triage
      H->>ST: saveTriage(reportId, triage)
    else Error, timeout or invalid
      TR-->>H: unavailable
    end
  end
  M->>H: listOpenReports()
  H->>ST: open reports
  ST-->>H: reports
  H->>D: sortForQueue(reports)
  D-->>H: high, medium, low, unknown, then oldest first (BR-102)
  H-->>M: openReports with "tri automatique, à vérifier"
```

## Notes

- Pseudonymisation is a pure domain function (no I/O), so it is unit-tested without the adapter.
- `unavailable` keeps the report as filed: urgency `unknown`, no summary. Nothing is retried.
- A triage arriving after the report closed is dropped (`saveTriage` ignores a closed report).
- The reported lines are untrusted input to the model: the closed schema is the only thing read back,
  and the summary is rendered as text only.
- The daily cap counter lives in hub memory and restarts at midnight UTC or on a restart.
