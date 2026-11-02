# Local review — asv (branch fix/65-private-windows-room-input)

- Date: 2026-11-02
- Commit: d6171d4 (product code at 5669e7d)
- Scope: branch diff origin/main...HEAD — `src/web/styles.css`, `src/web/screens/RoomScreen.tsx`,
  `src/web/App.test.tsx`, studies `web-ui/04` and `web-ui/07`, `design-pack.md`, QA report and test plan
- Checks run: design and docs (architecture-guardian, doc audit included) · tests · security (QA security
  part, SEC-01…10) · correctness (own diff read) · QA product part, three runs
- Verdict: ship as-is · Must 0 · Should 0 · Nice 2

## Pre-merge gate (head SHA d6171d4)

| Step | Result |
|---|---|
| 1 Tests | ✅ 641 unit/integration (Vitest), lint, typecheck, build (`pnpm verify`) |
| 2 Coverage | tests 98.63 % stmts / 94.49 % branches / 98.08 % funcs / 99.4 % lines (floor 80) · docs: no new exported API |
| 3 SonarQube | ✅ PASSED (local server, `pnpm sonar` on a clean tree); the GitHub commit status step fails until the branch is pushed |
| 4 Secrets | ✅ gitleaks clean (main..HEAD) · no tracked .env · diff read: nothing sensitive (QA members are throw-away `qa-*@asv.test`) |
| 5 QA pass | ✅ pass · product part on 5669e7d: 13 checks PASS, 0 findings · security part on debc8ce (no server, header or storage change since): SEC-02…10 ✅, SEC-01 ❌ known #69 · report: docs/architecture/qa/2026-11-02-65-private-dock.md |

- Gate: **GREEN — merge authorised** once the owner approves (SEC-01 stays on the known #69).

## 🔴 Must Have

- `docs/architecture/diagrams/web-ui/07-state-private-and-search.md` `[design|docs]` · first fix (debc8ce)
  only cleared the composer once scrolled to the bottom; also found by the QA security part · **resolved**:
  owner choice B, room screen fits the viewport (ce90fc5).

## 🟡 Should Have

- `src/web/styles.css` `[design]` · phone reset dropped the page bottom padding · **resolved** in ce90fc5.
- #83 `[qa]` · short desktops: lines panel 24 px high · **resolved** in 5669e7d (layout only from 720 px high).
- #84 `[qa]` · overlays under the dock · **resolved** in 5669e7d (`.overlay` z-index 16).

## 🔵 Nice to Have

- #85 part 2 `[qa]` · last member's pseudo menu clipped by the members panel (`.privates`/`.members`
  overflow); predates this branch · stays open on #85.
- `src/web/styles.css` `[design]` · `--dock-height` caps the window while `.private-lines` sets its real
  height; safe today (lines shrink) · optional single source later.

## ⚪ Disagree / Intentional

- `src/web/styles.css` `[tests]` · layout is not unit-tested: jsdom has no layout; QA `elementFromPoint`
  evidence is the right level (test-strategy). The scroll-follow logic is unit-tested (3 tests).

## Per-dimension summary

- Design: no over-engineering, one token, CSS plus one small effect · Docs: studies updated before each code
  commit · Tests: +3 behaviour tests, coverage unchanged · Security: CSS and client scroll only, SEC
  probes green except known #69 · Correctness: QA at 7 viewports, scrollY 0 included, no defect left.
