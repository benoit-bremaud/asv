# QA smoke — tester runbook (PR #61)

- Date: 2026-10-24 · Level: smoke · Part: product · Model: Sonnet 5.5
- Target: local server http://127.0.0.1:8787 (already running; nothing started or stopped). asvchat.fr never touched.
- Plan: diff is docs-only (runbook), so only a smoke of the running product. Out: SEC part, accounts, e-mail codes, WebSocket entry (origin allow-list is https://asvchat.fr only; refusal from 127.0.0.1 is by design).

| Check | Verdict | Evidence |
|---|---|---|
| Page loads (200, HTML, entry screen renders) | PASS | `2026-10-24-tester-runbook-smoke-entry.png` |
| CSP | PASS | `default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` |
| X-Content-Type-Options | PASS | `nosniff` |
| X-Frame-Options | PASS | `SAMEORIGIN` (CSP frame-ancestors 'none' is stricter and wins in modern browsers) |
| HSTS | PASS | `max-age=15552000` (no includeSubDomains/preload; acceptable for the tunnel phase) |
| Other headers | PASS | Referrer-Policy no-referrer, COOP/CORP same-origin |
| Legal page: règles du chat | PASS | `...-rules.png`, no "(à compléter)" |
| Legal page: mentions légales | PASS | screenshot not kept (it shows the owner's postal address and phone); owner name, postal address, phone, contact e-mail all filled |
| Legal page: confidentialité | PASS | `...-privacy.png`; controller and contact filled |
| /api/legal | PASS | 200 application/json; ownerName, postalAddress, phone, contactEmail, brevoLocation all filled (values not copied here) |
| Console clean | PASS with notes | see findings; only expected errors |
| WebSocket entry from 127.0.0.1 | BY DESIGN | 403 on handshake, origin allow-list |

## Findings

No Must, no Should.

Nice (not filed, owner to decide):
1. N1: `/favicon.ico` returns 404, which logs a console error on every load. Add a favicon or `<link rel="icon" href="data:,">`.
2. N2: when a legal dialog opens, the identity fields show "(à compléter)" for a moment until `/api/legal` answers (seen on a re-open). Cosmetic; a "chargement" state would avoid showing the placeholder to a tester on a slow link.
3. N3: the entry screen shows a connection error/WebSocket failure in the console on every load from 127.0.0.1 (by design here).

Issues filed: none.

## Gate line

QA smoke: GREEN — 0 Must, 0 Should, 3 Nice (N1–N3), docs-only diff, local only.
