# ADR-0019 — Mistral, EU-hosted, is the AI triage provider

- Status: accepted
- Date: 2026-11-13
- Deciders: Benoît Bremaud

## Context

ADR-0010 keeps AI to the triage of reported content and leaves the model and provider to brick 8. The
impact assessment (`dpia/2026-11-13-moderation-dpia.md`) needs the provider fixed: where the data goes, under
which contract, and whether it trains on it. Facts below are from the providers' public pages and are
estimates until checked at contract signature.

## Options and MCDA

Scores 0–5. Criteria: real protection 20, privacy and EU processing 35, cost 15, simplicity 15, French
quality 15.

| Option | Protection | Privacy | Cost | Simplicity | French | Total /500 |
|---|---|---|---|---|---|---|
| **A. Mistral La Plateforme (EU hosting, processing agreement, no training on API data)** | 4 | 5 | 4 | 4 | 5 | **450** |
| B. Claude Haiku through the Anthropic API (agreement, no training, processed outside the EU by default) | 5 | 3 | 4 | 4 | 4 | 385 |
| C. Local model (Llama Guard on the owner machine) | 3 | 5 | 5 | 2 | 3 | 380 |

Sensitivity (protection 35, privacy 20): A 445, B 410, C 365. A stays first. Owner choice 2026-11-13.

## Decision

- The `ReportTriage` port gets a Mistral adapter calling the chat completions API with a JSON answer,
  model set by `ASV_TRIAGE_MODEL` (default a small Mistral model), key in `ASV_MISTRAL_API_KEY`.
- Without the key the no-AI adapter stays (urgency `unknown`): development, tests and the tester tunnel.
- The answer is validated against a closed schema (BR-101); anything else counts as unavailable.
- The processing agreement, EU location and no-training setting are checked and recorded in the impact
  assessment before the key is set in production.

## Consequences

- One new processor in the privacy notice and the statement of reasons (DSA art. 17(3)(c)).
- No transfer outside the EU to justify, which keeps the impact assessment short.
- Swapping provider later is an adapter change behind the same port.
