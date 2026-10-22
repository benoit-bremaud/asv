# Local review — asv (brick 1 bis, legal check)

- Date: 2026-10-22
- Commit: 4e38427 + review fixes (same branch)
- Scope: branch diff `origin/main...docs/legal-check` (docs only, no application code)
- Checks run: design (architecture-guardian) · docs (doc-auditor) · secrets · diagram rendering.
  Tests, security and correctness reviews: no code in scope.
- Verdict: ship after fixes · Must 6 (fixed) · Should 13 (fixed) · Nice 4 · Disagree 1

## Pre-merge gate

| Step | Result |
|---|---|
| 1 Tests | n/a — no code yet; every changed Mermaid diagram renders with `mmdc` |
| 2 Coverage | n/a — no code yet |
| 3 SonarQube | ⚠️ not run: no asv project yet (created in brick 2). **Owner waiver 2026-10-22**: docs-only PR, SonarQube does not analyse Markdown |
| 4 Secrets | ✅ gitleaks clean (branch range and working tree) · no tracked `.env` · diff read: nothing sensitive |
| 5 QA pass | n/a — no runnable product yet |

- Gate: **GREEN with the SonarQube waiver above**

## 🔴 Must Have (all fixed)

- ADR-0014, BR-081, `security-and-rgpd.md`, `accounts/05`, `accounts/06` `[docs][design]` · account id
  retention ambiguous (1 vs 5 years) and pseudonym history not given at sign-up · owner chose option D
  (385/500): e-mail and dates 5 years, account id 1 year, pseudonyms only in the connection log.
- `business-rules.md` BR-060 and others `[docs]` · decree articles cited inconsistently · now
  "arts. 5 and 7 (source data), art. 6 under injunction" everywhere.
- ADR-0011, `platform/05`, `accounts/01`, `accounts/04`, `moderation/02d`, ADR-0004 `[docs]` · deletion and
  purge not propagated, "Legal check pending" left · propagated, `LegalVaultStore` port and `VaultRecord`
  added.
- ADR-0014 `[design]` · "sealed / write-only" undefined · port with `record` and `purgeExpired` only,
  written in the deletion transaction, owner-only read with access entries, encryption decided in brick 5.
- BR-060, `entry/04`, `entry/06`, `rooms/02`, `private-conversations/02`, glossary `[design]` · content lines
  not modelled · `ContentLogLine` added, steps drawn, brick 9 risk on write volume.
- UC17, ADR-0014 `[design]` · users not informed (GDPR art. 13) · sign-up and deletion inform them;
  arts. 15 and 17(3)(b) covered.

## 🟡 Should Have (all fixed)

- Stale "to confirm" / "unverified" wording in ADR-0004, 0005, 0010, 0012.
- `vision.md`, requirements NF-008 and F-024, glossary "Legal vault", traceability UC11/UC17/UC19,
  test-strategy vault cases, accounts heading cites ADR-0014, note under the retention table.
- "Authority entitled by law" instead of "judicial requisition" only; same access regime for the log.
- Vault never stores the deletion reason, strikes or reports.
- Threat model: disclosure of the vault or log, repudiation of a disclosure.
- Ripple to ADR-0005, ADR-0007, ADR-0011, `platform/03`; ADR-0014 status lists the amended ADRs.
- MCDA option D added and re-scored.

## 🔵 Nice to Have

- Draw an Owner actor between the vault and the authority in `accounts/06`.
- Point-in-time recovery note: restored backups must re-apply the purge.
- Backup reader for the owner (continuity of requisition answers).
- Split the long §1 rows of `security-and-rgpd.md`.

## ⚪ Disagree / Intentional

- `security-and-rgpd.md` §1 `[design]` · reviewer recalled decree 2021-1362 art. 1 as identity · the text
  read on Légifrance on 2026-10-22 has art. 1 = scope, art. 2 = identity, art. 3 = other sign-up data.
  Citations kept.

## Per-dimension summary

- Design: vault scope and access path now explicit, 4 Must fixed · Docs: 5 Must, 9 Should fixed ·
  Tests: n/a · Security: secrets clean, threat model extended · Correctness: n/a
