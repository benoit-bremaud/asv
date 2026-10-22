# ADR-0012 — E-mail accounts for private messages, three-strike moderation

- Status: accepted, partially supersedes ADR-0005 (V1 now has accounts for private messages);
  amended by ADR-0014 (legal retention after deletion)
- Date: 2026-10-16
- Deciders: Benoît Bremaud

## Context

The owner wants repeat offenders handled firmly: a chatter who bothers others is reported, warned, and
after three warnings loses the account, without being able to come back with the same e-mail for a week.
Each chatter can also "ban" someone for themselves, which is the existing ignore (UC8).

Without a lasting identity, warnings cannot be counted: an offender comes back with another pseudo.
Caramail required a Caramail e-mail account to chat, which is what made sanctions stick.

Legal facts from Regulation (EU) 2022/2065 (arts. 17, 19 and 23 read on EUR-Lex on 2026-10-16,
art. 18 from secondary sources, to confirm):

- Art. 17: a hosting provider sends a clear statement of reasons for any suspension or deletion of an
  account, removal of content or suspension of the service. It must give the facts, the terms clause
  breached, whether automated means were used, and the available redress. **It applies only when the
  provider knows the person's electronic contact details.** A plain warning that restricts nothing is
  not listed.
- Art. 23: online platforms suspend, after a prior warning, users who frequently provide manifestly
  illegal content, and describe the policy in their terms. Art. 19 exempts micro and small enterprises,
  but the policy below follows its spirit.
- Art. 18: a hosting provider informs the authorities when it becomes aware of information giving rise
  to a suspicion of a criminal offence threatening someone's life or safety.

## Options and MCDA

Scores 0–5. The owner set the weights: effectiveness against repeat offenders 45, minimal data 20,
V1 simplicity 5, Caramail spirit 15, compliance effort 15.

| Option | Effectiveness | Data | Simplicity | Spirit | Compliance | Total /500 |
|---|---|---|---|---|---|---|
| **D. Rooms without account, private messages need a verified e-mail account** | 4 | 4 | 3 | 4 | 3 | **380** |
| B. Account required for everything | 4 | 3 | 2 | 3 | 3 | 340 |
| C. Strikes counted on IP and pseudo | 2 | 4 | 4 | 5 | 4 | 325 |
| A. No account, IP and pseudo bans only | 1 | 5 | 5 | 5 | 5 | 320 |

With the base weights (effectiveness 30, simplicity 20), A led D 380 to 365. The owner explicitly
prioritised repeat offenders.

## Decision

- Rooms stay instant: entering with a pseudo needs no account.
- **Opening or answering a private conversation requires a signed-in account** with a verified e-mail
  (sign-in by e-mail code, ADR-0013). Disposable e-mail domains are refused.
- An account holds the e-mail, its verification date and its strikes. The pseudo is still chosen per
  session.
- **Strikes**: a moderator closing a report as "warned" adds a strike to the target's account and sends a
  `warned` message in the chat. Strikes expire after 90 days.
- **Third active strike**: the moderator is asked to confirm a 7-day suspension. On confirmation, the
  statement of reasons is e-mailed (art. 17) and the account is deleted at once; if sending fails, only
  the address and the statement are kept as a pending statement, retried for at most 7 days (BR-076). A keyed hash of the e-mail is kept for 7 days to refuse a new account. Every live session and
  away record of that account is closed, and a 7-day ban applies to the keyed IP hash and the pseudo of
  the session that was in use.
- **No escape by self-deletion**: a member who deletes their own account while strikes are active keeps
  a keyed e-mail hash with the strike expiry dates until the last one expires. If the same e-mail
  creates a new account meanwhile, the strikes come back.
- Reports record the target's account id when there is one, so strikes can be added after the target
  has left.
- **Severe cases** (grooming, threats, child sexual abuse material, incitement to violence): immediate
  deletion without prior warning, e-mail hash blocked for a longer period (proposed 6 months, legal
  check), and the owner alerts the authorities when life or safety is threatened (art. 18, through the
  official reporting channels to confirm in brick 1 bis). A chatter without an account gets the longest
  IP and pseudo ban (7 days).
- Chatters without an account keep the V1 timed bans on keyed IP hash and pseudo (ADR-0005).
- A member can delete their account at any time.

## Consequences

- New personal data: e-mail addresses. The brick 1 bis legal check found a 5-year retention duty after
  closing (decree 2021-1362 art. 2): deleted accounts leave a sealed record, see ADR-0014.
- A transactional e-mail provider is needed (verification links, statements of reasons). Choice in
  brick 5, EU provider preferred.
- New feature study `accounts`. Moderation, private conversations and protocol studies change.

## Legal check (brick 1 bis, 2026-10-22)

DSA art. 18 and LCEN art. 6 IV-A were read on 2026-10-22: hosts promptly inform the authorities. The
6-month severe-case block has no binding text and stays an owner decision. Deleted accounts leave a sealed
legal record (ADR-0014). See `security-and-rgpd.md` §1.
