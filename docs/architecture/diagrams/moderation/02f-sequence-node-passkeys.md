# Sequence diagram — moderation — passkeys on the Node transport (brick 8b)

> **Feature**: moderation (brick 8b, issue #210)
> **Use cases**: UC14, UC15, UC16, then UC1
> **Business rules**: BR-054, BR-055, BR-056, BR-093 to BR-099
> **Related ADRs**: ADR-0008, ADR-0017, ADR-0018

## Context

How the Node transport realises 02b and 02c before any Cloudflare deployment. The Hono app of
`src/server/app.ts` runs the ceremonies with SimpleWebAuthn and calls the in-memory hub directly, so each
`rpc` of 02b and 02c is a plain method call. The routes reach the moderator store only through the
moderator operations of `hub-moderators.ts` (`platform/04c`), never directly; the grant check at entry
stays in the hub. Moderators and invitations live in an encrypted file (owner
choice A, 425/500, 2026-11-13); the owner creates an invitation with a script calling an HTTP route
guarded by an owner secret and limited to loopback (choice A, 440/500). Replaces the interim token of 02e.

## Diagram

```mermaid
sequenceDiagram
  actor OW as Owner
  participant CLI as pnpm mod:invite
  participant R as Hono /mod routes
  participant O as Moderator ops
  participant MS as File moderator store
  participant H as Hub
  actor M as Moderator
  participant B as Browser and device
  OW->>CLI: invite "Marc"
  CLI->>R: POST /mod/invitations {name}, Bearer owner secret
  R->>R: Loopback peer, no tunnel, constant-time secret (BR-093)
  R->>O: createInvitation(name, token, now)
  O->>MS: save SHA-256 of token, expires in 24 h (BR-056)
  R-->>CLI: link ASV_PUBLIC_ORIGIN + fragment mod/enroll/token (BR-098)
  OW-->>M: Send the link
  M->>B: Open the link, "créer ma clé"
  B->>R: POST /mod/enroll/options {token}
  R->>O: io.invitedName(token, now)
  O->>MS: findInvitation(tokenHash, now), not consumed
  R->>O: keepChallenge(challenge, register with token)
  R-->>B: options (rpId, user = name, resident key and UV required, challenge kept 5 min)
  B->>B: Create passkey after device unlock
  B->>R: POST /mod/enroll {token, response}
  R->>O: takeChallenge(challenge, register with token), consumed
  R->>R: Verify with SimpleWebAuthn, expected origin and RP ID from config, UV required
  R->>O: io.enroll(token, credentialId, publicKey, count)
  O->>MS: enrollModerator: consume invitation and save encrypted in one write, replacing an older credential of that name
  R-->>B: enrolled
  M->>B: Entry screen, "connexion modérateur"
  B->>R: POST /mod/sign-in/options
  R->>O: keepChallenge(challenge, authenticate)
  R-->>B: options (empty allow-list, UV required, challenge kept 5 min)
  B->>B: Sign challenge after device unlock
  B->>R: POST /mod/sign-in {response}
  R->>O: takeChallenge(challenge, authenticate), consumed
  R->>O: io.byCredential(credentialId)
  O->>MS: findByCredential
  R->>R: Verify signature, counter and UV
  alt Unknown, revoked, invalid or counter replay
    R-->>B: 401, notice "clé refusée"
  else Valid
    R->>O: io.updateSignCount(credentialId, count)
    R-->>B: grant = HMAC(name, expiry 60 s, nonce) under the start-up key (BR-095)
    B->>H: enter(pseudo, profile, moderatorGrant = grant)
    H->>H: Check HMAC, expiry, unused nonce, then entry rules (BR-001 to BR-008)
    alt Entry accepted
      H->>H: Consume nonce
      H-->>B: entered(isModerator = true, moderatorName)
    else Entry refused
      H-->>B: entryRefused(reason), grant still usable until expiry
    end
  end
```

## Notes

- Every `/mod/*` route answers 404 when the transport runs with `ASV_TUNNEL=1`, so testers never reach
  them before brick 8c (`01-use-case`, brick 8a scope).
- The enrolment link carries the token in the fragment, so it never reaches a server log nor a
  `Referer`; the page posts it in the body.
- The revocation script `pnpm mod:revoke <name>` calls `DELETE /mod/moderators/<name>` with the same
  guard and deletes the credential and the pending invitations of that name (BR-094). A session already signed in keeps its rights until it closes (ADR-0008).
- A wrong grant, an expired grant or a replayed nonce answers `entryRefused(notModerator)` with no
  session, like 02e; the rate rule of BR-091 moves to BR-096.
- The client reads the token from the fragment, then removes it from the address bar
  (`history.replaceState`) before any network call.
- The challenge taken back is the one the browser signed, read from `clientDataJSON`.
- `GET /mod/status` answers 200 outside the tunnel; the entry screen shows the link only then (BR-097).
- Actions record the moderator name, never `owner` (BR-055).
