# Vision — asv

## Problem

Today's social apps are built around photos, profiles and algorithms. The simple pleasure of the
late-90s web chat is gone: walk into a room with a pseudo, chat with strangers about anything, and
sometimes start a private conversation that turns into a friendship.

## Promise

> asv brings back the Caramail chat: a pseudo, a colour, a room, and nothing else.

## Target

Adults who knew Caramail and the French-speaking web chats of 1997–2005, today aged 35–50, plus
curious younger adults attracted by the retro vibe. See [personas](personas.md).

## Principles

1. **Pseudo only.** No photo, no profile page, no follower count.
2. **Instant.** From landing page to chatting in a room in under 30 seconds, no account. An e-mail account
   is asked only for private messages, where it protects people (ADR-0012).
3. **Faithful to the soul, not to the flaws.** Keep rooms, pink/blue pseudos, ASV, private windows.
   Drop pop-ups, ads, webcam prompts and opaque word robots.
4. **Safe by default.** Adults only, ignore in two clicks, human moderators helped by AI triage of reports.
5. **Light on data.** Nothing persisted beyond legal logs, reports, bans, member e-mails and strikes,
   moderator credentials, short-lived away records (ADR-0011) and the legal retention vault of closed
   accounts (ADR-0014).

## Success signals (V1)

- People come back the next evening (returning visitors).
- Rooms are alive: at least one room with several people at 21:00 on a weekday.
- Few reports per active chatter, and every report handled.
- Organic sharing among the target audience (nostalgia posts).

## Out of scope for V1

Passwords and profiles, message history, file or image sharing, webcam, mobile app, monetisation, a teen space
(V2 candidate, ADR-0004).
