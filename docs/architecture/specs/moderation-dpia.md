# Data protection impact assessment — moderation with AI triage

This assessment (GDPR art. 35) covers reports, AI triage, sanctions and the authority channel of asv
before moderation goes live. Not legal advice; the brick 10 professional review re-reads it.

- Controller: the owner (Benoît Bremaud), non-professional editor of asv.
- Date: 2026-11-13. Status: draft, to sign by the owner before moderation opens to testers (BR-108).
- Method: CNIL PIA structure (context, necessity, risks, measures); EDPB criteria from CNIL deliberation 2018-327.

## 1. Why an assessment

asv meets four EDPB criteria (`security-and-rgpd.md` §1): new technology (AI triage), highly personal
data (private message lines in report context), exclusion from a service (strikes, suspensions, bans),
and possibly vulnerable persons (a minor who lied about age, reports "seems minor"). Two criteria or more
call for an assessment.

## 2. Processing described

| Step | Data | Who | Where | Retention |
|---|---|---|---|---|
| Filing a report (UC9) | reason, excerpt ≤ 500 characters, ≤ 20 context lines, author and target pseudos, keyed IP hash and account id of the target, reporter account id if member | Reporter | Moderation store, encrypted | 6 months after closing, 1 year with an authority alert (BR-061, BR-105) |
| AI triage (02g) | reason, target kind, lines with neutral labels, e-mails and phones masked (BR-100) | Hub → Mistral (processor, EU) | Provider, no training on the paid tier | 30 days for abuse monitoring unless zero retention is confirmed (to verify at signature) |
| Review and decision (UC12, UC11) | the report, triage fields, moderator name | Moderator | Moderation store | as above |
| Sanction | ban hashes, strikes, e-mail block hash, statement of reasons | Hub, Brevo | Account store, Brevo | BR-062, BR-074, BR-077, BR-078, BR-076 |
| Decision e-mail (BR-107) | reporter e-mail at sending time, decision in general terms | Hub, Brevo | Pending mail record, encrypted | until accepted, 7 days max |
| Authority alert (BR-104) | report id, offence category, moderator, dates, filing reference | Moderator, owner | Moderation store, owner mailbox | 1 year after closing (BR-105) |
| Authority disclosure (UC20) | excerpt, context, pseudos, dates, possibly the IP from the log (BR-082) | Owner → PHAROS or law enforcement | Official channel (§6 of `security-and-rgpd.md`) | Recipient's rules; asv keeps the reference 1 year (BR-105) |

Legal bases: legitimate interest (safe chat, abuse prevention) for reports, triage and sanctions; legal
obligation for the hosting duties (LCEN art. 6 IV, DSA arts. 16 to 18) and the disclosure to the
authorities (GDPR art. 6(1)(c)). No special-category data is
sought; it may appear in reported lines and is processed only to moderate them (GDPR art. 9(2)(f) and
(g), to confirm in the professional review).

Secrecy of correspondence: report context may hold private-message lines. They leave asv only when a
participant of that conversation reports it, only as labelled lines (BR-100), and only to a processor
bound by contract acting for asv, never to a third party for its own use. Whether this fits the secrecy
of correspondence (CPCE art. L32-3) is a point for the professional review.

## 3. Necessity and proportionality

- Only reported content is triaged, never rooms or private windows at large (ADR-0010, option E).
- The AI ranks and summarises; a human decides every outcome (GDPR art. 22, BR-057).
- Minimisation before transfer: labels instead of pseudos, masked e-mails and phones, no IP, no ids, no
  room name, no date (BR-100).
- EU processor with an agreement and no training (ADR-0019); without the key, no AI at all.
- Retention bounded and purged daily (BR-061, BR-105); content encrypted at rest (ADR-0017).
- Information: privacy notice and terms (brick 10) name the triage, the provider and the human review
  (DSA art. 14); every statement of reasons and decision e-mail says whether automated means were used.
- Rights: access, erasure and objection (GDPR art. 21) answered by the owner; erasure does not cover a
  report while an authority alert is pending or filed (GDPR art. 17(3)(e)); anyone may complain to the
  CNIL.
- Moderators are bound to confidentiality on what they read in reports.
- Self-deletion before a decision: a target who deleted their own account leaves no e-mail hash, so a
  severe expel applies only the IP and pseudo ban (BR-103, accepted limit).

## 4. Risks and measures

Likelihood and severity on the CNIL scale (1 negligible to 4 maximum), after measures.

| Risk | Source | Measures | Likelihood | Severity |
|---|---|---|---|---|
| Illegitimate access to reported content | Stolen moderator access, store leak | Passkeys (ADR-0008), encryption at rest, no read path from the AI, moderator actions recorded (BR-055); note that every moderator can read alerted closed reports for up to 1 year in the "alertes" tab (BR-105) | 1 | 3 |
| Re-identification at the provider | Content itself identifies people | Labels and masks (BR-100), EU processor, no training, no ids or dates sent | 2 | 2 |
| Wrong sanction from a biased or manipulated triage | Model error, prompt injection in the reported lines | AI only orders the queue; summary marked "à vérifier"; closed answer schema (BR-101); moderator reads excerpt and context | 2 | 2 |
| Missed urgent case | AI down, cap reached, wrong low urgency | `unknown` still listed; urgency floor by reason; oldest-first within each urgency; moderators read every report (BR-101, BR-102) | 2 | 3 |
| Prompt injection or cap exhaustion by the reported party | Reported lines written to steer the model; many reports to burn the daily cap | Lines sent as a JSON array inside a fixed system prompt; closed schema; urgency floor by reason; 20 calls a day per reporter besides the 200 global cap (BR-101) | 2 | 2 |
| Disclosure to the reporter of the target's sanction | Over-detailed decision e-mail | General terms only (BR-107) | 1 | 2 |
| Authority alert leaks content | Alert e-mail intercepted | Alert holds report id and category only (BR-104) | 1 | 1 |
| Unlawful retention | Purge failure | Daily purge, tests on retention rules | 1 | 2 |

Residual risk: acceptable for a small 18+ chat once the checks of section 5 are done.

## 5. Checks before going live

- [ ] Mistral agreement signed; EU location confirmed and noted here with the date.
- [ ] Paid tier in use (the free tier may train on inputs).
- [ ] Zero data retention requested and confirmed in writing (otherwise inputs may be kept about 30 days
  for abuse monitoring).
- [ ] Privacy notice and terms updated (brick 10 draft at least) for testers.
- [ ] Owner signature below.

Signed: — (owner, date)
