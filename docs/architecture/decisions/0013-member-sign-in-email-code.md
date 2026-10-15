# ADR-0013 — Members sign in with an e-mail code, device remembered 30 days

- Status: accepted
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

- An authentication cookie is expected to be strictly necessary and exempt from consent, to confirm in
  the brick 1 bis legal check.
- Needs the same transactional e-mail provider as ADR-0012.
- Moderators keep passkeys (ADR-0008), which need stronger assurance.
