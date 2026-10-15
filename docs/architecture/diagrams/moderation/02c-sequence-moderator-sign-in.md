# Sequence diagram — moderation — moderator sign-in

> **Feature**: moderation
> **Use cases**: UC16, then UC1
> **Related ADRs**: ADR-0008, ADR-0011

## Context

How a moderator enters the chat with moderator rights. Does not cover enrolment (see 02b).

## Diagram

```mermaid
sequenceDiagram
  actor M as Moderator
  participant B as Browser and device
  participant WK as Worker
  participant H as Hub
  participant MS as Moderator store
  M->>B: Click "Moderator sign-in"
  B->>WK: GET authentication options
  WK->>H: rpc startAuthentication(now)
  H-->>WK: challenge, kept 5 min
  WK-->>B: authentication options
  B->>B: Sign challenge after fingerprint or PIN
  B->>WK: POST authentication response
  WK->>H: rpc credentialAndChallenge(credentialId)
  H->>MS: load moderator by credential
  H-->>WK: public key, sign count, challenge consumed
  WK->>WK: Verify signature and counter with SimpleWebAuthn
  alt Invalid or revoked
    WK-->>B: refused
  else Valid
    WK->>H: rpc updateSignCount(credentialId, count)
    WK->>WK: Sign grant(name, expiry 60 s, nonce) with GRANT_KEY
    WK-->>B: moderator grant
    B->>H: WebSocket upgrade then enter(form, grant)
    H->>H: Check grant signature, expiry, consume nonce
    H-->>B: entered(moderator)
  end
```

## Notes

- A grant is single use: the hub keeps consumed nonces until they expire.
- The moderator still goes through the normal entry rules (BR-001 to BR-008).
