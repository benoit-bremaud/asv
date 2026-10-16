# Test strategy — asv

Follows the test pyramid. Mock only the boundaries (time, randomness, network, storage), never the domain.
TDD is not imposed on this project.

## Levels

| Level | Scope | Tooling | Runs |
|---|---|---|---|
| Unit | `src/domain`: every business rule (BR-xxx) and use-case transition | Vitest, injected clock and random | Every commit |
| Integration | Node transport: real WebSocket clients against an in-memory hub | Vitest + `ws` clients | Every commit |
| Contract | Protocol messages: schema validation shared by client and server | Vitest | Every commit |
| Component | Key React screens (entry form, room, private window) | Vitest + Testing Library | Every commit |
| End to end | Two browsers chatting, resume after a disconnect, moderator expel | Playwright on the Node transport | Before merge to main |
| Production smoke | Enter, join, post on the deployed Worker | Playwright against staging | After deploy |
| Load | 300 simulated chatters on one hub (ASV-NF-001, NF-002) | k6 or a Node script | Before public launch |
| Accessibility | WCAG 2.2 AA | axe in Playwright + manual keyboard | Before release |

## Rules

- Each business rule has at least one unit test named after its id (for example `BR-021 flood limit`).
- Each use case has at least one integration or end-to-end test realising its main scenario.
- The same integration suite must pass against the Cloudflare transport through Wrangler's local runtime
  before the production deploy brick (ASV-NF-009).
- AI triage uses the no-AI adapter in every automated test. The real adapter gets a contract test run
  manually with a small fixed sample.
- Hibernation rebuild (ADR-0011) gets integration tests in Wrangler's local runtime: state survives a
  forced eviction of in-memory variables.
- No test calls the network outside localhost. Passkey ceremonies use a virtual authenticator in Playwright.
