# Sequence diagram — moderation — invite and enroll a moderator

> **Feature**: moderation
> **Use cases**: UC14, UC15
> **Business rules**: BR-056
> **Related ADRs**: ADR-0008, ADR-0011

## Context

Passkey registration through a one-time invitation. The Worker runs the ceremony, the hub holds every
piece of state. Does not cover sign-in (see 02c).

## Diagram

```mermaid
sequenceDiagram
  actor OW as Owner
  participant CLI as Invitation script
  participant WK as Worker
  participant H as Hub
  participant MS as Moderator store
  actor I as Invited person
  participant B as Browser and device
  OW->>CLI: invite "Marc" with owner secret
  CLI->>WK: POST /mod/invitations
  WK->>WK: Check owner secret
  WK->>H: rpc createInvitation(name, now)
  H->>MS: save hashed invitation, expires in 24 h
  H-->>WK: one-time token
  WK-->>CLI: one-time link
  OW-->>I: Send the link
  I->>B: Open the link
  B->>WK: GET registration options(token)
  WK->>H: rpc startRegistration(token, now)
  H->>MS: check invitation unused and valid
  H-->>WK: challenge, kept 5 min
  WK-->>B: registration options
  B->>B: Create passkey after fingerprint or PIN
  B->>WK: POST registration response
  WK->>H: rpc challengeFor(token)
  H-->>WK: challenge, consumed
  WK->>WK: Verify response with SimpleWebAuthn
  WK->>H: rpc saveModerator(name, credentialId, publicKey, token)
  H->>MS: save moderator, consume invitation
  WK-->>B: "You are a moderator"
```

## Notes

- Passkey ceremonies use HTTPS routes, not the chat WebSocket.
- On Node, `rpc` calls are plain method calls on the in-memory hub.
