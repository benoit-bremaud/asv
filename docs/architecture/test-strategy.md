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
- Encryption at rest planned cases (ADR-0017, BR-083), brick 5:
  - field cipher round-trip; a changed context or a tampered value fails; an unknown key version fails;
  - rotation: a value written with version 1 still decrypts once version 2 encrypts;
  - keyed hash: same normalised e-mail gives the same hash, different keys give different hashes;
  - vault sealer: the owner private key (test fixture) opens a sealed value; the application has no unseal path;
  - `fromEnv`: production refuses missing keys, development generates them with a warning.
- Mailer planned cases (ADR-0013 amendment), brick 5, `fetch` stubbed at the boundary:
  - Brevo request shape (URL, `api-key`, sender, recipient, subject, text and HTML);
  - non-2xx and network errors resolve without throwing and log no address or raw body;
  - no key: logs the code outside production, logs a failure in production;
  - `sendStatementOfReasons` resolves `true` only on 2xx.
- Sign-in planned cases (UC17, BR-070 to BR-073), brick 5: code format and expiry, fifth wrong try
  invalidates, silent `codeSent` for blocked e-mail, e-mail quota, cooldown and 20 wrong tries in 24 h, explicit refusal for a
  disposable domain and the IP quota, account created on first valid code, existing account linked,
  strike carry-over restored, device claim single use and 60 seconds, cookie attributes, Origin check on
  the account routes, sign-out of this device and everywhere, account deletion writes the vault record.
- Legal vault planned cases (ADR-0014, BR-081, BR-082), brick 5:
  - deleting an account writes the vault record in the same transaction (a failed write rolls back the deletion);
  - `purgeExpired` drops the account id after 1 year and the whole record after 5 years, purges access entries older than 5 years, and the daily alarm calls it;
  - no domain use case, moderation tool or AI path can read the vault (the port has no read operation);
  - an owner read through the dedicated call appends an access entry (date, request reference, legal basis, ids returned), same for the connection log;
  - the record holds only account id, e-mail, creation and closing dates.
- Tester exposure (ADR-0018):
  - file log and file vault: lines appended, purged after their period, opening record written before the account is saved, closing records at start-up for accounts and connections left open by a crash, atomic purge, unreadable lines kept, files 0600 in a 0700 folder (BR-084);
  - `CF-Connecting-IP` used only with the tunnel flag, a single valid address only, start refused off loopback (BR-085);
  - CSP, `nosniff`, `no-referrer` on every response; HSTS and the `Secure` cookie only with `secureCookie` (BR-086, BR-073, #48, #50);
  - legal pages reachable from the entry screen and the account panel.
- Connection and contribution lines (BR-060):
  - one connection line per socket connection: socket loss closes it, an accepted resume opens a new one with a new connection id (IP, port, protocols, pseudo, account id);
  - a contribution line is written for every message with connection id and protocols, and with content id, operation, date and time only under injunction;
  - contribution lines carry the current connection id after a hibernation rebuild and after a resume;
  - the contribution line is written before delivery: if the write fails, the message is refused with an error and not delivered;
  - the connection id never appears in client messages, reports, bans or AI triage input, and lives outside the log only in the socket attachment;
  - the away record holds no connection id;
  - on wake-up, open connection lines whose id is in no socket attachment are closed at the last known time.
- Access entries are purged 5 years after the read by the daily alarm (BR-082).
- No test calls the network outside localhost. Passkey ceremonies use a virtual authenticator in Playwright.
