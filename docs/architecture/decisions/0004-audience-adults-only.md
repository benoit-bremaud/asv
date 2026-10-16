# ADR-0004 — Adults only (18+), self-declared

- Status: accepted
- Date: 2026-10-15
- Deciders: Benoît Bremaud

## Context

asv puts strangers in contact, with private messages. Caramail had a teen room. Harassment and
grooming are the main threats to such a product. Target audience: people who knew Caramail,
today aged 35–50.

### Legal context (unverified, not legal advice)

Gathered from web sources on 2026-10-15. Each point must be confirmed on the official text before
public launch.

- No age verification seems mandatory in France today:
  - the 2023 "Marcangeli" law (digital majority at 15) reportedly never got its implementing decree
    ([Sénat file](https://www.senat.fr/dossier-legislatif/ppl22-389.html),
    [NosParlementaires](https://nosparlementaires.fr/actualites/reseaux-sociaux-15-ans-deux-lois-zero-application));
  - the July 2026 under-15 social-network law was reportedly struck down by the Conseil
    constitutionnel on 2026-08-14 (same NosParlementaires source, to confirm on conseil-constitutionnel.fr).
- GDPR consent age in France is 15, Loi Informatique et Libertés art. 45 (unverified, brick 1 bis)
  ([CNIL recommendation 4](https://cnil.fr/fr/recommandation-4-rechercher-le-consentement-dun-parent-pour-les-mineurs-de-moins-de-15-ans)).
- The DSA applies to every hosting service, with lighter duties for micro and small companies:
  point of contact, clear terms, notice-and-action
  ([DSA guide for micro and small companies](https://concurrence.public.lu/dam-assets/fr/publications/documents-information/digital-services-act/guide-dsa-micro-et-petites-entreprises.pdf)).

## Options and MCDA

Scores 0–5. Criteria: legal/criminal risk 35, moderation load 25, nostalgic core audience 25,
Caramail spirit 15.

| Option | Legal | Moderation | Audience | Spirit | Total /500 |
|---|---|---|---|---|---|
| **A. 18+ self-declared** | 4 | 4 | 5 | 4 | **425** |
| C. 18+ verified by a third party | 5 | 4 | 3 | 1 | 365 |
| B. Open with a separate teen room | 1 | 1 | 3 | 5 | 210 |

- A: the rule is clear and the lie is on the user, light friction.
- C: strongest protection, but identity checks kill the anonymous retro spirit.
- B: requires watertight adult/minor separation and parental consent under 15.

Sensitivity (legal 50, moderation 20, audience 20, spirit 10): A 420, C 400.

## Decision

18+ only. Entry requires ticking "I am 18 or older" and accepting the terms. A declared age under 18
is refused. Users can report a member who seems to be a minor, and moderators can expel them.

## Revisit — teen space (2026-10-15, same day)

The owner asked whether 18+ is too restrictive, since the retro vibe also appeals to younger people.
Further research: Yubo, the French teen network, used Yoti facial age estimation, separated minors from
adults, and ran 24/7 human + AI moderation, yet grooming by adults posing as teens was reported, and its
minimum age reportedly moved from 13 to 18 (unverified,
[Internet Matters](https://www.internetmatters.org/advice/apps-and-platforms/social-media/yubo/)).
With a self-declared age, a teen space is a hunting ground for adults who lie about their age.

Scores 0–5. Criteria: minors' safety and criminal risk 35, moderation load 25, audience size 20,
Caramail spirit 10, V1 simplicity 10.

| Option | Safety | Moderation | Audience | Spirit | Simplicity | Total /500 |
|---|---|---|---|---|---|---|
| **D. 18+ in V1, teen space designed in V2** | 4 | 4 | 4 | 3 | 4 | **390** |
| A. 18+ for good | 4 | 4 | 3 | 3 | 5 | 380 |
| B. 15+ with separate spaces in V1 | 2 | 2 | 5 | 4 | 2 | 280 |
| C. 15+ mixed | 1 | 1 | 5 | 5 | 4 | 250 |

Sensitivity (safety 20, moderation 25, audience 35, spirit 10, simplicity 10): D 390, B 325.

**Outcome**: V1 stays 18+. A teen space is a V2 candidate, to be designed only with real age
verification, strict separation from adults (no private messages across), AI scanning of conversations
(ADR-0010 option C, with an impact assessment) and an experienced moderation team.

## Consequences

- No minors' room, no parental consent flow in V1.
- Terms of use and a report mechanism are mandatory before public launch (DSA).
- **Legal check pending** on every point above before public launch.
- Revisit if a French age-verification obligation for chat services comes into force.
