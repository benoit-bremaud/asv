# Traceability matrix — asv

Links requirements to use cases and every use case to its realisations. All paths are relative to
`docs/architecture/diagrams/`. "Spec" means the textual use-case spec is enough (plain read or write).

## Use cases

| UC | Name | Requirements | Business rules | Sequence | Classes | State | Data flow |
|---|---|---|---|---|---|---|---|
| UC1 | Enter the chat with a pseudo | F-001, F-002, F-003, F-004 | BR-001 to BR-008 | entry/02a | entry/04, moderation/04 (Ban) | entry/05 | entry/06 |
| UC2 | Browse rooms | F-005 | BR-033 | Spec | rooms/04 | — | — |
| UC3 | Join a room | F-003, F-004, F-006 | BR-023 | rooms/02 | rooms/04 | rooms/05 | — |
| UC4 | Post a message in a room | F-006, F-018 | BR-020 to BR-022 | rooms/02 | rooms/04 | — | — |
| UC5 | Create a room | F-007 | BR-030 to BR-032 | Spec (same path as rooms/02) | rooms/04 | rooms/05 | — |
| UC6 | Open a private conversation | F-008, F-020 | BR-013, BR-020, BR-021, BR-040, BR-041, BR-043 | private-conversations/02 | private-conversations/04 | — | — |
| UC7 | Find a chatter by pseudo or city | F-009 | BR-006 | Spec | entry/04 | — | directory/06 |
| UC8 | Ignore a chatter | F-010 | BR-042 | rooms/02, private-conversations/02 | private-conversations/04 | — | — |
| UC9 | Report a chatter, a message or a room | F-011, F-019 | BR-050 to BR-052 | moderation/02a | moderation/04 | moderation/05 | moderation/06 |
| UC10 | Leave the chat | F-017 | BR-015 | entry/02b (same closing steps) | entry/04 | entry/05 | entry/06 |
| UC11 | Expel a chatter | F-012, F-022, F-023 | BR-053 to BR-055, BR-076 to BR-078, BR-080, BR-081 | moderation/02a, moderation/02d | moderation/04, accounts/04 | entry/05, rooms/05, accounts/05 | moderation/06, accounts/06 |
| UC12 | Review reports | F-013, F-019, F-022 | BR-054, BR-055, BR-057, BR-074, BR-075 | moderation/02a, moderation/02d | moderation/04, accounts/04 | moderation/05, accounts/05 | moderation/06 |
| UC13 | Resume my session after a disconnection | F-014 | BR-010 to BR-015 | entry/02b | entry/04 | entry/05 | entry/06 |
| UC14 | Invite a moderator | F-015 | BR-056 | moderation/02b | moderation/04 | — | moderation/06 |
| UC15 | Enroll as moderator | F-015 | BR-056 | moderation/02b | moderation/04 | — | moderation/06 |
| UC16 | Sign in as moderator | F-016 | BR-054 | moderation/02c | moderation/04 | — | — |
| UC17 | Sign in with an e-mail code | F-020, F-021 | BR-070 to BR-073, BR-077, BR-080, BR-081 | accounts/02 | accounts/04 | accounts/05 | accounts/06 |
| UC18 | Sign out of this device or everywhere | F-024 | BR-073 | Spec | accounts/04 | — | accounts/06 |
| UC19 | Delete my account | F-024 | BR-080 to BR-082 | Spec | accounts/04 | accounts/05 | accounts/06 |

## Structural and cross-cutting studies

| Study | Covers |
|---|---|
| platform/03-component | Dependency rule, transports, ports (NF-009, NF-010) |
| platform/04-class-protocol | WebSocket contract and payloads for every chat use case |
| platform/04b-class-hub-state | Hub aggregate and its rebuild after hibernation (ADR-0011) |
| platform/05-state-hub | Hibernation, alarm, eviction, link to UC13 |
| platform/07-deployment | Environments, secrets, NF-003 |
| web-ui/03-component | Front-end modules (NF-004 to NF-006, NF-011, NF-012) |
| web-ui/05-state-navigation | Screens for UC1, UC2, UC3, UC6, UC7, UC10, UC12, UC13, UC16 |

## Coverage check

- Every functional requirement F-001 to F-024 maps to at least one use case.
- Every use case has a spec, and a sequence when it crosses components with branches.
- Non-functional requirements map to platform, web-ui, `security-and-rgpd.md` and `test-strategy.md`.
