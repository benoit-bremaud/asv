# Caramail — reference research for asv

Research done 2026-10-15. Goal: gather what the Caramail chat really was, to draw on it freely for asv.
Sources are listed at the end. Testimonies are unverified memories; they are marked as such.

## 1. Timeline

| Date | Event |
|---|---|
| Oct 1997 | Launched by the Lokace founders (Orianne Garcia, Alexandre Roos, Christophe Schaming + 3 partners). Name = pun on "caramel". |
| Feb 1999 | ~500,000 users, "first French-speaking community". |
| Sep 1999 | Failed migration, one-week outage. |
| Oct 1999 | ~1.2 million accounts. |
| 2000 | Sold to Spray (150 MF), then absorbed by Lycos Europe. |
| 2003 | Peak: ~28 M accounts, 30–50k simultaneous chatters in the evening (sources disagree). |
| 2004 | Reduced to a tab on the Lycos portal; chat replaced by a Lycos chat, traffic falls to ~3–7k. |
| 27 Jan 2005 | Original chat shut down after 8 years. |
| 15 Feb 2009 | Accounts deleted; domain sold to United Internet (GMX). |
| 2017–today | JuneLive.net, a fan replica by Nicolas Quenault, reproduces the chat (2005 version in HTML5). |

## 2. What the chat was

**Confirmed by several sources**
- IRC-like text chat with graphical buttons for common actions: private message, ignore, enter a room.
- Pseudo-only identity. Several pseudos ("alias") could be saved on one account.
- Public themed rooms, private rooms, and user-created rooms.
- Private conversations opened in their own small rectangular window.
- Connected-users list per room, with each user's **age and city** displayed (self-declared, roleplay allowed).
- Search for people by pseudo **or by city** ("trouver quelqu'un près de chez soi"). Its loss after the redesign was a major complaint.
- Friends list and ignore list. "Ignore" was the main defence against trolls.
- Smileys inserted by typing codes, including small images (tree, Santa, rainbow) and some notoriously vulgar ones.
- **Blue for men, pink for women**: recalled by several users ("mec en bleu, femmes en rose", "les hommes en bleu et les femmes en rose"). Wikipedia does not document it, but the testimonies agree.

**Room examples recalled by users**
- Thematic: Cinéma, Informatique, Ésotérisme, Poésie, Philosophie, Jeux vidéo, Animaux, Love, Spleen, Rock Underground, RolePlay.
- Geographic: Belgique, Perpignan, "LES VIENNOIS SONT ICI".
- Age-based: Ados / 10–18 ans, "18-??".
- Cult room: **Château d'O**, codified roleplay with ranks and serialized stories.
- User rooms: "ronde et jolie", "mi ange, mi démon". A user room stayed open only while at least one person was connected.

**Culture and rituals**
- "ASV ?" = âge / sexe / ville, the standard opener in private.
- Users called themselves "caraméliens"; "lol" spread from there.
- Regulars, clans, invisible hierarchies, real-life meetups ("soirées des chatteurs de notre ville"), couples formed there.
- Pranks and fake personas, exaggerated cyber-flirting.
- Late nights: "nuits blanches" on the chat.

**What users loved**
- "Interface simple mais fonctionnelle, pratique et claire": you understood the conversation on arrival.
- Meeting strangers who became friends or partners.
- Feeling of a huge crowd (tens of thousands online).

**What users hated (to avoid)**
- Pop-up ads, slowness, instability.
- Spam rooms for dating and download sites.
- Harassment of women in some rooms.
- Word-filter robots that were too aggressive ("des robots limant les mots libres").
- The Lycos redesign: complex "bateau à étages" navigation, lost city search, webcam prompts, ads everywhere.

## 3. Visual identity (from Wayback Machine captures)

- **1999 homepage**: 3-column table layout, Caramail logo top-left (bold black lettering in a red ring), orange left column, cream centre with login form "Compte / Mot de passe / Entrer", pale-blue right column, magenta banner ad. Link "Créez votre compte gratuit" in red.
- **Late 1999 – 2000 homepage**: red/cream circle with a blue swoosh holding the login form, black curved band, lavender left column, curved text "Nouveau ?" and "Créez votre compte gratuit !", footer "Tous droits réservés".
- The chat itself was behind login (Java applet) and is not archived.

Captures:
- https://web.archive.org/web/19990508135140/http://www7.caramail.com/
- https://web.archive.org/web/19991129021626/http://www16.caramail.com/
- https://web.archive.org/web/20001218011100/http://www21.caramail.com/

## 4. What asv takes from it

**Keep (the soul)**
- Pseudo only, no photo. Age and city self-declared and shown next to the pseudo.
- Pink/blue pseudo colours (plus grey for "not specified", ADR-0006).
- Themed and geographic public rooms, plus user-created rooms that vanish when empty. No age-band
  rooms: asv is adults only (ADR-0004).
- Private conversations in their own small window, opened from the user list.
- Ignore button, always one click away.
- Search by pseudo or city.
- Smileys typed as codes, rendered as small pixel images.
- Late-90s look: table-like 3-column layout, logo in a ring, cream/lavender/orange/red palette, bevelled buttons.

**Fix (what hurt back then)**
- No ads, no pop-ups, no webcam.
- Minimal, transparent moderation: anti-flood, report, ignore. No opaque word robots.
- Protect against harassment by default: one-click ignore and report. Restricting DMs to people in
  the same room was considered and not kept: DMs can reach any connected chatter, as in Caramail
  (search by city depends on it).
- Adults only, no minors' rooms (ADR-0004).

**Questions raised by the research — resolved**
- Adults only (18+) or a minors' room? Resolved: 18+ self-declared (ADR-0004).
- Persistent pseudos (account) or session-only? Resolved: session in V1, accounts in V2 (ADR-0005).
- Strictly pink/blue or a third colour? Resolved: pink / blue / grey, gender optional (ADR-0006).

## Sources

- [Wikipedia — CaraMail](https://fr.wikipedia.org/wiki/CaraMail)
- [Arobase.org — L'histoire de Caramail](https://www.arobase.org/gratuit/caramail-histoire.htm)
- [Arobase.org — Caramail : vos témoignages](https://www.arobase.org/gratuit/caramail-temoignages.htm)
- [HardWare.fr — le nouveau chat de caramail](https://forum.hardware.fr/hfr/Discussions/Societe/nouveau-chat-caramail-sujet_45499_1.htm)
- [Team Azerty — Fin du chat caramail](https://www.team-azerty.com/2005/01/23/actu-110-fin-du-chat-caramail.html)
- [Smail.fr — Caramail Chat](https://www.smail.fr/dossiers/caramail-chat)
- [Phonandroid — CaraMail renaît de ses cendres](https://www.phonandroid.com/caramail-renait-cendres-developpeur-replique-du-site-origine.html)
- [JuneLive — feuille de route](https://www.junelive.net/JuneLiveProject/FeuilleDeRoute.jsp)
- [RTBF — Retour sur la folle histoire de Caramail](https://www.rtbf.be/article/retour-sur-la-folle-histoire-de-caramail-video-10669175)
- Wayback Machine captures listed in section 3.
