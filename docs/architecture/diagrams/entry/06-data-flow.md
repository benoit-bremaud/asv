# Data-flow diagram — entry — personal data at entry and while away

> **Feature**: entry
> **Related**: `docs/architecture/security-and-rgpd.md` §2, ADR-0011, ADR-0014

## Context

Personal data collected at entry and kept while away. Does not cover joining rooms, reports or bans
(see `rooms` and `moderation`).

## Diagram

```mermaid
flowchart LR
  Visitor(("Visitor"))
  Others(("Other chatters"))
  Authority(("Authority entitled by law"))
  subgraph asv ["asv hub"]
    Sess["Session in socket attachment"]
    Away[("Away records, 5 minutes max")]
    Logs[("Connection log and content lines")]
  end
  Client["Client sessionStorage"]
  Visitor -->|"PII: pseudo, gender, age, city, IP"| Sess
  Sess -->|"PII: IP, source port, protocol, pseudo, account id, times"| Logs
  Sess -->|"resume token"| Client
  Visitor -->|"PII: profile kept locally"| Client
  Sess -->|"PII: pseudo, colour, age, city"| Others
  Sess -.->|"PII: pseudo, rooms, buffered private messages"| Away
  Logs -.->|"PII: owner only, for an authority entitled by law, read logged (BR-082)"| Authority
```

## Notes

- Retention values: BR-060 is a legal duty (decree 2021-1362, checked 2026-10-22). BR-061 and BR-062 are owner
  decisions, no binding text sets them (GDPR art. 5(1)(e)).
- A content line (connection id, content id, date and time) is added to the log for every message (BR-060). It
  also carries the operation while a Prime Minister's injunction is in force. It never holds the content.
- Gender, age and city stay in memory and in the client, never on server disk.
