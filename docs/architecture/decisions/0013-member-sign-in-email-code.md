# ADR-0013 — Members sign in with an e-mail code, device remembered 30 days

- Status: accepted, amended 2026-10-23 (Brevo, brasse-bouillon reuse, no enumeration)
- Date: 2026-10-16
- Deciders: Benoît Bremaud

## Context

Accounts exist for private messages (ADR-0012). A member must be able to sign in again the next evening.
The owner asked for the simplest, most reliable and compliant option, and wants no face or photo
involved. Clarification recorded: passkeys never send biometrics to the server, the device unlock
(PIN, pattern or biometrics) stays on the device.

## Options and MCDA — sign-in method

Scores 0–5. Owner criteria: simplicity for the member 35, reliability 35, compliance 30.

| Option | Simplicity | Reliability | Compliance | Total /500 |
|---|---|---|---|---|
| **D. E-mail verification, then device remembered 30 days** | 5 | 4 | 4 | **435** |
| C. Passkey after e-mail verification | 3 | 4 | 5 | 395 |
| A. E-mail verification at each session | 3 | 3 | 5 | 360 |
| B. Password | 4 | 3 | 3 | 335 |

Sensitivity: D minus C equals 2 × simplicity weight minus compliance weight, so C leads only when the
compliance weight exceeds twice the simplicity weight. The decision is robust. Passkeys remain a V2 option.

## Options and MCDA — how the e-mail is verified

The local review found that a link opened from a mail app often lands in the mail app's own browser,
so the device cookie and the chat session end up in different places, and that mail scanners may open
single-use links before the person does.

Same weights as above.

| Option | Simplicity | Reliability | Compliance | Total /500 |
|---|---|---|---|---|
| **Six-digit code typed in the chat** | 4 | 5 | 4 | **435** |
| Link with a confirm button and a return to the chat tab | 4 | 3 | 4 | 365 |

## Decision

- The member types their e-mail in the chat. asv e-mails a six-digit code valid 10 minutes, single use,
  stored as a keyed hash. Five wrong tries invalidate it.
- The member types the code in the chat. The first valid code creates the account.
- If the member chose to remember the device, the hub returns a single-use device claim valid 60 seconds
  with `accountLinked`. The chat tab posts it to `POST /account/device`, which sets the **device cookie**
  valid 30 days: random value, `HttpOnly`, `Secure`, `SameSite=Lax`. The server stores only its hash,
  and the session keeps that hash so it can sign this device out.
- A chatter entering with a valid device cookie is linked to the account automatically. A cookie pointing
  to a deleted account is ignored and cleared.
- "Sign out of this device" is `POST /account/sign-out` (clears the cookie and its record). "Sign out
  everywhere" and "delete my account" go over the WebSocket and delete every device record.

## Consequences

- The authentication cookie is exempt from consent (Loi Informatique et Libertés art. 82, CNIL
  deliberation 2020-091 art. 5, checked in brick 1 bis). It is explained in the privacy notice.
- Needs the same transactional e-mail provider as ADR-0012.
- Moderators keep passkeys (ADR-0008), which need stronger assurance.

## Amendment 2026-10-23 — Brevo, reuse of brasse-bouillon, same answer for blocked e-mails (brick 5)

- **Sign-in method confirmed.** The owner re-weighed a password against the e-mail code on 2026-10-23
  (issue #28): the e-mail code with no password stays (415/500 against 300).
- **Provider: Brevo**, through its HTTP API (`POST /v3/smtp/email`), EU-based, already used by the
  owner's brasse-bouillon project. Plain French text plus minimal HTML, no tracking. Secrets:
  `BREVO_API_KEY`, `ASV_MAIL_FROM`.
- **Reuse of brasse-bouillon** (`packages/api/src/mailer/`, `packages/api/src/auth/`, its ADR-0034):
  - the `Mailer` port is asv's `MailerService`: one method per message, sending never throws, a failure
    is logged with Brevo's allow-listed `{code, message}` only, never the address or the raw body;
  - without `BREVO_API_KEY` outside production the message is logged with the code, so the flow works
    in development; in production a missing key is logged as a send failure;
  - the code logic: six digits from a CSPRNG, single use, a capped number of tries, a constant-time
    comparison, a 60-second cooldown between two codes for the same e-mail, and per-e-mail and per-IP
    quotas. asv keeps a keyed hash (HMAC, BR-070) instead of brasse-bouillon's SHA-256, since six digits
    are cheap to brute-force from a plain hash.
- **Same answer, no enumeration.** Criteria: no information leak about an address 35, clarity 25, abuse
  resistance 25, simplicity 15.

  | Option | No leak | Clarity | Abuse | Simplicity | Total /500 |
  |---|---|---|---|---|---|
  | **A. Blocked e-mail, per-e-mail quota or cooldown → the same `codeSent`, no mail sent; disposable domain and per-IP quota refused with a reason** | 5 | 3 | 4 | 4 | **410** |
  | C. Same answer, plus an explanatory mail to the address | 5 | 4 | 3 | 3 | 395 |
  | B. Explicit reasons for every refusal | 2 | 5 | 3 | 5 | 345 |

  The owner chose A. C would let anyone flood a victim's mailbox. A disposable domain or an IP quota says
  nothing about a given address, so they keep an explicit reason.
- **Encryption at rest** of every stored e-mail: ADR-0017.
