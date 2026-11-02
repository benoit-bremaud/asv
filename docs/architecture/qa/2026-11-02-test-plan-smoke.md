# QA smoke — test plan smoke rows (2026-11-02)

Smoke pass for issue #74 (docs-only diff: `test-plan.md`), exercising the smoke-level rows of the plan on a fresh production build.

| Level | Head SHA | Environment | Targets | Agent / model | Matrix page |
|---|---|---|---|---|---|
| smoke | f9970ba | local: own production build on `http://localhost:8799` (`ASV_STATIC_ROOT=dist`, dev mailer, in-memory store, no `ASV_TUNNEL`) | W | qa-tester · Sonnet 5.5 (product part; SEC-01 header read only) | not published (smoke) |

Allowed hosts: `localhost`, `127.0.0.1`. `asvchat.fr`, the live instance on 8787 and `~/.config/asv/tester.env` were not touched. Browser: Playwright MCP (Chromium), 375 x 812. Server stopped at the end.

Plan: domains in = the plan's smoke rows. Out = everything at `pass` / `full` level (diff is docs only).

## Smoke rows (report · screenshot · head SHA)

| Row | Verdict | Report · screenshot · head | Evidence |
|---|---|---|---|
| JRN-01 entry, nominal | PASS | this report · `2026-11-02-test-plan-smoke-01-entry-375`, `-02-rooms-375` · f9970ba | form with age and two checkboxes enabled `ENTRER`; frames `enter` then `entered`; six official rooms listed |
| JRN-03 join and post | PASS | this report · `2026-11-02-test-plan-smoke-03-room-post-375` · f9970ba | Blabla joined, own message shown in the log |
| JRN-11 legal pages | PASS | this report · `2026-11-02-test-plan-smoke-04-rules-375`, `-05-legal-375`, `-06-privacy-375` · f9970ba | rules, legal notice, privacy open from the footer and close with Esc; legal notice and privacy show "(à compléter)" because no `ASV_OWNER_*` variables are set locally (expected) |
| SEC-01 security headers | FAIL (known) | this report · no screenshot (header read with `curl -I` on `/` and `/api/stats`) · f9970ba | CSP (`script-src 'self'`, `frame-ancestors 'none'`, `base-uri 'none'`), nosniff, `Referrer-Policy: no-referrer`, COOP / CORP same-origin, `X-XSS-Protection: 0`, `/api/stats` `no-store`, no `Server`; still no `Permissions-Policy`, no `object-src 'none'`; HSTS only in tunnel mode (not run) → #69 |
| UI-02 inspector (console, network) | PASS | this report · none · f9970ba | requests: `/`, one JS, one CSS, `/api/stats` x2, `/api/legal`, all same origin, all 200; storage empty on the entry screen (`sessionStorage` and `localStorage` keys: none); console: only the favicon 404 (#62, known) |

## QA matrix

Gate ✅ · 🔴 Must 0 · 🟡 Should 1 (known, #69) · 🔵 Nice 1 (known, #62) — smoke: no matrix required; summary of 5 rows: Pass 4 · Fail 1 · Mixed 0 · Not tested 0

## Findings to act on

1. 🟡 Should — SEC-01 `Permissions-Policy` and `object-src 'none'` missing → already filed #69, no new issue.
2. 🔵 Nice — `/favicon.ico` 404 in the console → already filed #62, no new issue.

No new finding. Nothing in the diff (a document) changes the running product.

## Not tested

Everything above smoke level (JRN-02, 04…10, 12; SEC-02…10; A11Y, PERF, ROB, MOB): out of the smoke scope.
Note: the viewport check showed `scrollWidth` 360 vs `innerWidth` 375 (no horizontal overflow).

## Delta vs previous report

`2026-11-02-code-step-resume.md`: fixed 0, still failing 1 (SEC-01, #69), new 0.
