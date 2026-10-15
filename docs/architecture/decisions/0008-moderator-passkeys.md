# ADR-0008 — Moderators authenticate with passkeys

- Status: accepted
- Date: 2026-10-15
- Deciders: Benoît Bremaud

## Context

Moderators can read reports and expel chatters. V1 has no accounts (ADR-0005). The owner wants an
authentication that survives a change of hosting provider.

## Options and MCDA

Scores 0–5. Criteria: security 30, portability across hosts 25, simplicity 20, per-moderator
accountability 15, dev and test ease 10.

| Option | Security | Portability | Simplicity | Accountability | Dev/tests | Total /500 |
|---|---|---|---|---|---|---|
| **E. Passkeys (WebAuthn), one-time invitation** | 5 | 5 | 2 | 5 | 4 | **430** |
| D. One secret key per moderator, hashed in config | 3 | 5 | 4 | 4 | 5 | 405 |
| A. One shared secret key | 2 | 5 | 5 | 1 | 5 | 350 |
| B. Cloudflare Access in front of `/mod` | 5 | 1 | 4 | 5 | 2 | 350 |
| C. Moderator accounts with passwords | 3 | 5 | 1 | 5 | 4 | 350 |

- E: nothing to steal or phish, the server stores only public keys. SimpleWebAuthn runs on Node 22+
  and Cloudflare Workers ([SimpleWebAuthn](https://simplewebauthn.dev/)).
- D: fast to build, but a copied key gives full powers.
- B: Access disappears with Cloudflare, the auth would need rewriting on a host change. Free up to
  50 users ([Cloudflare blog](https://blog.cloudflare.com/teams-plans)).

Sensitivity: with simplicity 40 and security 10, D leads (425 vs 370).

## Decision

- The owner creates a one-time invitation for a named moderator (command-line script with an owner
  secret). The invitation expires after 24 hours.
- The moderator opens the invitation and registers a passkey. The server stores the moderator name,
  credential id and public key.
- To moderate, a chatter uses "Moderator sign-in" from the entry screen. A successful passkey
  assertion sets `Session.isModerator` and records the moderator name on the session.
- Passkey verification uses SimpleWebAuthn directly in `src/server`, which runs on both runtimes.
  Only storage is a port (`ModeratorStore`), so a hosting change only touches the storage adapter.
- On Cloudflare, the Worker runs the ceremonies and calls hub RPC methods for every storage access
  (ADR-0011). Registration and authentication challenges are kept by the hub for 5 minutes, single use.
- A successful sign-in returns a **moderator grant**: an HMAC-signed token (moderator name, expiry
  60 seconds, nonce) with a dedicated `GRANT_KEY` secret. The hub consumes the nonce at entry, so a
  grant cannot be replayed.
- Invitation tokens are stored hashed. Revoking a moderator deletes the credential. A moderator already
  signed in keeps the rights until the session closes.

## Consequences

- A lost device means a new invitation. The owner can revoke a moderator by deleting the credential.
- Each moderation action is attributable to a named moderator.
- Moderator credentials are persisted (names and public keys). Add them to the privacy notice.
