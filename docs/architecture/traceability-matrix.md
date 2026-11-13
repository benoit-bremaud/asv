# Traceability matrix — asv

Links requirements to use cases and every use case to its realisations. All paths are relative to
`docs/architecture/diagrams/`. "Spec" means the textual use-case spec is enough (plain read or write).

## Use cases

| UC | Name | Requirements | Business rules | Sequence | Classes | State | Data flow |
|---|---|---|---|---|---|---|---|
| UC1 | Enter the chat with a pseudo | F-001, F-002, F-003, F-004 | BR-001 to BR-008, BR-090 | entry/02a | entry/04, entry/07, moderation/04 (Ban) | entry/05 | entry/06 |
| UC2 | Browse rooms | F-005 | BR-033 | Spec | rooms/04, rooms/07 | — | — |
| UC3 | Join a room | F-003, F-004, F-006 | BR-023, BR-024 | rooms/02 | rooms/04, rooms/07 | rooms/05 | — |
| UC4 | Post a message in a room | F-006, F-018 | BR-020 to BR-022, BR-090 | rooms/02 | rooms/04, rooms/07 | — | — |
| UC5 | Create a room | F-007 | BR-030 to BR-032 | Spec (same path as rooms/02) | rooms/04, rooms/07 | rooms/05 | — |
| UC6 | Open a private conversation | F-008, F-020 | BR-013, BR-020, BR-021, BR-090, BR-040, BR-041, BR-043 | private-conversations/02 | private-conversations/04, private-conversations/07 | private-conversations/05, web-ui/07 | — |
| UC7 | Find a chatter by pseudo or city | F-009 | BR-006, BR-042 | Spec | entry/04, directory/07 | web-ui/07 | directory/06 |
| UC8 | Ignore a chatter | F-010 | BR-042, BR-044 | rooms/02, private-conversations/02 | private-conversations/04, private-conversations/07 | web-ui/07 | — |
| UC9 | Report a chatter, a message or a room | F-011, F-019 | BR-050 to BR-052 | moderation/02a | moderation/04 | moderation/05, web-ui/08 | moderation/06 |
| UC10 | Leave the chat | F-017 | BR-015 | entry/02b (same closing steps) | entry/04, entry/07, rooms/07 | entry/05 | entry/06 |
| UC11 | Expel a chatter | F-012, F-022, F-023 | BR-053 to BR-055, BR-076 to BR-078, BR-080, BR-081 | moderation/02a, moderation/02d | moderation/04, accounts/04 | entry/05, rooms/05, accounts/05 | moderation/06, accounts/06 |
| UC12 | Review reports | F-013, F-019, F-022 | BR-054, BR-055, BR-057, BR-074, BR-075 | moderation/02a, moderation/02d | moderation/04, accounts/04 | moderation/05, accounts/05, web-ui/08 | moderation/06 |
| UC13 | Resume my session after a disconnection | F-014 | BR-010 to BR-015, BR-090 | entry/02b | entry/04, entry/07, rooms/07 | entry/05 | entry/06 |
| UC14 | Invite a moderator | F-015 | BR-056, BR-093 | moderation/02b, moderation/02f | moderation/04 | — | moderation/06 |
| UC15 | Enroll as moderator | F-015 | BR-056, BR-094, BR-097 | moderation/02b, moderation/02f | moderation/04 | web-ui/09 | moderation/06 |
| UC16 | Sign in as moderator | F-016 | BR-054, BR-095, BR-096 | moderation/02c, moderation/02f | moderation/04 | web-ui/09 | — |
| UC16i | Enter with the interim moderator token (brick 8a, removed by 8b) | F-016 | BR-054, BR-091 | moderation/02e | moderation/04, platform/04 | web-ui/08 | — |
| UC17 | Sign in with an e-mail code | F-020, F-021 | BR-070 to BR-073, BR-077, BR-080, BR-081, BR-083, BR-087 | accounts/02 | accounts/04, platform/04d | accounts/05, web-ui/06 | accounts/06 |
| UC18 | Sign out of this device or everywhere | F-024 | BR-073 | Spec | accounts/04, platform/04d | web-ui/06 | accounts/06 |
| UC19 | Delete my account | F-024 | BR-080 to BR-083 | Spec | accounts/04, platform/04d | accounts/05, web-ui/06 | accounts/06 |

## Structural and cross-cutting studies

| Study | Covers |
|---|---|
| platform/02-sequence-node-transport | Node socket life cycle, client IP behind the tunnel (BR-085), Origin, frame cap, heartbeat, tick (brick 7a, NF-011) |
| platform/03-component | Dependency rule, transports, ports (NF-009, NF-010) |
| platform/04-class-protocol | WebSocket contract and payloads for every chat use case |
| platform/04c-class-server-hub | Transport-neutral hub, effect mapping, connection log port and file log (BR-060, BR-084) |
| platform/04b-class-hub-state | Hub aggregate and its rebuild after hibernation (ADR-0011) |
| platform/05-state-hub | Hibernation, alarm, eviction, link to UC13 |
| platform/07-deployment | Environments, secrets, tester tunnel and log file (NF-003, ADR-0018, BR-084, BR-085) |
| platform/08-ci-pipeline | Checks before merge, local SonarQube gate (NF-009, NF-010) |
| web-ui/03-component | Front-end modules (NF-004 to NF-006, NF-011, NF-012) |
| web-ui/04-class-client-state | Client reducer, connection manager, renderer, entry and rooms screens (BR-022, NF-004, NF-011, brick 7a) |
| web-ui/05-state-navigation | Legal pages (ADR-0018); screens for UC1, UC2, UC3, UC6, UC7, UC10, UC12, UC13, UC16 |
| web-ui/06-state-account-panel | Account dialog, modal (UC17 to UC19, #63) |
| web-ui/07-state-private-and-search | Pseudo menu, private windows and the search dialog of a room, modal (UC6 to UC8, BR-040 to BR-044, #111) |
| web-ui/09-state-moderator-sign-in | Moderator sign-in link and enrolment page (UC15, UC16, BR-094, BR-095) |
| web-ui/08-state-report-and-queue | Report dialog and moderator queue dialog, modal (UC9, UC11, UC12, UC16i, BR-050 to BR-055, BR-074, BR-075, BR-092) |

## Tester exposure (ADR-0018, issue #54)

| Rule | Realised in | Issues |
|---|---|---|
| BR-084 file log and file vault | platform/04c, platform/07 | #54 |
| BR-085 client IP behind the tunnel | platform/02, platform/07 | #54 |
| BR-086 security headers, `Secure` cookie | platform/07, `security-and-rgpd.md` §4 | #48, #50, #69 |
| BR-087 code step kept across a resume | web-ui/06, ADR-0011 amendment | #72 |
| BR-088 frame budget and invalid-frame close per socket | platform/02, platform/04c | #89 |
| BR-089 upgrade limits per IP and in total, unbound socket close | platform/02, platform/04c | #23 |
| Legal pages | web-ui/05, `docs/product/legal-pages-draft.md` | #54 |

## Coverage check

- Every functional requirement F-001 to F-024 maps to at least one use case.
- Every use case has a spec, and a sequence when it crosses components with branches.
- Non-functional requirements map to platform, web-ui, `security-and-rgpd.md` and `test-strategy.md`.
- Every user journey maps to use cases and business rules in [`qa/test-plan.md`](qa/test-plan.md), with the last QA evidence of each case.
