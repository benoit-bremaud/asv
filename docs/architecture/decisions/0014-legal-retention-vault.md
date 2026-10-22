# ADR-0014 — Legal retention vault for closed accounts

- Status: accepted, amends ADR-0012 (what remains after an account is deleted) and BR-060
- Date: 2026-10-22
- Deciders: Benoît Bremaud

## Context

The brick 1 bis legal check read the official texts on Légifrance on 2026-10-22 (details and citations
in [security and GDPR](../security-and-rgpd.md) §1):

- asv stores what its users write, so it is a **hosting provider** (LCEN art. 6 I.2, defined by DSA
  art. 3 g iii). LCEN art. 6 V-A requires hosting providers to keep the data that identify anyone who
  contributed to a content, in the conditions of CPCE art. L34-1 II bis to III bis. Breach: one year in
  prison and a 250 000 EUR fine (art. 6 V-B).
- Decree 2021-1362 lists the data. For what asv collects (art. 8: only data actually collected):
  - art. 2: civil identity, **including the user's e-mail addresses**, kept **5 years after the end of
    the contract**;
  - art. 3: other data given at account creation, **including the identifier and the pseudonyms used**,
    kept **1 year after the account is closed**;
  - art. 5: technical data identifying the source of the connection, for each content creation, kept
    1 year;
  - art. 6: traffic data (content id, operation, date and time, identifier used) kept 1 year **only under
    a Prime Minister's injunction**. One is in force: decree 2026-920, from 2026-10-21, renewed every
    year since 2021.
- CPCE art. L34-1 VI: the kept data never include the content of correspondence, and must not be used
  for any other purpose.

ADR-0012 deleted the e-mail when an account is deleted and kept only keyed hashes. That does not meet
art. 2 and art. 3.

## Options and MCDA

Scores 0–5. Criteria: legal compliance 40, data minimisation and privacy 25, simplicity and rework 20,
user trust 15.

| Option | Legal | Privacy | Simplicity | Trust | Total /500 |
|---|---|---|---|---|---|
| **A. Sealed legal vault: e-mail 5 years, identifier and pseudonyms 1 year, read only on judicial requisition, automatic purge** | 5 | 2 | 3 | 3 | **355** |
| C. Collect no e-mail at all (drop accounts) | 4 | 5 | 1 | 2 | 335 |
| B. Keep ADR-0012 as is (keyed hashes only) | 1 | 5 | 5 | 4 | 325 |

- A follows the decree to the letter. Privacy suffers from the longer retention, mitigated by sealing.
- C removes the art. 2 duty but breaks private messages and lasting strikes, the core of ADR-0012.
- B is the simplest but ignores a criminal-law duty.

Sensitivity (legal 60, privacy 15, simplicity 15, trust 10): A 405, C 350, B 250. A stays first.

## Decision

- When an account is deleted, for any reason, a **legal retention record** is written to a separate
  vault store: account id, e-mail, verification date, creation and closing dates, and the pseudonyms
  used while signed in.
- E-mail and dates are kept **5 years** after closing. The pseudonyms are removed after **1 year**.
  A daily alarm purges expired data (BR-081).
- The vault is **write-only for the application**: no domain use case, moderation tool or AI reads it.
  It is opened only to answer a judicial requisition, by the owner, and each access is logged (BR-082).
- Strikes, e-mail blocks and the strike carry-over keep using keyed hashes (ADR-0012), never the vault.
- Connection logs follow decree arts. 5 and 6 (BR-060): one line per connection and per content
  creation, change or deletion, never the content itself.
- The privacy notice states these retentions and their legal basis (legal obligation).

## Consequences

- An account holder who deletes their account is told that the e-mail is kept 5 years for legal
  reasons, not for asv's own use.
- The `accounts` study gains the vault (data-flow and state diagrams). The `platform` study adds a
  vault table to the hub storage in brick 5.
- The breadth of the decree for a small, free, non-professional chat is an interpretation: listed for
  the professional review in brick 10.
