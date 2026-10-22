# ADR-0010 — AI assists moderators by triaging reports only

- Status: accepted
- Date: 2026-10-15
- Deciders: Benoît Bremaud

## Context

The owner proposed an AI moderator that scans messages for suspicious words or ambiguous situations.
Grooming and harassment happen mostly in private messages and show over a conversation, not in one
message. Constraints gathered on 2026-10-15 (legal points unverified, see `security-and-rgpd.md`):

- Scanning private messages at scale likely requires a data protection impact assessment, is hard to
  base on legitimate interest, and touches the secrecy of correspondence.
- GDPR forbids, in principle, fully automated decisions with a significant effect: a human must decide
  sanctions.
- The DSA requires terms to describe automated moderation tools, and each decision to say whether
  automated means were used.
- Cost is not blocking: about 30 $/month to scan everything with Claude Haiku 5.5 at full load
  (0.10 $ per million input tokens), about 130 $/month with Workers AI Llama Guard. Estimates.

## Options and MCDA

Scores 0–5. Criteria: real protection 30, privacy and GDPR 25, Caramail spirit (no robot censorship) 15,
cost 15, simplicity 15.

| Option | Protection | Privacy | Spirit | Cost | Simplicity | Total /500 |
|---|---|---|---|---|---|---|
| **E. AI triages reported content only** | 2 | 5 | 5 | 5 | 4 | **395** |
| A. No AI | 1 | 5 | 5 | 5 | 5 | 380 |
| B. AI reads public rooms and flags | 3 | 4 | 4 | 3 | 3 | 340 |
| C. AI reads rooms and private messages and flags | 5 | 2 | 3 | 3 | 3 | 335 |
| D. AI reads everything and acts alone | 4 | 2 | 1 | 2 | 2 | 245 |

Sensitivity (protection 45, privacy 15, spirit 15, cost 15, simplicity 10): C 375, E 355. E is kept
because scanning private messages needs an impact assessment; C is reconsidered only with a teen space
(V2, ADR-0004).

## Decision

- When a chatter files a report, the client attaches the context the reporter saw: up to the last 20
  lines of that room or private window (BR-051).
- The hub sends the report to a `ReportTriage` port. Pseudos are replaced by neutral labels
  (A, B, C...) before leaving asv.
- The AI returns a category, an urgency level (low, medium, high) and a short summary. The report list
  is sorted by urgency, then date.
- The AI never sanctions. A moderator always decides (UC11, UC12). If the AI is unavailable, the report
  is listed with urgency "unknown".
- Model and provider are chosen in brick 8, with a processing agreement and EU processing preferred.
  A no-AI adapter is used in development and tests.

## Consequences

- Terms and privacy notice must mention AI triage of reports and the provider.
- Only reported content reaches the AI, which keeps the processing narrow.
- Report records gain triage fields (moderation class diagram).

## Legal check (brick 1 bis, 2026-10-22)

The constraints above were read in the official texts: DSA arts. 14 and 16(6) (describe automated tools,
mention them in decisions) and GDPR art. 22. An impact assessment (GDPR art. 35) is planned in brick 8.
The decision stands. See `security-and-rgpd.md` §1.
