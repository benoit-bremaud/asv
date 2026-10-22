# Class diagram — accounts — accounts, devices, strikes, blocks

> **Feature**: accounts
> **Business rules**: BR-070 to BR-082
> **Related ADRs**: ADR-0012, ADR-0013, ADR-0014

## Context

Persisted account records and their ports. Does not cover sessions (see `entry`) or reports
(see `moderation`).

## Diagram

```mermaid
classDiagram
  class Account {
    +AccountId id
    +String email
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
    +String email
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
    +String email
    +String statement
    +Date createdAt
  }
  class AccountStore {
    <<interface>>
    +saveCode(code)
    +loadCode(sessionId) PendingCode
    +deleteCode(sessionId)
    +findAccountByEmail(email) Account
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
    +String email
    +Date createdAt
    +Date closedAt
  }
  class LegalVaultStore {
    <<interface>>
    +record(entry)
    +purgeExpired(now)
  }
  class Mailer {
    <<interface>>
    +sendCode(email, code)
    +sendStatementOfReasons(email, statement) Boolean
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
```

## Notes

- `EmailBlock` and `StrikeCarryOver` keep only an HMAC of the e-mail, never the address (BR-077, BR-080).
- A `PendingStatement` keeps the address only until the mailer accepts the statement of reasons, then
  is deleted, so the art. 17 notice is not lost if sending fails (retries for at most 7 days).
- `Session` gains optional `accountId` and `deviceTokenHash` (see `entry/04`).
- One port for all account records is enough: there is one SQLite store and one in-memory twin.
- `LegalVaultStore` is a separate write-only port (ADR-0014, brick 5): `record` and `purgeExpired`, no read
  operation. `deleteAccount` and `record` run in the same transaction (BR-081). `createdAt` is `verifiedAt`.
  `purgeExpired` drops `accountId` 1 year and the whole record 5 years after `closedAt`. The owner-only read
  is a dedicated hub call outside this port (BR-082).
