# User journeys — asv

Narrative scenarios that the use cases must support. Use case ids refer to the feature studies
under `docs/architecture/diagrams/`.

## J1 — An evening on asv (Nathalie)

1. 21:10, Nathalie opens asvchat.fr on her phone. The retro home page asks "âge ? sexe ? ville ?".
2. She types "nath_lune", picks woman, 44, Lyon, ticks "I am 18 or older" and enters (UC1).
3. The room list shows "Poésie (7)", "Lyon (12)", "Ciné (4)"... She joins "Lyon" (UC2, UC3).
4. Her pink pseudo appears in the member list. She says "slt tlm" (UC4).
5. "bob_69" opens a private window with "asv ?". She clicks ignore (UC8), he disappears for her.
6. She searches for people in Lyon (UC7) and wants to write to "jazz_lyon". Private messages need an
   account: she types her e-mail, then the six-digit code she receives, and this phone is remembered 30 days (UC17).
   She opens a private window with "jazz_lyon" (UC6).
7. Her phone locks while she answers a text. Her pseudo shows "away" for others (ADR-0009).
8. Two minutes later she unlocks the phone: the chat resumes, the message from "jazz_lyon" is
   waiting (UC13).
9. 23:40 she clicks "leave" (UC10).

## J2 — A room among friends (Karim)

1. Karim enters and creates the room "Les Viennois sont ici" (UC5).
2. He tells two friends the room name. They find it in the room list, join, post smileys, banter.
3. At 01:00 the last one leaves, the room disappears (BR-032).

## J3 — Handling a report (Marc)

1. Léa reports "troll_x" for harassment. Her client attaches the last lines she saw (UC9).
2. The AI triage marks the report "harassment, high urgency" with a one-line summary (ADR-0010).
3. Marc enters asv, uses "Moderator sign-in" and unlocks his phone with its PIN (UC16).
4. The report is at the top of his list (UC12). He reads the context and expels "troll_x" for 24 hours (UC11).
5. "troll_x" sees "You have been expelled" and his connection closes. Others see "troll_x left".
6. Had Marc chosen "warned" instead, "troll_x"'s account would get a strike. At the third active strike,
   Marc confirms a 7-day suspension and "troll_x" receives the reasons by e-mail (ADR-0012).

## J4 — Becoming a moderator (Marc and Benoît)

1. Benoît runs the invitation script for "Marc" (UC14) and sends him the one-time link.
2. Marc opens it within 24 hours and registers a passkey with his phone (UC15).
3. From now on he can sign in as moderator (UC16).
