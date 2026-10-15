# Design pack — asv

Visual direction for the web UI. Detailed screen flow: [web-ui study](diagrams/web-ui/).

## Direction

Late-90s French portal, as seen on the Caramail homepages of 1999–2000 (`docs/research/caramail.md` §3):
three-column table layout, logo in a red ring, cream, lavender and orange blocks, bevelled buttons,
small pixel smileys. Nostalgic, never parodic: readable and accessible on today's phones.

## Colour tokens

Contrast ratios computed with the WCAG formula on 2026-10-15.

| Token | Light | Dark | Use | Light on cream / lavender | Dark on night / dark panel |
|---|---|---|---|---|---|
| `--bg` | `#FFF8E7` cream | `#1B1B2F` night | Page background | — | — |
| `--panel` | `#E6E6FA` lavender | `#2A2A44` | Side columns | — | — |
| `--accent` | `#F2A23A` orange | `#F2A23A` | Headers, decoration only | not for text | not for text |
| `--brand` | `#B3261E` red | `#FF7A70` | Logo ring, primary buttons | 6.17 / 5.31 | 6.65 / 5.47 |
| `--text` | `#222222` | `#F2F2F2` | Body text | 15.03 / 12.93 | 15.07 / 12.40 |
| `--pseudo-woman` | `#B4236E` pink | `#FF8DC7` | Woman pseudos | 5.82 / 5.01 | 7.94 / 6.53 |
| `--pseudo-man` | `#1F4FA8` blue | `#8AB4FF` | Man pseudos | 7.23 / 6.22 | 8.08 / 6.64 |
| `--pseudo-unspecified` | `#5C5C66` grey | `#B8B8C4` | Unspecified pseudos | 6.24 / 5.37 | 8.59 / 7.07 |
| `--pseudo-woman-away` | `#8E4A6C` | `#D9A3BF` | Away woman pseudos | 5.93 / 5.10 | 7.99 / 6.57 |
| `--pseudo-man-away` | `#435E8E` | `#A7B9D9` | Away man pseudos | 6.14 / 5.28 | 8.51 / 7.00 |
| `--pseudo-unspecified-away` | `#5C5C64` | `#A9A9B3` | Away unspecified pseudos | 6.26 / 5.38 | 7.24 / 5.96 |

Every text token passes WCAG AA (4.5:1) on both backgrounds of its theme.

**Away style** (single source, referenced by ADR-0009): the pseudo uses its `-away` token, in italics,
followed by "(absent)". Colour is never the only cue.

## Typography

- Headings: a bold rounded sans for the logo feel (system fallback `Verdana, sans-serif`, the 2000s default).
- Body and chat: `Verdana, Tahoma, sans-serif`, 15 px minimum on mobile.
- Chat lines: `pseudo` bold in its colour, then the message in `--text`.

## Screens (wireframes)

```text
ENTRY                               ROOMS
+---------------------------+       +-----------------------------------+
| (asv)  âge ? sexe ? ville?|       | (asv)            nath_lune [quit] |
| pseudo [__________]       |       | Official rooms    | Search        |
| je suis  (o)F (o)H (o)-   |       |  Lyon (12)        | [city____] Go |
| âge [__]  ville [_______] |       |  Poésie (7)       |               |
| [x] j'ai 18 ans ou plus   |       |  Ciné (4)         |               |
| [ ENTRER ]                |       | User rooms        |               |
| Connexion modérateur      |       |  Les Viennois (3) | [+ create]    |
+---------------------------+       +-----------------------------------+

ROOM (desktop)                                   ROOM (phone)
+-----------------------------+---------------+  +------------------+
| # Lyon                      | Members (12)  |  | # Lyon   [12] [≡]|
| nath_lune: slt tlm          | nath_lune 44  |  | messages ...     |
| jazz_lyon: coucou :)        |  Lyon         |  |                  |
|                             | jazz_lyon 39  |  | [message___][>]  |
| [message______________][>]  |  Lyon (absent)|  | Private: jazz(1) |
+-----------------------------+---------------+  +------------------+
| Private windows: [jazz_lyon x] [bob x]       |
+----------------------------------------------+
```

## Interaction rules

- Clicking a pseudo opens a small menu: private message, ignore, report.
- Ignore is two clicks away: pseudo, then "ignore". Report adds a reason pick.
- Private windows are floating panels on desktop, a stacked tab bar on phones (ASV-NF-006).
- Smileys: a small palette button inserts codes. Rendering follows BR-022.
