# Data-flow diagram — accounts — e-mail and sanctions

> **Feature**: accounts
> **Related**: `docs/architecture/security-and-rgpd.md` §2, ADR-0012, ADR-0013, ADR-0014

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
    Vault[("Legal vault, sealed: e-mail, dates, pseudonyms")]
  end
  Browser["Browser cookie: device token"]
  Chatter -->|"PII: e-mail"| Acc
  Acc -->|"PII: e-mail, six-digit code"| MailProvider
  Acc -->|"device token, set once at redeem"| Browser
  Mod -->|"strike, suspension"| Acc
  Acc -->|"PII: e-mail, statement of reasons"| MailProvider
  Acc -.->|"PII, pseudonymised: keyed e-mail hash on deletion"| Blocks
  Acc -.->|"PII: on deletion, legal retention record (BR-081)"| Vault
  Vault -.->|"PII: only on judicial requisition, read logged (BR-082)"| Authority
  Acc -.->|"PII: suspected offence or life or safety threat (LCEN art. 6 IV, DSA art. 18)"| Authority
```

## Notes

- Other chatters never see the e-mail.
- The vault keeps the e-mail 5 years and the pseudonyms 1 year after closing (decree 2021-1362, ADR-0014).
  No domain use case reads it.
- BR-078 and BR-079 durations and the 7-day block of BR-077 are owner decisions: no binding text sets them.
