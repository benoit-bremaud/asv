# Local review — asv (docs/210-moderator-passkeys-study)

- Date: 2026-11-13
- Commit: 1855bbf
- Scope: branch diff origin/main...HEAD (conception study of brick 8b, docs only)
- Checks run: adversarial (Opus, 3 rounds) · docs consistency · secrets; design, tests, security and correctness carried by the adversarial pass (no source change)
- Verdict: ship as-is · Must 0 · Should 0 · Nice 1

## Adversarial review (#236)
- Round 1 on `3f8e32c`: Must 4 · Should 15 · Nice 4 · unverified 1 · Push gate: closed
- Round 2 on `e8233cc`: 23 fixed · 0 not fixed · 1 regressed (MCDA totals) · new Must 1 · Push gate: closed
- Round 3 on `1855bbf`: all fixed · new Must 0 · **Push gate: open**
- Optional second review (owner's OpenAI account): ChatGPT/Codex not run

## Pre-merge gate (head SHA 1855bbf)
| Step | Result |
|---|---|
| 1 Tests | ✅ `pnpm verify`: 900 tests, lint, typecheck, build |
| 2 Coverage | tests 98.61 % statements · docs ⏸ deferred to the pre-merge run (`--push`) |
| 3 SonarQube | ⏸ `pnpm sonar` on the pushed head before merge |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · no tracked .env · diff read: nothing sensitive |
| 5 E2E/smoke | ⏸ deferred; JRN-37 and JRN-38 not covered until the 8b code lands |
- Gate: `--push`: **pre-push green**, SonarQube deferred to the PR head

## 🔴 Must Have
_None._

## 🟡 Should Have
_None._

## 🔵 Nice to Have
- `docs/architecture/diagrams/platform/04c-class-server-hub.md:135` `[adversarial]` · `FileModeratorStore` is an empty class here · name it the same as in `moderation/04-class` when the code lands.

## ⚪ Disagree / Intentional
- BR-094 `[adversarial]` · rights survive a revocation until the session closes · ADR-0008 decision.

## Per-dimension summary
- Adversarial: three rounds, gate open · Docs: stale BR-091 copies, protocol and hub class contract updated · Tests: QA plan JRN-37, JRN-38 added · Security: RP ID from config, UV and resident key required, start-up grant key, tunnel 404 · Correctness: nonce consumed only on `entered`.
