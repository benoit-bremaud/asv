# Local review — asv (branch diff main...feat/15-domain-entry)

- Date: 2026-10-23
- Commit: reviewed 66288af, fixes in the following commit
- Scope: branch diff `main...HEAD` (brick 3: study `entry/07`, domain entry, away, resume, leave, pseudo rules)
- Checks run: design · docs · tests · security · correctness
- Verdict: ship after fixes · Must 1 (fixed) · Should 9 (fixed) · Nice 8 (4 fixed, 4 accepted)

## Pre-merge gate (head SHA of the fix commit)
| Step | Result |
|---|---|
| 1 Tests | ✅ 91 Vitest tests (domain, protocol, server, web, lint fixtures) |
| 2 Coverage | tests 100 % stmts / 100 % branches / 100 % funcs / 100 % lines (floor 80) · docs 26/26 domain exports documented (floor 90) |
| 3 SonarQube | run with `pnpm sonar` after push, result in the PR |
| 4 Secrets | ✅ gitleaks clean (`main..HEAD`) · no tracked .env · diff read: nothing sensitive (test IPs from RFC 5737 ranges) |
| 5 QA pass | pure domain, no runtime path yet (no route, no transport): `pnpm build` green, unit suite is the artefact check |

## 🔴 Must Have
- `src/domain/entry.ts` `resume` `[design|correctness]` · the resumed profile skipped BR-004 and BR-006 · fixed: `invalid` effect, study `entry/07` updated, tests added.

## 🟡 Should Have
- `src/domain/entry.ts` `recordAttempt` `[design|correctness|security]` · `entryAttempts` grew without bound · fixed: last 5 attempts per IP, `pruneEntryAttempts` for the alarm, study updated.
- `src/domain/entry.ts` `[design]` · helper `unchanged` also wrapped changed states · renamed `result`.
- `eslint.config.js` `[design]` · test override used array positions · named patterns, fixture `domain-test/imports.ts` proves `node:fs` stays refused.
- `src/domain/entry.ts` `[docs]` · undocumented exports · all 22 exports documented.
- `src/domain/entry.test.ts` `[tests]` · resume rotation assertions were vacuous · distinct `rotatingRandom`.
- `src/domain/entry.test.ts` `[tests]` · BR-007 boundaries (fifth accepted, exact 60 s, accepted entries counted) · added.
- `src/domain/entry.test.ts` `[tests]` · check order and NFC storage via `enter` · added.
- `src/domain/pseudo.test.ts` `[tests]` · weak fold assertion · exact values.
- `src/domain/entry.test.ts` `[tests]` · `expireAway` with mixed sessions · added.

## 🔵 Nice to Have
- BR-006 counted UTF-16 units · fixed (code points).
- BR-001 / BR-007 wording · fixed ("either case", "any 60 seconds").
- Gender `it.each`, `leave` on away session, resume one ms before deadline · added.
- Raw string sizes before `normalize` · accepted: capped by the protocol layer, issue #13 (brick 7), noted in study.
- Reserved words bypassed with separators (`a.d.m.i.n`) · accepted V1 limit: stripping separators refuses innocent pseudos (`pas_vu` → `asv`); noted in study.
- Same `Date` instances shared between state and effects · accepted: state is treated as immutable by contract.
- `resume` scans sessions (O(n)) · accepted for V1 (single hub, small n).

## ⚪ Disagree / Intentional
- `Random.token()` hashes the token · owner decision (study `entry/07`, Web Crypto digest is async).
- `Session.ip` unused by the domain · feeds the connection line (BR-060, `platform/04b`).

## Per-dimension summary
- Design: pure, flat, dependency rule held · Docs: study, BRs and traceability aligned · Tests: one group per BR, pure, no mocks · Security: no ReDoS, look-alikes refused, sizes bounded upstream · Correctness: resume profile check was the one gap.
