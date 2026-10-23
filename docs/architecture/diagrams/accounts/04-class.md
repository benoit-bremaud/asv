# Class diagram — accounts — accounts, devices, strikes, blocks

> **Feature**: accounts
> **Business rules**: BR-070 to BR-082
> **Related ADRs**: ADR-0012, ADR-0013, ADR-0014, ADR-0017

## Context

Persisted account records and their ports. Does not cover sessions (see `entry`) or reports
(see `moderation`).

## Diagram

```mermaid
classDiagram
  class Account {
    +AccountId id
    +String email «encrypted»
    +String emailKeyedHash
    +Date verifiedAt
    +Date lastSeenAt
    +Strike[] strikes
    +activeStrikes(now) Number
  }
  class Strike {
    +ReportId reportId
    +String moderatorName
    +Date givenAt
    +Date expiresAt
  }
  class DeviceRecord {
    +String tokenHash
    +AccountId accountId
    +Date expiresAt
  }
  class PendingCode {
    +String codeHash
    +String email «encrypted»
    +String emailKeyedHash
    +String ipKeyedHash
    +SessionId sessionId
    +Boolean remember
    +Number triesLeft
    +Date expiresAt
  }
  class EmailBlock {
    +String emailKeyedHash
    +Date until
    +BlockReason reason
  }
  class BlockReason {
    <<enumeration>>
    suspension
    severe
  }
  class StrikeCarryOver {
    +String emailKeyedHash
    +Date[] strikeExpiries
  }
  class PendingStatement {
    +String id
    +String email «encrypted»
    +String statement «encrypted»
    +Date createdAt
  }
  class AccountStore {
    <<interface>>
    +saveCode(code)
    +loadCode(sessionId) PendingCode
    +deleteCode(sessionId)
    +findAccountByEmailHash(emailKeyedHash) Account
    +recordCodeIssued(emailKeyedHash, ipKeyedHash, at)
    +recordWrongTry(emailKeyedHash, at)
    +codeCounts(emailKeyedHash, ipKeyedHash, now) CodeCounts
    +saveAccount(account)
    +findAccountById(accountId) Account
    +deleteAccount(accountId)
    +saveDevice(device)
    +accountForDevice(tokenHash, now) Account
    +deleteDevice(tokenHash)
    +deleteAllDevices(accountId)
    +blockEmail(block)
    +isBlocked(emailKeyedHash, now) Boolean
    +saveCarryOver(record)
    +loadCarryOver(emailKeyedHash) StrikeCarryOver
    +deleteCarryOver(emailKeyedHash)
    +savePendingStatement(statement)
    +pendingStatements() PendingStatement[]
    +deletePendingStatement(id)
    +purgeExpired(now)
  }
  class VaultRecord {
    +AccountId accountId
    +String email «sealed to owner key»
    +Date createdAt
    +Date closedAt
  }
  class AccessEntry {
    +Date at
    +String requestReference
    +String legalBasis
    +String[] idsReturned «sealed to owner key»
  }
  class LegalVaultStore {
    <<interface>>
    +record(entry)
    +purgeExpired(now)
  }
  class Mailer {
    <<interface>>
    +sendCode(email, code) Promise~void~
    +sendStatementOfReasons(email, statement) Promise~Boolean~
  }
  class FieldCipher {
    <<interface>>
    +encrypt(value, context) String
    +decrypt(sealed, context) String
    +keyedHash(value) String
  }
  Account *-- Strike
  DeviceRecord --> Account
  EmailBlock --> BlockReason
  AccountStore ..> Account
  AccountStore ..> DeviceRecord
  AccountStore ..> PendingCode
  AccountStore ..> EmailBlock
  AccountStore ..> StrikeCarryOver
  AccountStore ..> PendingStatement
  LegalVaultStore ..> VaultRecord
  LegalVaultStore ..> AccessEntry
```

## Notes

- «encrypted» fields go through `FieldCipher` (AES-256-GCM, versioned data keys) in the hub before they
  reach a store; «sealed to owner key» fields are encrypted to the owner public key and the application
  cannot read them back (ADR-0017, BR-083). Ids, dates and counters stay clear.
- `Mailer` is the brasse-bouillon `MailerService` port (ADR-0013 amendment): it never throws for
  `sendCode`; `sendStatementOfReasons` returns whether Brevo accepted the mail (BR-076 retries).
- `FieldCipher` lives in `src/server/crypto/` (WebCrypto), not in the domain: the domain never sees
  ciphertext or keys. It is drawn here because the stores receive its output.

- `EmailBlock` and `StrikeCarryOver` keep only an HMAC of the e-mail, never the address (BR-077, BR-080).
- A `PendingStatement` keeps the address only until the mailer accepts the statement of reasons, then
  is deleted, so the art. 17 notice is not lost if sending fails (retries for at most 7 days).
- `Session` gains optional `accountId` and `deviceTokenHash` (see `entry/04`).
- One port for all account records is enough: there is one SQLite store and one in-memory twin.
- `LegalVaultStore` is a separate write-only port (ADR-0014, brick 5): `record` and `purgeExpired`, no read
  operation. `record` runs first and `deleteAccount` only after it succeeds; brick 9 wraps both in one storage transaction (BR-081). `createdAt` is `verifiedAt`.
  `purgeExpired` drops `accountId` 1 year and the whole record 5 years after `closedAt`, and also purges access
  entries older than 5 years. Each owner read appends an `AccessEntry` (BR-082). The owner-only read
  is a dedicated hub call outside this port (BR-082).
