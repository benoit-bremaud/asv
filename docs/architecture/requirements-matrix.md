# Requirements matrix — asv

Maps needs to decisions and acceptance criteria. Functional requirements (F) trace to use cases,
non-functional requirements (NF) to quality goals. Business rules referenced as BR-xxx live in
[business-rules.md](business-rules.md).

## Functional

| ID | Need | Decision | Use cases | Acceptance criteria | Priority |
|---|---|---|---|---|---|
| ASV-F-001 | Enter without an account | Session pseudo (ADR-0005) | UC1 | A visitor chats less than 30 s after landing, no e-mail asked. | V1 |
| ASV-F-002 | Adults only | Self-declared 18+ (ADR-0004) | UC1 | Entry refused if box unticked or declared age < 18. | V1 |
| ASV-F-003 | Show who is who at a glance | Pink / blue / grey pseudos (ADR-0006) | UC3, UC7 | Every pseudo in lists and messages is coloured from the session gender. | V1 |
| ASV-F-004 | Show age and city like Caramail | Self-declared profile | UC3, UC7 | Member lists show pseudo, age, city. | V1 |
| ASV-F-005 | Find a room | Room list with counts | UC2 | Rooms listed with name, kind and live member count. | V1 |
| ASV-F-006 | Chat in a room | Broadcast in the hub | UC3, UC4 | A message reaches all room members who do not ignore the author. | V1 |
| ASV-F-007 | Create a room for friends | Ephemeral user rooms (BR-030) | UC5 | A user room appears in the list and disappears when empty. | V1 |
| ASV-F-008 | Talk privately to a stranger | Private windows | UC6 | A private window opens on both sides with the first message (both need an account, F-020). | V1 |
| ASV-F-009 | Find people near me | Search by pseudo or city | UC7 | A query of 2+ characters returns at most 50 connected or away chatters whose pseudo contains it or whose city matches, case and accent insensitive. | V1 |
| ASV-F-010 | Get rid of a pest | Ignore | UC8 | Ignored chatter's messages and DMs are hidden for the rest of the session. | V1 |
| ASV-F-011 | Flag abuse | Report with reason and excerpt | UC9 | A report is persisted and visible to moderators. | V1 |
| ASV-F-012 | Remove an abuser | Expel with timed ban | UC11 | Expelled chatter is disconnected and refused entry while the ban matches their IP hash or pseudo. A changed IP and pseudo escape the ban (V1 limit, ADR-0005). | V1 |
| ASV-F-013 | Handle reports | Report list | UC12 | Moderator sees open reports and closes them with an outcome. | V1 |
| ASV-F-014 | Survive phone pauses | 5-minute away grace (ADR-0009) | UC13 | After a disconnect under 5 min, the chatter resumes with pseudo, rooms, windows and buffered DMs. | V1 |
| ASV-F-015 | Add trusted moderators | One-time invitation + passkey (ADR-0008) | UC14, UC15 | An invited moderator registers a passkey within 24 h. | V1 |
| ASV-F-016 | Moderate safely | Passkey sign-in (ADR-0008) | UC16 | Only a valid passkey assertion grants moderator rights. | V1 |
| ASV-F-017 | Leave cleanly | Leave action | UC10 | Leaving frees the pseudo and notifies rooms and open windows. | V1 |
| ASV-F-018 | Smileys like back then | Typed codes rendered from a whitelist (BR-022) | UC4, UC6 | Known codes render as images, unknown codes stay as text, never as HTML. | V1 |
| ASV-F-019 | Handle the most urgent reports first | AI triage of reported content only (ADR-0010) | UC9, UC12 | Reports are listed by AI urgency. The AI never sanctions. Without AI, urgency is "unknown". | V1 |
| ASV-F-020 | Talk privately only with accountable people | Private messages need a verified e-mail account (ADR-0012) | UC6, UC17 | A chatter without an account cannot open or receive a private message. | V1 |
| ASV-F-021 | Sign in without a password | Six-digit e-mail code, device remembered 30 days (ADR-0013) | UC17 | A member signs in by typing one code and is recognised on that device for 30 days. | V1 |
| ASV-F-022 | Stop repeat offenders | Three strikes, then 7-day suspension with e-mail block (ADR-0012) | UC12, UC11 | At the third active strike the moderator confirms; the same e-mail cannot create an account for 7 days. | V1 |
| ASV-F-023 | Know why I was sanctioned | Statement of reasons by e-mail (DSA art. 17) | UC11, UC12 | Every suspension or deletion by a moderator e-mails the facts, the rule, AI use and redress. | V1 |
| ASV-F-024 | Control my account | Sign out of a device or everywhere, delete the account | UC18, UC19 | Each action takes effect immediately and closes private windows. Deletion writes the legal retention record to the vault in the same transaction (BR-081). | V1 |

## Non-functional

| ID | Quality | Target | Verification |
|---|---|---|---|
| ASV-NF-001 | Latency | Message delivered to room members in < 300 ms p95 in the same region. | Load test on staging. |
| ASV-NF-002 | Capacity | 300 concurrent chatters on one hub without degradation (ADR-0007). | Load test, hub CPU metrics. |
| ASV-NF-003 | Cost | Fits the Cloudflare Workers Free plan at expected traffic (ADR-0002). | Monthly usage dashboard. |
| ASV-NF-004 | Accessibility | WCAG 2.2 AA, including colour contrast of pseudo colours. | axe audit + manual keyboard test. |
| ASV-NF-005 | Browsers | Last 2 versions of Chrome, Firefox, Safari, Edge, and iOS Safari / Android Chrome. | Manual matrix before release. |
| ASV-NF-006 | Mobile first | Usable from 360 px wide, private windows as stacked panels on phones. | Manual test on phone widths. |
| ASV-NF-007 | Security | OWASP ASVS level 1 on the exposed surface. | Security review per brick. |
| ASV-NF-008 | Privacy | Only the data listed in `security-and-rgpd.md` §2 is persisted (connection and content logs, reports, bans, accounts, hashes, moderator credentials, 5-minute away records, the legal vault of closed accounts: ADR-0014). | Data-flow diagrams + code review. |
| ASV-NF-009 | Portability | Domain runs unchanged on Node and Workers (ADR-0002). | Same test suite on both transports. |
| ASV-NF-010 | Testability | Domain logic covered by fast unit tests without network. | Coverage report on `src/domain`. |
| ASV-NF-011 | Resilience | Client reconnects automatically with backoff after a network drop. | Manual test with airplane mode. |
| ASV-NF-012 | Language | UI in French first, strings centralised for later translation. | Code review. |
