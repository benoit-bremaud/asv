# Business rules — asv

Numbered rules enforced by the domain (`src/domain`). Values are V1 defaults, tunable in one place.

## Entry and identity

| Rule | Description | Validation |
|---|---|---|
| BR-001 | A pseudo has 3 to 20 characters among letters, digits, `_`, `-`, `.`. | Refused otherwise. |
| BR-002 | A pseudo is unique among connected and away sessions, case insensitive. | Refused if taken. |
| BR-003 | Pseudos containing reserved words (`admin`, `modo`, `moderateur`, `asv`) are refused. | Refused. |
| BR-004 | The visitor must tick "I am 18 or older" and declare an age between 18 and 99. | Refused otherwise. |
| BR-005 | Gender is optional: woman, man or unspecified (default). | — |
| BR-006 | City is optional free text, 0 to 40 characters, trimmed. | Truncated input refused. |
| BR-007 | At most 5 entry attempts per IP per minute. | Further attempts refused for 1 minute. |
| BR-008 | An IP or pseudo under an active ban cannot enter. | Refused with ban end time. |

## Session and reconnection (ADR-0009, ADR-0011)

Values are owned here. Rationale lives in the ADRs.

| Rule | Description |
|---|---|
| BR-010 | The client sends a heartbeat every 25 s. No heartbeat for 60 s means disconnected. |
| BR-011 | A disconnected session becomes Away for at most 5 minutes. |
| BR-012 | An away session keeps its pseudo, rooms and private windows, and shows "away" to others. |
| BR-013 | Up to 50 private messages are buffered for an away session, oldest dropped first. |
| BR-014 | Resuming requires the current resume token. The token rotates at each resume. |
| BR-015 | After 5 minutes away, the session closes as if the chatter had left. |

## Rooms

| Rule | Description |
|---|---|
| BR-020 | A message has 1 to 500 characters after trimming. |
| BR-021 | Flood limit: at most 5 messages per 10 seconds per session, across rooms and DMs. |
| BR-022 | Smiley codes (for example `:)`, `:caramel:`) render from a fixed whitelist. Text is never rendered as HTML. |
| BR-023 | A room holds at most 50 members. |
| BR-030 | A user room name has 3 to 30 characters and follows BR-003. |
| BR-031 | A session can own at most one user room at a time. Ownership ends when the owner leaves the room, which then has no owner until it is deleted. |
| BR-032 | A user room is deleted when its last member leaves or closes. |
| BR-033 | Official rooms (themed, regional) are defined in configuration and never deleted. |
| BR-034 | A newcomer sees only messages posted after joining. No history. |

## Private conversations and ignore

| Rule | Description |
|---|---|
| BR-040 | A chatter linked to an account can open a private window with any connected or away chatter also linked to an account (ADR-0012). |
| BR-041 | If the target ignores the sender, the sender's window opens and messages are silently dropped. |
| BR-042 | Ignore lasts for the session and covers room messages and private messages both ways. |
| BR-043 | A chatter can hold at most 10 private windows at once. |

## Moderation

| Rule | Description |
|---|---|
| BR-050 | Report reasons: harassment, seems minor, spam, illegal content, other. |
| BR-051 | A report stores the reason, an excerpt of at most 500 characters, up to 20 context lines the reporter saw, author and target pseudos. |
| BR-052 | A chatter can file at most 5 reports per 10 minutes. |
| BR-053 | Ban durations: 1 hour, 24 hours, 7 days. A ban targets a keyed IP hash and the pseudo. |
| BR-054 | Only a session with `isModerator` can list reports, close reports or expel. |
| BR-055 | Every moderation action records the moderator name and time. |
| BR-056 | A moderator invitation is single use and expires after 24 hours. |
| BR-057 | A report is closed with one outcome: no action, warned, expelled, suspended, severe deletion, room removed. The AI triage never closes a report (ADR-0010). |

## Accounts and strikes (ADR-0012, ADR-0013, ADR-0014)

| Rule | Description |
|---|---|
| BR-070 | A sign-in code has six digits, is single use, valid 10 minutes, stored as a keyed hash, and invalidated after 5 wrong tries. |
| BR-071 | E-mail addresses from known disposable domains are refused (maintained list). |
| BR-072 | At most 3 sign-in codes per e-mail and 10 per IP per hour. |
| BR-073 | A remembered device gets a random token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie valid 30 days, set over HTTPS in exchange for a single-use device claim valid 60 seconds. The server keeps only hashes. |
| BR-074 | A warning on a chatter with an account adds a strike. A strike expires after 90 days. |
| BR-075 | While an account has 3 or more active strikes and no decision, the moderator panel proposes a 7-day suspension. Without confirmation, nothing happens. |
| BR-076 | Every suspension or deletion decided by a moderator e-mails a statement of reasons (DSA art. 17). The address is kept only until the mail is accepted, retried for at most 7 days. |
| BR-077 | A suspension deletes the account, blocks a keyed hash of its e-mail for 7 days, closes every session and away record of the account, and bans for 7 days the keyed IP hash and pseudo captured on the report (or of the live session when newer). |
| BR-078 | Severe cases (grooming, threats, child sexual abuse material, incitement to violence) delete the account at once and block the e-mail hash for 6 months (owner proposal, no binding text). The owner promptly informs the authorities of offences listed in LCEN art. 6 IV-A and of any threat to life or safety (DSA art. 18). |
| BR-079 | An account unused for 2 years is deleted after an e-mail notice (owner proposal, GDPR art. 5(1)(e)). |
| BR-080 | A member may delete their account at any time. If strikes are active, a keyed e-mail hash and the strike expiry dates are kept until the last one expires, and restored if the same e-mail creates a new account. |
| BR-081 | Every account deletion writes, in the same transaction, a legal retention record to the vault: account id, e-mail, creation (= verification) and closing dates. The account id is purged 1 year and the rest 5 years after closing (decree 2021-1362 arts. 2 and 3, ADR-0014). Session pseudonyms stay only in the connection log (BR-060). Never a deletion reason, strike or report. |
| BR-082 | Only the owner reads the vault and the connection log, to answer an authority entitled by law. Each read appends an access entry: date, request reference, legal basis, ids returned. No use case, moderation tool or AI reads them. |

## Retention (legal basis in security-and-rgpd.md §1–2)

| Rule | Description |
|---|---|
| BR-060 | One connection line per session: random connection id, IP and source port if available, protocol, pseudo, account id if any, start and end times (decree 2021-1362 arts. 5 and 7). While a Prime Minister's injunction under CPCE L34-1 III is in force (checked each October), one content line per creation, change or deletion: connection id, content id, operation, date and time (art. 6). Never the content. Each line kept 1 year, then deleted (LCEN art. 6 V-A). |
| BR-061 | Closed reports are kept 6 months, then deleted. |
| BR-062 | Expired bans are deleted 30 days after their end. |
