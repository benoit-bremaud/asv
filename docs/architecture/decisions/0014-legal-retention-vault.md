# ADR-0014 — Legal retention vault for closed accounts

- Status: accepted, amends ADR-0005 (retention), ADR-0007 (hub storage and ports), ADR-0011 (daily purge),
  ADR-0012 (what remains after an account is deleted) and BR-060
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
  - art. 5: for each content creation, the connection identifier and the protocols used, kept
    1 year (art. 7: a contribution is a creation, change or deletion);
  - art. 6: traffic data (content id, operation, date and time, identifier used) kept 1 year **only under
    a Prime Minister's injunction**. One is in force: decree 2026-920, from 2026-10-21, renewed every
    year since 2021.
- CPCE art. L34-1 VI: the kept data never include the content of correspondence, and must not be used
  for any other purpose.

ADR-0012 deleted the e-mail when an account is deleted and kept only keyed hashes. That does not meet
art. 2 and art. 3.

## Options and MCDA

Scores 0–5. Criteria: legal compliance 40, data minimisation and privacy 25, simplicity and rework 20,
user trust 15. Options ranked by total.

| Option | Legal | Privacy | Simplicity | Trust | Total /500 |
|---|---|---|---|---|---|
| **D. Legal vault with e-mail and dates only; account id 1 year; session pseudonyms stay in the connection log (BR-060)** | 4 | 4 | 4 | 3 | **385** |
| A. Legal vault with e-mail, dates, account id and the pseudonyms used while signed in | 5 | 2 | 3 | 3 | 355 |
| C. Collect no e-mail at all (drop accounts) | 4 | 5 | 1 | 2 | 335 |
| B. Keep ADR-0012 as is (keyed hashes only) | 1 | 5 | 5 | 4 | 325 |

- D follows art. 2 to the letter. For art. 3, asv collects no pseudonym at account creation: a pseudonym
  is chosen at each connection and already sits in the connection log for 1 year. Art. 8 (only data
  actually collected) argues against a second copy. Legal scored 4, not 5, because a broad reading of
  "pseudonyms used" would require them for 1 year after closing.
- A covers that broad reading, at the cost of a pseudonym history kept for the whole life of the account.
- C removes the art. 2 duty but breaks private messages and lasting strikes, the core of ADR-0012.
- B is the simplest but ignores a criminal-law duty.

Sensitivity (legal 60, privacy 15, simplicity 15, trust 10): A 405, D 390, C 350, B 250. A takes the lead
only when the legal weight dominates. The owner chose D on 2026-10-22 (first version of this ADR chose A),
with the broad reading of art. 3 sent to the professional review in brick 10. Moving to A later adds one
field and loses nothing.

## Decision

- When an account is deleted, for any reason, a **legal retention record** is written to the vault
  **in the same transaction** as the deletion: account id, e-mail, creation date (equal to the e-mail
  verification date) and closing date. Nothing else: no pseudonym, deletion reason, strike or report.
- The account id is purged **1 year** after closing (art. 3), the rest **5 years** after closing
  (art. 2). The daily alarm purges expired data (BR-081). Pseudonyms stay only in the connection log
  (BR-060), 1 year.
- **Write-only for the application.** The vault is a table in the hub storage behind a
  `LegalVaultStore` port with two operations only: `record(entry)` and `purgeExpired(now)`, which also purges access entries older than 5 years. No domain use
  case, moderation tool or AI reads it.
- **Read path.** Only the owner reads it, through a dedicated owner-only hub call, to answer an authority
  entitled by law (judicial requisition or equivalent). Each read appends an access entry: date, request
  reference, legal basis, ids returned (BR-082). The connection log follows the same access regime. Access entries are kept 5 years after the read and purged by the daily alarm.
- **Encryption at rest** of the e-mail is decided in brick 5 (policy only, or encryption to an owner
  key). Criterion: the application must not be able to read back what it wrote.
- Strikes, e-mail blocks and the strike carry-over keep using keyed hashes (ADR-0012), never the vault.
- Connection logs follow decree arts. 5 and 7: one connection line per socket connection and a contribution line (connection id, protocols) per contribution. Art. 6 adds the content id, operation, date and time under injunction (BR-060). They
  never hold the content itself.
- The sign-up screen and the privacy notice state these retentions and their legal basis (legal
  obligation, GDPR art. 6(1)(c) and 13). An erasure request does not cover them (GDPR art. 17(3)(b)).
  An access request (art. 15) is answered by the owner without revealing any requisition.

## Consequences

- An account holder is told at sign-up, and again on deletion, that the e-mail is kept 5 years for
  legal reasons, not for asv's own use.
- The `accounts` study gains the vault (use case, class, data-flow and state diagrams). The `platform`
  study will add the vault table and its port to the hub storage in brick 5.
- Threat model: disclosure of the vault or the log, and repudiation of a disclosure, are covered by the
  owner-only read path and the access entries.
- The breadth of the decree for a small, free, non-professional chat is an interpretation: listed for
  the professional review in brick 10.
