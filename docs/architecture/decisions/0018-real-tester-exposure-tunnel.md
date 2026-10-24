# ADR-0018 — Real-tester exposure through a Cloudflare Tunnel to the Node transport

- Status: accepted, temporary until brick 9; tracks issue #54
- Date: 2026-10-24
- Deciders: Benoît Bremaud

## Context

Before brick 8 (moderation), the owner wants two real people to test asv: one aged 18 (the youngest
age allowed, ADR-0004) and one aged 45 who knew Caramail well. They are not developers and must reach
the site from their own devices. As soon as a third party posts, asv is a hosting provider (LCEN art. 6
I.2), so the connection and contribution log (BR-060) must survive restarts and the legal pages must be
reachable. Two P1 security issues matter once the site leaves localhost: #48 (no CSP or security
headers) and #50 (the device cookie lacks `Secure` in the Node transport).

## Options and MCDA

Scores 0–5. Criteria: effort and delay 25, reachable legal compliance 20, P1 security 20, faithfulness to
the final product 15, reversibility and cost 10, roadmap fit 10.

| Option | Effort | Legal | Security | Faithful | Reversible | Roadmap | Total /500 |
|---|---|---|---|---|---|---|---|
| **A. Cloudflare Tunnel to the local Node transport** | 5 | 3 | 4 | 3 | 5 | 5 | **410** |
| B. Temporary staging deployment (Node host) | 3 | 4 | 4 | 3 | 3 | 4 | 350 |
| C. Bring brick 9 forward (Durable Objects on asvchat.fr) | 1 | 5 | 4 | 5 | 2 | 1 | 310 |

Sensitivity: with legal compliance weighted 35 and effort 10, A gets 410 and B 380, so A still leads. C
leads only if faithfulness weighs more than 40. The owner chose A on 2026-10-24.

## Decision

- The Node transport runs on the owner's machine and is reached through a Cloudflare Tunnel (HTTPS ends at
  Cloudflare). The tunnel is opened only during test sessions and closed afterwards.
- The connection log is appended to a local JSONL file outside the repository and purged after 1 year
  (BR-060, BR-084). It is not encrypted at application level: two known testers, a single owner machine
  and a short test. Encryption at rest arrives with storage in brick 9 (BR-083, ADR-0017). This
  interpretation is to be confirmed in the brick 10 professional review.
- Behind the tunnel the socket peer is Cloudflare, so the client IP is read from `CF-Connecting-IP`, and
  only when the transport is told it runs behind the tunnel (BR-085).
- Security headers and a strict CSP are sent on every response (BR-086, #48). The device cookie is
  `Secure` whenever the transport serves HTTPS to the browser (BR-073, #50).
- Short provisional rules (CGU), legal notice and privacy pages are shown from the entry screen, and a
  GDPR art. 13 notice appears before the e-mail code is requested (`docs/product/legal-pages-draft.md`).
- Accounts, vault and rooms stay in memory: testers are told data resets on restart.

## Consequences

- The site exists only while the owner's machine and the tunnel run.
- The same headers, cookie and IP rules carry over to brick 9; only the log storage changes.
- Ends when brick 9 deploys the Cloudflare transport; the local log file is then kept for its legal year.
