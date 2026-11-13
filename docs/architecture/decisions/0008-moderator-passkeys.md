# ADR-0008 — Moderators authenticate with passkeys

- Status: accepted
- Date: 2026-10-15
- Deciders: Benoît Bremaud

## Context

Moderators can read reports and expel chatters. V1 has no member passwords: member accounts exist only for private messages, signed in by an e-mail
code (ADR-0012, ADR-0013). Moderators need stronger assurance. The owner wants an
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

## Addendum 2026-11-13 — Node transport first (brick 8b, #210)

Before any Cloudflare deployment, the Node transport realises the decision (`moderation/02f`): the
Hono app runs the ceremonies and calls the in-memory hub directly; moderators live in an encrypted file
(MCDA 425/500 against SQLite 355 and memory 310); the invitation script calls a loopback-only route
guarded by `ASV_OWNER_SECRET` (440/500 against writing the file 295 and a panel button 290); the
moderator panel is the entry-screen link, the enrolment page and the 8a queue (425/500 against a `/mod`
page 320 and an in-chat panel 340). On Node the grant key is drawn at start and never stored (KISS: one process, 60-second grants), which
replaces `GRANT_KEY` until the Cloudflare transport. Rules: BR-093 to BR-099.

| Choice (weights) | Options, scores 0–5 per criterion, total /500 |
|---|---|
| Store (durability 35, security 25, simplicity 25, consistency 15) | **encrypted file** 5/4/3/5 = 425 · SQLite 5/4/2/2 = 355 · memory 0/5/5/4 = 310 |
| Invitation (security 35, simplicity 30, portability 20, ADR fit 15) | **script → loopback route + owner secret** 5/3/5/5 = 440 · script writes the file 3/4/2/2 = 295 · panel button 3/3/4/1 = 290 |
| Panel (simplicity 35, retro fit 25, usefulness 25, security 15) | **entry link + enrolment page + 8a queue** 4/5/4/4 = 425 · in-chat panel 2/4/5/3 = 340 · `/mod` page 2/3/4/5 = 320 |
