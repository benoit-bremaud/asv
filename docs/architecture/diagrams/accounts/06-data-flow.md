# Data-flow diagram — accounts — e-mail and sanctions

> **Feature**: accounts
> **Related**: `docs/architecture/security-and-rgpd.md` §2, ADR-0012, ADR-0013

## Context

Where e-mail addresses and account data go. Does not cover reports (see `moderation`).

## Diagram

```mermaid
flowchart LR
  Chatter(("Chatter"))
  Mod(("Moderator"))
  MailProvider(("E-mail provider, processor"))
  Authority(("Authorities"))
  subgraph asv ["asv hub"]
    Acc[("Accounts: e-mail, strikes")]
    Dev[("Device records: token hashes")]
    Blocks[("E-mail blocks: keyed hashes")]
  end
  Browser["Browser cookie: device token"]
  Chatter -->|"PII: e-mail"| Acc
  Acc -->|"PII: e-mail, six-digit code"| MailProvider
  Acc -->|"device token, set once at redeem"| Browser
  Mod -->|"strike, suspension"| Acc
  Acc -->|"PII: e-mail, statement of reasons"| MailProvider
  Acc -.->|"PII, pseudonymised: keyed e-mail hash on deletion"| Blocks
  Acc -.->|"PII: on life or safety threat (DSA art. 18) or judicial requisition, to confirm"| Authority
```

## Notes

- Other chatters never see the e-mail.
- Retention values are proposals until the brick 1 bis legal check (BR-078, BR-079). The 7-day block of BR-077 is an owner decision.
