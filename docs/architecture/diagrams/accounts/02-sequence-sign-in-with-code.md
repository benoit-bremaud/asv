# Sequence diagram — accounts — sign in with an e-mail code

> **Feature**: accounts
> **Use cases**: UC17
> **Business rules**: BR-070 to BR-073, BR-077, BR-080
> **Related ADRs**: ADR-0011, ADR-0013

## Context

From typing an e-mail to a session linked to a verified account, all in the chat tab. Does not cover the
automatic link at entry with an existing device cookie (see `entry/02a`).

## Diagram

```mermaid
sequenceDiagram
  actor C as Chatter
  participant W as Web client
  participant WK as Worker
  participant H as Hub
  participant D as Domain
  participant AS as Account store
  participant ML as Mailer
  C->>W: Type e-mail, choose remember device
  W->>H: requestCode(email, remember)
  H->>AS: isBlocked(emailKeyedHash, now)
  H->>D: requestCode(state, sessionId, email, ip, blocked, now, random)
  alt Refused (disposable, blocked, rate)
    D-->>H: Refusal
    H-->>W: warning(reason)
  else Accepted
    D-->>H: Code, expires in 10 min
    H->>AS: save keyed code hash for this session
    H->>ML: send code e-mail
    H-->>W: codeSent
  end
  C->>W: Type the six digits
  W->>H: verifyCode(code)
  H->>AS: load pending code, account and strike record for this e-mail
  H->>AS: isBlocked(emailKeyedHash, now)
  H->>D: verifyCode(state, sessionId, pending, account, blocked, now, random)
  alt Wrong, expired or blocked
    D-->>H: Refused + tries left
    H->>AS: update tries or delete code
    H-->>W: warning(reason)
  else Valid
    D-->>H: createAccount or linkExisting + device claim if remember
    H->>AS: persist account, delete code
    H-->>W: accountLinked(accountId, deviceClaim)
    W->>WK: POST /account/device with claim
    WK->>H: rpc redeemDeviceClaim(claim, now)
    H->>AS: save device record hash
    H-->>WK: device token
    WK-->>W: Set-Cookie device token, 30 days
  end
```

## Notes

- The domain decides creation, linking and refusals. The store only persists (dependency rule).
- Codes, claims and device tokens are stored as hashes. A device claim is single use and valid 60 seconds.
- The session keeps the device token hash in its socket attachment so UC18 can sign this device out.
- The e-mail address is never shown to other chatters.
