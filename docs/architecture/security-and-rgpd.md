# Security and GDPR — asv

Not legal advice. Every legal point is **unverified** until the brick 9 legal check on official
texts (Légifrance, CNIL, EU Official Journal).

## 1. Legal landscape (as gathered on 2026-10-15)

| Topic | What we found | Impact on asv | Status |
|---|---|---|---|
| Minors under 15 on social networks | 2023 "Marcangeli" law needs parental consent under 15 but its decree was never taken. The July 2026 under-15 ban was reportedly struck down by the Conseil constitutionnel on 2026-08-14. | None while asv is 18+ (ADR-0004). Revisit if an age-verification duty for chats comes into force. | To confirm |
| GDPR digital consent age | France sets it at 15 (Loi Informatique et Libertés art. 45, GDPR art. 8). Applies only to consent-based processing. | None, asv is 18+. | To confirm |
| Host duties (LCEN, decree 2021-1362) | Keep data identifying content authors, reportedly 1 year. | Connection logs (BR-060). | To confirm |
| DSA (EU 2022/2065) | Point of contact, clear terms, notice-and-action for every hosting service. Lighter duties for micro companies. Terms must describe automated moderation tools, and each decision must say whether automated means were used (art. 14, 17). | Contact page, terms, report flow (UC9), mention of AI triage (ADR-0010). | To confirm |
| Automated analysis of messages | Scanning private messages at scale likely requires an impact assessment (GDPR art. 35) and is hard to base on legitimate interest. Fully automated decisions with a significant effect are restricted (GDPR art. 22). | AI limited to reported content, human decides (ADR-0010). | To confirm |

This section is the living source for legal facts. ADRs keep the snapshot that motivated each decision,
with their sources (ADR-0004, ADR-0005, ADR-0010).

## 2. Personal data inventory

| Data | Where | Purpose | Legal basis (to confirm) | Retention (to confirm) |
|---|---|---|---|---|
| Pseudo, gender, age, city | Hub memory, socket attachment, client sessionStorage | Run the chat | Contract / legitimate interest | Session end |
| Messages | Hub memory | Run the chat | Contract | Room or window end |
| Away record: pseudo, rooms, windows, buffered private messages | Hub storage | Resume after a disconnect | Contract | 5 minutes max (ADR-0011) |
| IP, pseudo, connection times | Connection log | Legal obligation (LCEN) | Legal obligation | 1 year (BR-060) |
| Report: reason, excerpt, context lines, pseudos, AI triage | Moderation store | Moderation, DSA | Legal obligation / legitimate interest | 6 months after closing (BR-061) |
| Reported context with neutral labels | AI provider (processor) | Triage reports | Legitimate interest | Provider contract, no training on data |
| Ban: keyed IP hash, pseudo, end | Moderation store | Enforce expulsions | Legitimate interest | 30 days after end (BR-062) |
| Moderator name, credential id, public key; hashed invitations | Moderator store | Authenticate moderators | Legitimate interest | Until revoked; invitations 24 h |
| Resume token | Client sessionStorage, hash in hub | Resume session | Contract | 5 minutes max |

Never persisted: gender, age, city, message content outside report excerpts and away buffers.
No analytics, no ads, no third-party trackers, no cookies other than strictly necessary ones.

## 3. Threat model (STRIDE, V1)

| Threat | Example | Mitigation |
|---|---|---|
| Spoofing | Impersonating a moderator | Passkeys (ADR-0008), reserved words in pseudos (BR-003). |
| Spoofing | Stealing a session | Resume token random 128 bits, rotated at each resume (BR-014), sessionStorage only. |
| Tampering | Forged protocol messages | Server validates every message against the protocol schema, domain re-checks rules. |
| Repudiation | Moderator denies an expel | Moderator name and time recorded (BR-055). |
| Information disclosure | XSS through messages or smileys | Text only rendering, smiley whitelist (BR-022), strict Content-Security-Policy. |
| Information disclosure | Reversing banned IPs | HMAC with a server secret, not a plain hash. |
| Denial of service | Flood, entry spam | Flood limit (BR-021), entry limit (BR-007), report limit (BR-052), message size (BR-020). |
| Elevation of privilege | Calling moderator actions as a chatter | Domain authorisation check on every moderation command (BR-054). |

## 4. Security controls checklist (ASVS level 1 targets)

- HTTPS only, HSTS, secure headers (CSP, frame-ancestors none, referrer-policy).
- Origin check on WebSocket upgrade.
- Input validation at the protocol boundary and in the domain.
- Secrets (HMAC key, owner invitation secret) in Wrangler secrets, never in the repo.
- Dependencies: Dependabot, CodeQL from brick 2, Gitleaks already active.

## 5. Legal pack to produce before public launch (brick 9)

- Legal notice (mentions légales) with publisher and host.
- Terms of use: 18+, behaviour rules, moderation, bans.
- Privacy notice: the inventory above with confirmed retention periods.
- DSA contact point and report procedure description.
