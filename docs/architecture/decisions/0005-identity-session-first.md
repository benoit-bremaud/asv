# ADR-0005 — Session pseudo in V1, accounts planned for V2

- Status: accepted, partially superseded by [ADR-0012](0012-accounts-for-private-messages-and-strikes.md)
  (accounts arrive in V1 for private messages)
- Date: 2026-10-15
- Deciders: Benoît Bremaud

## Context

Caramail had accounts with several saved aliases. asv wants minimal friction and minimal personal
data. French hosting law (LCEN, decree 2021-1362) requires hosts to keep connection data
identifying content authors for one year
([Dalloz, decree 2021-1362](https://www.dalloz-actualite.fr/document/decr-n-2021-1362-20-oct-2021-jo-21-oct)).
Verified on Légifrance in brick 1 bis, see Consequences. So "store nothing" is not an option, even without accounts.

## Options and MCDA

Scores 0–5. Criteria: V1 simplicity 30, personal data minimised 25, anti-impersonation and effective
bans 20, finding regulars again 15, evolvability 10.

| Option | Simplicity | Minimised | Anti-impersonation | Regulars | Evolvability | Total /500 |
|---|---|---|---|---|---|---|
| **C. Session pseudo now, accounts in V2** | 5 | 5 | 1 | 3 | 5 | **390** |
| D. Pseudo reserved by magic link | 3 | 3 | 4 | 4 | 4 | 345 |
| B. Accounts from day one | 2 | 2 | 5 | 5 | 5 | 335 |
| A. Session pseudo only, forever | 5 | 5 | 1 | 1 | 2 | 330 |

- C: ships fast, the model keeps room for accounts without coding them.
- B: protects pseudos, but passwords, reset e-mails and an account base to secure.
- D: no password, but still an e-mail service and stored e-mails.

Sensitivity (simplicity 15, minimised 25, impersonation 35, regulars 15, evolvability 10): B 380,
D 360, C 330. The choice is sensitive to how much impersonation matters; ADR-0012 later added accounts
for private messages for exactly that reason.

## Decision

> Superseded in part by ADR-0012: V1 has e-mail accounts for private messages. Persisted data also
> includes accounts, device hashes, e-mail block hashes and the legal vault of closed accounts (ADR-0014). The rest of this decision still holds.

- V1: a session is bound to an ephemeral `Member`. The member holds the pseudo. The session holds
  the optional gender, the self-declared age and city, the ignore list and the moderator name.
  Everything is lost when the session closes, after the away grace of ADR-0009.
- A pseudo is unique among connected and away sessions (BR-002).
- Persisted personal data: legal connection logs (IP, pseudo, timestamps; content lines only under an injunction, ADR-0014), reports and bans,
  moderator credentials and invitations (ADR-0008), and away records for at most 5 minutes (ADR-0011).
- No account code in V1. In V2, `Member` becomes persistent and owns only id and pseudo(s).

## Consequences

- A banned user can come back with another pseudo: V1 bans rely on a keyed IP hash + pseudo.
- Retention periods of logs, reports and bans must be documented in the privacy notice.
- Legal check done in brick 1 bis (2026-10-22): decree 2021-1362 confirmed, 1 year for technical and
  traffic data. Accounts add longer duties, see ADR-0014.
