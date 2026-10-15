# Glossary — asv

| Term | Meaning |
|---|---|
| ASV | "Âge, sexe, ville": the ritual opener of Caramail private chats, and the product name. |
| AI triage | Automatic categorisation and urgency ranking of reported content. Never sanctions (ADR-0010). |
| Away | Session state after a disconnection, up to 5 minutes, before closing (ADR-0009). |
| Away record | Minimal stored copy of an away session, without gender, age or city (ADR-0011). |
| Ban | Timed refusal of entry for a keyed IP hash and a pseudo. |
| Chatter | A visitor who entered with a pseudo and has a session. |
| Connection log | Legal record of IP, pseudo and connection times (LCEN). |
| Hub | The single object holding all sessions, rooms and private conversations (ADR-0007). In-memory on Node, a Durable Object on Cloudflare. |
| Ignore | Hiding another chatter's messages for the rest of one's session. |
| Member | The identity behind a session. Ephemeral in V1, persistent in V2. |
| Moderator | A chatter signed in with a passkey, allowed to handle reports and expel. |
| Moderator grant | Signed single-use token, valid 60 seconds, that turns an entry into a moderator entry (ADR-0008). |
| Official room | A themed or regional room defined in configuration. |
| Passkey | WebAuthn credential on the moderator's device, unlocked by fingerprint, face or PIN. |
| Private window | A one-to-one conversation shown in its own panel. |
| Pseudo | The chosen display name, unique among live sessions. |
| Report | A chatter's notice about a chatter, a message or a room. |
| Resume token | Secret given at entry, used to resume an away session. Rotates at each resume. |
| Session | A chatter's live presence: profile, gender, ignore list, rooms, windows. |
| Transport | Runtime adapter around the domain: Node (dev, tests) or Cloudflare (production). |
| User room | A room created by a chatter, deleted when empty. |
| Visitor | Someone on the entry screen who has no session yet. |
