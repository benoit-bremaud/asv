# Security and GDPR — asv

Not legal advice. The brick 1 bis legal check (2026-10-22) read the official texts below. Points marked
"professional review" remain interpretations until the brick 10 review.

## 1. Legal landscape (brick 1 bis check, official texts read on 2026-10-22)

Sources: Légifrance (consolidated versions in force on 2026-10-22), EUR-Lex (DSA, GDPR), Conseil
constitutionnel. The CNIL website was under maintenance on 2026-10-22, so CNIL texts were read in their
Légifrance publication.

| Topic | Official text | What it says | Impact on asv | Status |
|---|---|---|---|---|---|
| asv is a hosting provider | LCEN art. 6 I.2 (version of 2026-08-26), DSA art. 3 g iii | A hosting provider stores information provided by its users. | asv stores messages, reports and accounts: every host duty below applies. | Verified (official text) |
| Retention of identifying data | LCEN art. 6 V-A and V-B; CPCE art. L34-1 II bis and VI; decree 2021-1362 arts. 2, 3, 5, 7, 8 | Hosts keep data identifying content contributors. E-mail and civil identity 5 years after the contract ends (art. 2); identifier and pseudonyms 1 year after the account closes (art. 3); for each content creation, change or deletion, the connection identifier and the protocols used, 1 year (arts. 5 2° and 7). Art. 5 2° says "l'identifiant de la connexion à l'origine de la communication" and "les types de protocoles utilisés pour la connexion au service et pour le transfert des contenus". Art. 6 2°, only "en cas d'injonction du Premier ministre", adds content id, nature of the operation, date and time, and the author's identifier if provided, 1 year. Only data actually collected (art. 8). Never the content of correspondence (L34-1 VI). Breach: 1 year in prison, 250 000 EUR. | Legal vault for closed accounts (ADR-0014, BR-081, BR-082). Connection and contribution log (BR-060). asv keeps the IP and source port on the connection line, which art. 5 2° does not list for hosts: an interpretation, to settle in the brick 10 professional review. | Verified (official text). Scope for a small free chat and the IP interpretation: professional review, brick 10 |
| Traffic data under injunction | CPCE art. L34-1 III; decree 2021-1362 art. 6; decree 2026-920 (in force 2026-10-21) | The content id, the operation, date and time, added to the contribution line (decree art. 6 2°), kept 1 year while a Prime Minister's injunction is in force. Renewed every year since 2021. | Included in the contribution line (BR-060). Re-check the yearly renewal each October. | Verified (official text) |
| Editor identification | LCEN art. 1-1 I and II (in force 2024-05-23) | An editor publishes name, address, phone and director of publication, and the host's identity. A non-professional editor may publish only the host's identity if it gave its own identity to the host, which keeps it under professional secrecy. Right of reply within 3 months. | Legal notice in brick 10: choose between full identity and the non-professional option. | Verified (official text) |
| Reporting offences to authorities | LCEN art. 6 IV-A and IV-C; DSA art. 18 | Hosts promptly inform the authorities of listed offences reported to them (harassment, child abuse material, terrorism, incitement to hatred, and others). Hosts inform law enforcement promptly of any suspected offence threatening life or safety. Breach: 1 year in prison, 250 000 EUR. | Severe-case procedure (BR-078): the moderator escalates to the owner, who files through the official channels (for example PHAROS). | Verified (official text). Channel to document in brick 8 |
| False reports | LCEN art. 6 VII | Knowingly reporting lawful content as illicit to get it removed: 1 year, 15 000 EUR. | Mention in the terms and the report form (brick 10). | Verified (official text) |
| DSA points of contact | DSA arts. 11 and 12 | One public electronic contact for authorities, one for users, not only automated. | Contact page (brick 10). | Verified (official text) |
| DSA terms and moderation | DSA art. 14(1) and (4) | Terms describe restrictions, moderation policies, procedures and tools, including algorithmic decisions and human review. Applied in a diligent, objective and proportionate way. | Terms mention AI triage and the human decision (ADR-0010). | Verified (official text) |
| DSA notice and action | DSA art. 16 | Electronic report mechanism; notices with reasons, exact location, name and e-mail (except child abuse offences), good-faith statement. Acknowledge receipt, notify the decision with redress options, mention automated means. | Report flow (UC9) to align in brick 8: acknowledgement and decision notice when the reporter left an e-mail. | Verified (official text) |
| DSA statement of reasons | DSA art. 17 (read on EUR-Lex 2026-10-16) | Required for account suspension or deletion, content removal, service suspension, only when the provider knows the person's electronic contact. | E-mailed to account holders (BR-076). | Verified (official text) |
| DSA transparency report | DSA art. 15(2) | Micro and small enterprises are exempt from the yearly report. | None while asv stays micro. | Verified (official text) |
| DSA misuse policy and micro exemption | DSA arts. 19 and 23 (read on EUR-Lex 2026-10-16) | Platforms suspend repeat offenders after a warning. Micro and small enterprises are exempt from arts. 20 to 28. | Strike policy follows art. 23 voluntarily (ADR-0012). | Verified (official text) |
| Under-15 ban on social networks | Law 2026-813 of 2026-08-24; Conseil constitutionnel 2026-911 DC of 2026-08-14 | Art. 1 (a new LCEN art. 6-9 banning under-15s from online social networks) was declared unconstitutional: disproportionate to freedom of communication, no parental authorisation, no individual assessment, age checks for everyone without legal safeguards. The press reports a new bill for spring 2027 (not an official source). | None while asv is 18+ (ADR-0004). The struck ban would have covered asv: watch the 2027 bill. | Verified (official text) |
| Digital consent age | GDPR art. 8; Loi Informatique et Libertés art. 45 | France: 15 years for consent-based processing of information society services. Under 15, joint consent of the minor and the parent. | None while asv is 18+ and relies on contract, legal obligation and legitimate interest. | Verified (official text) |
| Cookies and trackers | Loi Informatique et Libertés art. 82; CNIL deliberation 2020-091 art. 5 | No consent for trackers strictly necessary to a service the user asked for. The CNIL lists authentication trackers, including their security, as exempt, provided the tracker serves no other purpose. | The 30-day device cookie (ADR-0013) and the resume token are exempt. Explain them in the privacy notice. | Verified (official text) |
| Automated decisions | GDPR art. 22 | Right not to be subject to a decision based solely on automated processing with legal or similarly significant effects. | Respected: AI only triages, a human moderator decides every sanction (ADR-0010). | Verified (official text) |
| Data protection impact assessment | GDPR art. 35(1), (3), (7); CNIL deliberation 2018-327 | Required before any processing likely to result in a high risk. The CNIL list is non-exhaustive and built on the EDPB criteria: evaluation or scoring, automated decision, systematic monitoring, sensitive or highly personal data, large scale, combined datasets, vulnerable persons, new technology, exclusion from a service. | asv meets several criteria: AI triage (new technology), private messages in report excerpts (highly personal), strikes and suspensions (exclusion from the service). **An impact assessment is planned before moderation goes live** (brick 8). | Verified (official text). The EDPB guidelines themselves were not reachable on 2026-10-22 |
| Retention of accounts and blocks | GDPR art. 5(1)(e) | Storage limitation: no longer than necessary for the purpose. No binding text sets the 2-year inactivity or the 6-month severe-case block. | BR-079 and BR-078 durations stay owner proposals, to justify in the privacy notice. CNIL recommendations to read when the CNIL site is back. | No binding text found |

This section is the living source for legal facts. ADRs keep the snapshot that motivated each decision,
with their sources (ADR-0004, ADR-0005, ADR-0010, ADR-0014).

## 2. Personal data inventory

| Data | Where | Purpose | Legal basis | Retention | Encrypted at rest (ADR-0017) |
|---|---|---|---|---|---|
| Pseudo, gender, age, city | Hub memory, socket attachment, client sessionStorage | Run the chat | Contract / legitimate interest | Session end | No (memory only) |
| Messages | Hub memory | Run the chat | Contract | Room or window end | No (memory only) |
| Away record: pseudo, rooms, windows, buffered private messages | Hub storage | Resume after a disconnect | Contract | 5 minutes max (ADR-0011) | Yes (brick 9) |
| Connection line, one per socket connection: connection id, IP and source port, protocols, pseudo, account id, start and end | Connection log | Identify content contributors (LCEN art. 6 V-A, decree 2021-1362 arts. 5 2° and 7) | Legal obligation | 1 year (BR-060) | Yes (brick 9) |
| Contribution line, one per message: connection id, protocols; under injunction also content id, operation, date and time (never the content) | Connection log | Identify content contributors (decree arts. 5 2° and 7, art. 6 2° under injunction) | Legal obligation | 1 year (BR-060) | Yes (brick 9) |
| Report: reason, excerpt, context lines, pseudos, AI triage | Moderation store | Moderation, DSA | Legal obligation / legitimate interest | 6 months after closing (BR-061) | Yes (brick 8) |
| Reported context with neutral labels | AI provider (processor) | Triage reports | Legitimate interest | Provider contract, no training on data | Provider |
| Ban: keyed IP hash, pseudo, end | Moderation store | Enforce expulsions | Legitimate interest | 30 days after end (BR-062) | Keyed hash; pseudo encrypted (brick 8) |
| Moderator name, credential id, public key; hashed invitations | Moderator store | Authenticate moderators | Legitimate interest | Until revoked; invitations 24 h | Yes (brick 8) |
| Resume token | Client sessionStorage, hash in hub | Resume session | Contract | 5 minutes max | Hash |
| Account: e-mail, verification date, strikes | Account store | Private messages, sanctions (ADR-0012) | Contract / legitimate interest | Until deletion, or 2 years inactive (BR-079, owner proposal) | E-mail encrypted + keyed hash; ids, dates clear |
| Legal retention record: account id, e-mail, creation and closing dates | Legal vault, a table in hub storage (ADR-0014) | Answer an authority entitled by law (decree 2021-1362 arts. 2 and 3) | Legal obligation | Account id 1 year, e-mail and dates 5 years after closing (BR-081) | E-mail sealed to owner key; id, dates clear |
| Access entry: date, request reference, legal basis, ids returned | Legal vault table in hub storage | Accountability of disclosures to authorities | Legal obligation (accountability of disclosures) | 5 years after the read, daily purge (BR-082). Owner decision pending, matches the longest disclosable record | Sealed to owner key; date clear |
| Device token | Browser cookie, hash in hub | Stay signed in (ADR-0013) | Contract (authentication cookie, exempt from consent: LIL art. 82, CNIL 2020-091) | 30 days | Hash |
| Sign-in code | E-mail provider, keyed hash in hub | Verify the e-mail | Contract | 10 minutes | Keyed hash; e-mail encrypted |
| Pending statement of reasons: e-mail, text | Account store | Deliver the DSA art. 17 notice | Legal obligation | Until sent, 7 days max | Encrypted |
| Strike carry-over: keyed e-mail hash, strike expiries | Account store | Prevent escaping strikes by self-deletion | Legitimate interest | Until the last strike expires (BR-080) | Keyed hash |
| Blocked e-mail, keyed hash | Account store | Prevent re-registration after sanction | Legitimate interest | 7 days or 6 months (BR-077, BR-078) | Keyed hash |
| E-mail and statement of reasons | Brevo, EU e-mail provider (processor) | Sign-in, DSA art. 17 notices | Contract / legal obligation | Provider contract | Provider (Brevo) |

Never persisted: gender, age, city, message content outside report excerpts and away buffers. The vault
never holds message content (CPCE art. L34-1 VI).
The retention table above is the summary: BR-081 and ADR-0014 are the source for the vault periods. Account holders are informed at sign-up and on deletion (GDPR art. 13). An erasure request does not cover the vault or the log (GDPR art. 17(3)(b)). An access request (art. 15) is answered by the owner without revealing any requisition.
No analytics, no ads, no third-party trackers, no cookies other than strictly necessary ones.

## 3. Threat model (STRIDE, V1)

| Threat | Example | Mitigation |
|---|---|---|
| Spoofing | Impersonating a moderator | Passkeys (ADR-0008), reserved words in pseudos (BR-003). |
| Spoofing | Stealing a session | Resume token random 128 bits, rotated at each resume (BR-014), sessionStorage only. |
| Tampering | Forged protocol messages | Server validates every message against the protocol schema, domain re-checks rules. |
| Repudiation | Moderator denies an expel | Moderator name and time recorded (BR-055). |
| Repudiation | The owner denies or is accused of a disclosure from the vault or the connection log | Every read appends an access entry: date, request reference, legal basis, ids returned (BR-082). |
| Information disclosure | XSS through messages or smileys | Text only rendering, smiley whitelist (BR-022), strict Content-Security-Policy. |
| Information disclosure | Reversing banned IPs | HMAC with a server secret, not a plain hash. |
| Information disclosure | Leak or misuse of the legal vault or the connection log | No read path from the domain, moderation tools or AI: only the `LegalVaultStore` write port, owner-only read call (BR-082). Vault sealed to the owner public key (ADR-0017). Purge at 1 and 5 years (BR-081). |
| Denial of service | Flood, entry spam | Flood limit (BR-021), entry limit (BR-007), report limit (BR-052), message size (BR-020). |
| Elevation of privilege | Calling moderator actions as a chatter | Domain authorisation check on every moderation command (BR-054). |

## 4. Security controls checklist (ASVS level 1 targets)

- HTTPS only, HSTS, secure headers (CSP, frame-ancestors none, referrer-policy).
- Origin check on WebSocket upgrade.
- Input validation at the protocol boundary and in the domain.
- Secrets (HMAC key, data keys, vault public key, Brevo API key, owner invitation secret) in Wrangler
  secrets, never in the repo. The owner keeps an offline backup of the keys and the vault private key
  for 5 years (ADR-0017).
- Application-level encryption of personal data at rest (ADR-0017, BR-083).
- Dependencies: Dependabot, CodeQL from brick 2, Gitleaks already active.

## 5. Legal pack to produce before public launch (brick 10, after the brick 1 bis check)

- Data protection impact assessment (GDPR art. 35), drafted in brick 8 before moderation goes live.
- Legal notice choice: full identity or non-professional editor option (LCEN art. 1-1 II).
- Professional review of the decree 2021-1362 scope for asv (ADR-0014).
- Legal notice (mentions légales) with publisher and host.
- Terms of use: 18+, behaviour rules, moderation, bans.
- Privacy notice: the inventory above with confirmed retention periods, including the vault and the connection log (GDPR art. 13).
- DSA contact points (arts. 11, 12) and report procedure description (art. 16), false-report warning (LCEN art. 6 VII).
