# Traceability matrix — asv

Every use case maps to its realization. "Text" means the use-case spec in
`diagrams/chat-core/01-use-case.md` is enough (simple read or write). Components refer to
`diagrams/chat-core/03-component.md`.

| Use case | Sequence | Components | Classes | State | Data flow |
|---|---|---|---|---|---|
| UC1 Enter the chat with a pseudo | Text | Routes, Hub, Domain, ConnectionLogStore | Member, Session, Pseudo, Profile, Gender, Ban, ConnectionLog | Anonymous → Connected / Refused | pseudo, gender, age, city, IP |
| UC2 Browse rooms | Text | Hub, Domain | Room, RoomKind | Connected / InRoom | — |
| UC3 Join a room | 02a | Hub, Domain | Room, Session | Connected → InRoom | pseudo, colour, age, city to others |
| UC4 Post a message in a room | 02a | Hub, Domain | Message, Session | InRoom | messages |
| UC5 Create a room | Text | Hub, Domain | Room (user) | Connected / InRoom | — |
| UC6 Open a private conversation | 02b | Hub, Domain | PrivateConversation, Message | Connected / InRoom | messages |
| UC7 Find a chatter by pseudo or city | Text | Hub, Domain | Member, Session, Profile | Connected / InRoom | pseudo, city |
| UC8 Ignore a chatter | 02a, 02b | Hub, Domain | Session (IgnoreList) | Connected / InRoom | — |
| UC9 Report a chatter, a message or a room | 02c | Hub, Domain, ReportStore | Report | Connected / InRoom | excerpt, author pseudo |
| UC10 Leave the chat | Text | Hub, Domain, ConnectionLogStore | Session, ConnectionLog | → Closed | IP log closed |
| UC11 Expel a chatter | 02c | Hub, Domain, ReportStore | Ban | → Expelled | keyed IP hash, pseudo |
| UC12 Review reports | 02c | Hub, Domain, ReportStore | Report | — | excerpt to moderator |
