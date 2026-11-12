# Local review — asv (branch fix/131-private-close-focus)

This report records the pre-push review of issue #131 (keep the focus when a private window is closed or minimised).

- Date: 2026-11-12
- Commit: 74472ed
- Scope: branch diff origin/main...HEAD (`src/web/screens/PrivateWindows.tsx`, `RoomScreen.tsx`, `chat-context.tsx`, `App.test.tsx`; `web-ui/07` study, QA test plan JRN-21)
- Checks run: adversarial (Opus, 2 rounds) · design, docs, tests, security, correctness (one combined audit agent) · execution checks (pre-push mode)
- Verdict: ship as-is · Must 0 · Should 0 open · Nice 0 open

## Adversarial review (#236)

- Round 1 on `c454723`: Must 0 · Should 3 · Nice 1 · unverified 1 · Push gate: open
- Round 2 on `379c984` (range c454723..379c984): 3 fixed · 0 not fixed · 0 regressed · new Must 0 · new Should 1 and Nice 2, fixed in `74472ed` · **Push gate: open**
- Optional second review (owner's OpenAI account): ChatGPT/Codex not run (never a gate step)

## Pre-merge gate (head SHA 74472ed)

| Step | Result |
|---|---|
| 0 CI mirror | `ci.yml` → `pnpm verify` (lint, typecheck, tests with coverage, build) ✅; `codeql.yml`, `dependency-review.yml`, `scorecard.yml` CI-only |
| 1 Tests | ✅ 726 unit/integration (10 new for #131) |
| 2 Coverage | tests 98.67 % stmts / 94.84 % branches (floor 80) · docs ⏸ deferred to the pre-merge run (`--push`) |
| 3 SonarQube | ⏸ deferred to the pre-merge run (`--push`) |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · no tracked .env · diff read: nothing sensitive |
| 5 E2E/smoke | ⏸ deferred to the pre-merge run (`--push`) · JRN-21 QA evidence still to run |

- Gate: **pre-push green** — `pnpm verify` passed; SonarQube, doc coverage, E2E and JRN-21 QA deferred (never GREEN)

## 🔴 Must Have

_None._

## 🟡 Should Have

All fixed on the branch:

- `src/web/App.test.tsx` `[adversarial|tests]` · the refused-close test passed without its guard · it now re-renders after the click and fails when `onClose` runs unconditionally (mutation checked) · fixed in 379c984
- `src/web/screens/PrivateWindows.tsx` `[correctness]` · a refocus could stay pending after a refused close; a missing target dropped the focus · `closePrivate` returns whether it applied, fallback to the room field · fixed in d941d03
- `src/web/screens/PrivateWindows.tsx` `[design]` · hard-coded `"message"` id of another component · `MESSAGE_FIELD_ID` exported by `RoomScreen` · fixed in d941d03
- `docs/architecture/diagrams/web-ui/07-state-private-and-search.md` `[adversarial|docs]` · "next window in the dock" ambiguous with `row-reverse` · named by Tab order · fixed in 379c984
- `docs/architecture/qa/test-plan.md` `[adversarial|docs]` · JRN-21 cases missed the refused close and the no-room case · cases (f) and (g) added · fixed in 379c984
- `src/web/screens/RoomScreen.tsx` `[adversarial|docs]` · new constant split `RoomScreen` from its doc comment · moved above it · fixed in 74472ed

## 🔵 Nice to Have

- `src/web/screens/RoomScreen.tsx` `[adversarial]` · `message-count` / `message-invisible` ids derived from `MESSAGE_FIELD_ID` · fixed in 74472ed
- `docs/architecture/qa/test-plan.md` `[adversarial]` · JRN-21 journey row names the no-room case · fixed in 74472ed
- `src/web/screens/PrivateWindows.tsx` `[design]` · two callbacks (`onClose`, `onMinimise`) could become one hook · kept: two clear props, no second user (YAGNI)

## ⚪ Disagree / Intentional

- `src/web/screens/PrivateWindows.tsx` `[adversarial]` · minimise is fixed too, beyond the issue text · owner asked for it in the same PR; study updated first
- `src/web/screens/PrivateWindows.tsx` `[adversarial|correctness]` · `useEffect` with no dependency array · intended (runs after the store applied the action), comment in place

## Per-dimension summary

- Adversarial: 2 rounds, 0 Must, gate open; pre-existing study mismatch on closing a minimised window filed as #145
- Design: simple ref plus effect in the dock; no new abstraction
- Docs: study, test plan and doc comments aligned
- Tests: 10 behaviour tests, each failing without the change (mutation checked)
- Security: server session ids pass through `CSS.escape`; no new input, nothing persisted
- Correctness: hook order stable, keys stable across pending → conversation id, refused close keeps the focus
