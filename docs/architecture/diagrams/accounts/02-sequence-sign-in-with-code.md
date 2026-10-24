# Sequence diagram — accounts — sign in with an e-mail code

> **Feature**: accounts
> **Use cases**: UC17
> **Business rules**: BR-070 to BR-073, BR-077, BR-080, BR-083
> **Related ADRs**: ADR-0011, ADR-0013, ADR-0017

## Context

From typing an e-mail to a session linked to a verified account, all in the chat tab. Does not cover the
automatic link at entry with an existing device cookie (see `entry/02a`).

## Diagram

```mermaid
sequenceDiagram
  actor C as Chatter
  participant W as Web client
  participant WK as Worker or Node HTTP
  participant H as Hub
  participant D as Domain
  participant K as Crypto (cipher, keyed hash)
  participant AS as Account store
  participant ML as Mailer (Brevo)
  C->>W: Type e-mail, choose remember device
  W->>H: requestCode(email, remember)
  H->>K: emailKeyedHash(normalised email)
  H->>AS: isBlocked(hash, now), codeCounts(hash, ip, now): codes in 1 h, last code, wrong tries in 24 h
  H->>D: requestCode(state, sessionId, email, ip, checks, now, random)
  alt Disposable domain or IP quota
    D-->>H: Refused(reason)
    H-->>W: warning(reason)
  else Blocked, e-mail quota, cooldown or 20 wrong tries in 24 h (silent)
    D-->>H: Silent
    H-->>W: codeSent
  else Accepted
    D-->>H: Code, expires in 10 min
    H->>K: keyed code hash, encrypt e-mail
    H->>AS: saveCode(pending code for this session)
    H-->>W: codeSent
    H-)ML: sendCode(email, code), never throws
  end
  C->>W: Type the six digits
  W->>H: verifyCode(code)
  H->>AS: loadCode(sessionId), findAccountByEmailHash, loadCarryOver, isBlocked
  H->>D: verifyCode(state, sessionId, pending, codeMatches, account, carryOver, blocked, now, random)
  alt Wrong, expired or blocked
    D-->>H: Refused + tries left
    H->>AS: update tries or delete code, recordWrongTry(hash, now) on a wrong code
    H-->>W: warning(reason)
  else Valid
    D-->>H: createAccount or linkExisting + device claim if remember
    H->>AS: persist account (e-mail encrypted), delete code and carry-over
    H-->>W: accountLinked(accountId, deviceClaim)
    Note over H: memberBack(hasAccount true) to the room peers (BR-040)
    W->>WK: POST /account/device with claim
    WK->>H: redeemDeviceClaim(claim, now)
    H->>AS: save device record hash
    H->>H: set deviceTokenHash on the session
    H-->>WK: device token
    WK-->>W: Set-Cookie device token, 30 days
  end
```

## Notes

- The domain decides creation, linking, refusals and the silent answer. The hub computes hashes,
  compares the code in constant time (`codeMatches`) and passes plain booleans; the store only persists
  (dependency rule).
- The mail is sent after `codeSent` is queued, so the response time does not depend on the provider.
  A send failure is logged without the address (ADR-0013 amendment); the chatter can ask for a new code
  after the cooldown.
- Codes, claims and device tokens are stored as hashes. A device claim is single use and valid 60 seconds.
- Stored e-mails are encrypted with the field cipher and looked up by keyed hash (ADR-0017, BR-083).
- The session keeps the device token hash so UC18 can sign this device out.
- The e-mail address is never shown to other chatters.
