# Local review — asv (branch docs/bootstrap-conception, complete conception dossier)

## Third pass — accounts and strikes (2026-10-16)

- Scope: ADR-0012, ADR-0013, `diagrams/accounts/*`, `moderation/02d` and every file they touched.
- Checks run: design · docs · security · correctness. Tests: not applicable.
- Verdict before fixes: Must 12 · Should 18 · Nice 9. After fixes: ship, all Must and Should resolved.
- Owner decision during this pass: six-digit e-mail code instead of a link (435 vs 365), because links
  opened from mail apps land in another browser and mail scanners can consume single-use links.
- Main fixes: device cookie set by the chat tab through a single-use claim; cookie read at entry; account
  kept on resume; report keeps `targetAccountId`; strikes survive self-deletion (BR-080); suspension
  closes every session and adds an IP and pseudo ban; statement of reasons retried before the address is
  deleted; domain decides account creation, store only persists; MCDA totals of ADR-0012 and ADR-0013
  corrected (ADR-0013 winner was 435, not 400); stale "no accounts" wording removed; DSA art. 18 flagged
  as unverified.
- Intentional: one `AccountStore` port (one SQLite store and one in-memory twin); `Mailer` port has two
  real implementations.

## Second pass — complete dossier (2026-10-15)

- Date: 2026-10-15 (second pass, after splitting `chat-core` into feature studies)
- Commit: 383f91e + uncommitted dossier
- Scope: whole `docs/`, `README.md`, `CLAUDE.md`, `PROJECT_LOG.md` (no application code)
- Checks run: design · docs · security · correctness. Tests: not applicable (no code).
- Verdict before fixes: fix Must Have first · Must 11 · Should 22 · Nice 11
- Verdict after fixes: ship · all Must and Should resolved, Nice resolved or intentional

The first-pass report (chat-core) is in git history at commit 383f91e.

## 🔴 Must Have — all resolved

| Finding | Origin | Resolution |
|---|---|---|
| Passkey ceremonies had no path to the hub's stores | design | Worker calls hub RPC (ADR-0008, ADR-0011, moderation/02b, 02c) |
| Challenge and grant storage undefined | design | Hub keeps challenges 5 min, HMAC grant with `GRANT_KEY`, consumed nonces (ADR-0008) |
| Hibernation vs in-memory state deferred | design | ADR-0011: attachments, minimal away records, auto ping/pong, single alarm; platform/04b, 05 |
| Domain could not see persisted bans, logs never closed | design | entry/02a loads `activeBan`, log closed in entry/02b and moderation/02a |
| Component vs deployment: who builds Hono | design | Worker entry and Node entry build the app (platform/03) |
| Away pseudo at 60 % opacity failed contrast | docs | Solid `-away` tokens ≥ 5.1:1, italics + "(absent)" (design-pack) |
| ADR-0005 stale after ADR-0009 | docs | Reworded, BR-002 cited |
| `ModeratorAuthenticator` port contradiction | design, docs | Port removed, only `ModeratorStore` (ADR-0008) |
| Persisted data list incomplete | docs | CLAUDE.md, vision, ADR-0005 list moderator credentials and away records |
| Away look defined twice | docs | Single rule in design-pack, ADR-0009 points to it |
| Retention values shown as settled | docs | Flagged in entry/06, moderation/05, moderation/06, security inventory |

## 🟡 Should Have — all resolved

- `HubState` aggregate modelled (platform/04b).
- Sequence messages aligned with protocol names. Protocol gained `warn`, `warned`, `ignoreUpdated`,
  payload table, `error(offline)`.
- `SessionStatus` reduced to connected/away; Anonymous and Refused documented as connection states.
- Ignore list keyed by session id.
- `ReportTarget`, `ReportOutcome`, triage fields, `purgeExpired`, `ModerationStore` rename.
- BR-031 owner leaving; BR-057 outcomes; F-009 and F-012 aligned with UC7 and the V1 ban limit.
- Ignore click count unified (two clicks). Pseudo colour derived in web. `src/shared/protocol` marked proposed.
- Moderator generalization clarified; traceability rows fixed; missing "does not cover" lines added.
- Web navigation uses a composite state with return to the last screen.
- Journey J2 no longer assumes room deep links. Legal section declared the living source.

## 🔵 Nice to Have

- Resolved: single `moderatorName`, `Clock`/`Random` ports dropped in favour of arguments, hashed
  invitations and `deleteModerator`, secrets reach the hub, brand dark contrast, UC1 requirement header,
  BR-032 in journeys, glossary terms, BR values owned in business-rules.
- Intentional: Mermaid cannot draw UML generalization or history states, documented in notes.

## ⚪ Disagree / Intentional

- Single hub (ADR-0007), ephemeral `Member` (ADR-0005), directory without sequence: proportionate.
- ADRs keep their legal snapshot with sources, `security-and-rgpd.md` holds the living version.

## Owner decisions taken during this pass

- ADR-0010 AI triages reported content only (395/500).
- ADR-0004 revisit: 18+ in V1, teen space as V2 candidate (390/500).
- ADR-0011 away records without gender, age, city (415/500), chosen by top score, open to owner review.

## Per-dimension summary

- Design: hub plumbing now explicit, no dependency-rule breach, one port removed as over-engineering.
- Docs: cross-file consistency restored, unverified facts flagged.
- Tests: not applicable, strategy extended for AI adapter and hibernation.
- Security: grants single use, invitation tokens hashed, AI receives neutral labels only.
- Correctness: sequences now match the protocol and the use-case specs.
