# ADR-0006 — Pseudo colours: pink, blue, grey; gender optional

- Status: accepted
- Date: 2026-10-15
- Deciders: Benoît Bremaud

## Context

Caramail users remember "men in blue, women in pink" (testimonies, see `docs/research/caramail.md`).
It is the core of the visual identity, but gender shown publicly is personal data and a binary
choice excludes some users.

## Options and MCDA

Scores 0–5. Criteria: Caramail spirit 35, inclusion 25, data minimisation 20, colour code readability 20.

| Option | Spirit | Inclusion | Minimisation | Readability | Total /500 |
|---|---|---|---|---|---|
| **C. Pink / blue / grey (not specified, default)** | 4 | 5 | 5 | 4 | **440** |
| B. Pink / blue / green (other) | 4 | 4 | 2 | 4 | 360 |
| A. Strict pink / blue | 5 | 1 | 1 | 5 | 320 |
| D. Free colour | 1 | 5 | 4 | 1 | 275 |

- C: nobody has to classify themselves, grey reads as "not specified".
- B: keeps the spirit but still asks everyone to pick a box.
- A: exact copy, excludes and forces a gender disclosure.
- D: the shared code is lost.

Sensitivity: with spirit 55 and minimisation 0, C still leads (420 vs 400).

## Decision

Gender is optional: woman (pink), man (blue), not specified (grey, default).

## Consequences

- Exact colour values must pass WCAG AA contrast on the cream background.
- Gender lives on the session only. It is never persisted, never in logs, reports or bans.
