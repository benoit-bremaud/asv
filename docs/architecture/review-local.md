# Local review — asv (branch docs/54-real-tester-exposure)

- Date: 2026-10-24
- Commit: ef68abd + review fixes
- Scope: branch diff main...HEAD (documentation only: conception study for issue #54)
- Checks run: design · docs · security · correctness (one combined reviewer; tests not in scope, no code)
- Verdict: ship — every Must and Should fixed · Must 0 · Should 0 · Nice 1

## Pre-merge gate (pre-push mode)
| Step | Result |
|---|---|
| 1 Tests | ✅ 595 passed (`pnpm verify`, code unchanged) |
| 2 Coverage | 98.55 % stmts / 93.84 % branches / 97.89 % funcs / 99.4 % lines (floor 80) · docs n/a (no code) |
| 3 SonarQube | ⚠️ run after push (`pnpm sonar`, project rule) |
| 4 Secrets | ✅ gitleaks clean (main..HEAD) · no tracked .env · diff read: owner identity kept as `{placeholders}` |
| 5 QA pass | skipped: pre-push mode, documentation-only diff |
- Gate: pre-push GREEN; merge waits for step 3.

## 🔴 Must Have (all fixed)
- `business-rules.md` BR-083 `[security]` · plaintext log contradicted BR-083 · exception added in BR-083 and ADR-0017.
- `legal-pages-draft.md` `[correctness]` · in-memory vault while the privacy text promised 5 years · file vault plus closing records on stop (BR-084, ADR-0018).
- `legal-pages-draft.md` mentions `[correctness]` · the owner self-hosts, so the anonymous non-professional regime did not apply · owner named as editor and host, Cloudflare described as transit.
- `legal-pages-draft.md` privacy `[correctness]` · GDPR art. 13 gaps · added a table (purpose, legal basis, retention), the recipients, the transfer to the US, portability, and that the e-mail is optional.
- BR-086 / BR-073 / `07-deployment` `[design]` · three different HTTPS triggers · now one `secureCookie` option.

## 🟡 Should Have (all fixed)
- BR-086 `[security]` · CSP breaks the Vite dev server · the rule covers only the production build, and testers get the build.
- BR-085 `[security]` · header spoofing · loopback-only start, a single valid IP, no `X-Forwarded-*`, tunnel host name in the allowed Origins; shared-IP quota effect stated in ADR-0018.
- Diagram headers `[docs]` · BR and ADR lists updated in platform/02, 04c, 07 and web-ui/05.
- `traceability-matrix.md`, `test-strategy.md` `[docs]` · new tester-exposure table and test cases.
- BR-084 `[docs]` · "older" defined by the connection start or the contribution date.

## 🔵 Nice to Have
- Mermaid not rendered locally (read-checked only); check the rendering on the GitHub PR view.

## ⚪ Disagree / Intentional
- `legal-pages-draft.md` "LCEN art. 6 VII" (false reports) · kept: `security-and-rgpd.md` §1 verified this numbering on Légifrance on 2026-10-22, after the SREN renumbering; the reviewer's doubt was unchecked.

## Per-dimension summary
- Design: one option drives `Secure` and HSTS · Docs: traceability complete · Tests: n/a (no code) · Security: IP trust and CSP scoped · Correctness: legal texts aligned with the stored data.
