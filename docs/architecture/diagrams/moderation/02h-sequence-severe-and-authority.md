# Sequence diagram — moderation — severe expel and authority alert

> **Feature**: moderation (brick 8c, #211)
> **Use cases**: UC11 severe variant, UC17
> **Business rules**: BR-055, BR-076 to BR-078, BR-081, BR-103 to BR-105
> **Related ADRs**: ADR-0012, ADR-0014

## Context

A moderator marks a case severe, asv deletes the account and bans at once, and the owner is alerted to
file with the authorities. Does not cover the three-strike path (see 02d).

## Diagram

```mermaid
sequenceDiagram
  actor M as Moderator
  actor O as Owner
  participant H as Hub
  participant D as Domain
  participant AS as Account store
  participant ST as Moderation store
  participant ML as Mailer
  participant T as Target sessions
  actor A as Authorities
  M->>H: expel(reportId, severe, alertAuthorities?)
  H->>ST: load report
  H->>D: severeExpel(state, report, account?, moderator, now)
  D-->>H: 7-day ban + sessions and away records + deletion if account
  H->>ST: save ban
  opt Target has an account
    H->>AS: blockEmail 6 months, deleteAccount + vault record (BR-081)
    H-)ML: statement of reasons (BR-076)
  end
  H-->>T: expelled(until) then close sockets
  opt alertAuthorities
    H->>ST: save AuthorityAlert(reportId, category, moderator, now, pending)
    H-)ML: owner alert to ASV_CONTACT_EMAIL, id and category only (BR-104)
  end
  H->>ST: close report severeDeleted
  H-->>M: reportClosed
  O->>A: file through the official channel (security-and-rgpd §6)
  O->>H: pnpm mod:filed reportId channel reference (owner secret, loopback)
  H->>ST: set alert filed with channel and reference
  H-->>O: 204
```

## Notes

- `alertAuthorities` is also accepted on `closeReport` for a non-severe outcome (BR-104), for example a
  threat by a chatter already gone.
- Write order as 02d: a failure before the deletion leaves the report open; after it, evictions and mails
  still happen and only the report close is retried (#212).
- The owner alert follows the statement-of-reasons retry (every 10 minutes, 7 days max).
- `/mod/authority-filings` answers 404 behind the tunnel (BR-097) like every `/mod` route.
