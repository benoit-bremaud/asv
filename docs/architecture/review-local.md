# Local review — asv (branch docs/bootstrap-conception vs main)

- Date: 2026-10-15
- Commit: f6d67d4 (all reviewed files uncommitted)
- Scope: branch diff main...HEAD + untracked files (docs and one CI workflow, no application code)
- Checks run: design · docs · security · correctness. Tests: not applicable (no code, no tests).
- Verdict: fix Must Have first · Must 6 · Should 14 · Nice 9

## 🔴 Must Have

- `docs/architecture/decisions/0002-stack.md:41`, `diagrams/chat-core/03-component.md:30-31`, `02a`, `02b`, `05` `[design]` · One Durable Object per room and per DM pair is over-engineered for a few hundred users and leaves socket ownership, ignore-list ownership and expel reach undefined. · Owner decision: amend ADR-0002 (single Hub DO proposed), then update diagrams.
- `diagrams/chat-core/03-component.md:36-43`, `02c:19`, `traceability-matrix.md:15-17` `[design|docs]` · Server depends on transport concretions (dependency rule inverted). "Report store" used in 02c and matrix but absent from the component view. · Reverse arrows (transport → server), name a Report store port implemented by in-memory and SQLite stores.
- `diagrams/chat-core/02c-sequence-report-and-expel.md:27-33` `[design|docs]` · Expel result is sent to the reporter, the target's socket is never closed, store replies skip the server, no moderator authorization. · Add Target participant, close its session, notify others, route store replies through the server, add `alt not moderator`.
- `decisions/0005:30`, `decisions/0006:32` vs `04-class.md:14-19` `[design|docs]` · ADRs say gender and profile live in the session, class diagram puts them on Member (persistent in V2). · Move gender and profile to Session, Member keeps id + pseudo.
- `decisions/0004-audience-adults-only.md:13-19` `[docs]` · Legal points stated as checked facts without citations. · Retitle "Legal context (unverified, not legal advice)", add a link per point, add "Legal check pending".
- `traceability-matrix.md:3,8,16` vs `01-use-case.md` `[docs]` · UC2 and UC10 marked "Text" but have no spec. · Add short specs.

## 🟡 Should Have

- `04-class.md:84-87` `[design]` · Persisted Report, Ban, ConnectionLog link to ephemeral Member/Session. · Store snapshot values (pseudo, ip/ipHash) + optional memberId for V2.
- `04-class.md:20-24`, `05-state-session.md:35` `[design|docs]` · Session lacks `isModerator` and IP. · Add both.
- `02b-sequence-open-private-conversation.md:25-33` `[design|docs]` · `open(A, B)` carries no text but a "first message" is sent. Ignore branch gives A no window. Server elided unlike 02a. · `open(A, B, text)`, open A's window in both branches, add the server or a note.
- `06-data-flow.md:23,27` `[design]` · Logs also hold pseudo and timestamps, reports hold author, no judicial-request outflow. · Annotate and add Authority node.
- `traceability-matrix.md:11,12,15` `[design]` · UC5/UC6 also reachable from Connected, component names drift. · Fix states and names.
- `decisions/0002-stack.md` Consequences `[design]` · Single-object throughput ceiling not discussed. · One sentence with a measured trigger to shard.
- `04-class.md` Ban `[security]` · Unsalted IP hash is reversible (small IPv4 space): pseudonymisation, not anonymisation. · Keyed hash (HMAC with a secret) and say so in the privacy notice.
- `01-use-case.md` UC1, UC4 `[security]` · No rate limit on entry, no maximum message length. · Add both as domain rules.
- `01-use-case.md` UC4 `[security]` · Smiley codes must never inject HTML. · Note: render as text + whitelisted image map.
- `README.md:8-12`, `docs/architecture/README.md:6` `[docs]` · Planned features stated as existing. · "Planned (V1)" heading, "to be hosted".
- `decisions/0001-name-and-domain.md:15-37` `[docs]` · Owner overrode the top MCDA score twice without saying so explicitly. · Add an "Owner override" line with the reason.
- All ADRs `[docs]` · Only totals shown, per-criterion scores missing. · Add the per-criterion tables.
- `decisions/0002:26-33,45`, `0001:41`, `0005:10-11`, `CLAUDE.md:32` `[docs]` · Facts without source links, "costs nothing" stated flatly. · Add links, hedge cost.
- `01-use-case.md:69` `[docs]` · UC3 1b implies a per-room ban the model lacks. · Drop 1b.
- `docs/research/caramail.md:76,86-92` `[docs]` · Open questions now resolved, "DMs limited to same room" and age-band rooms contradict decisions. · Annotate as resolved.
- `CLAUDE.md` `[docs]` · Restates ADRs and global rules (drift risk). · Keep project invariants, link to the ADR index.

## 🔵 Nice to Have

- `05-state-session.md` `[design]` · Reconnecting state for the grace period. · Add if a grace period is adopted.
- `05-state-session.md:15-17` `[design|docs]` · "18+ not ticked" transition missing. · Extend the label.
- `01-use-case.md` `[design]` · Leaving a room has no spec. · Add as UC3 alternative ending.
- `01-use-case.md:77` `[design]` · User room names are user content. · Cover in UC9/UC11.
- `03-component.md:26-27` `[design]` · Rename Node side "in-memory hub" after the Hub decision.
- `docs/research/caramail.md` `[docs]` · Per-claim citations, tag testimonies.
- `04-class.md:93` `[docs]` · Age ≥ 18 rule goes beyond ADR-0004. · State whether a declared age under 18 is refused.
- `03`, `04`, `05`, `06` Context `[docs]` · Say what each diagram does not cover.
- `traceability-matrix.md:7` `[docs]` · Add Ban to UC1.

## ⚪ Disagree / Intentional

- `.github/workflows/gitleaks.yml:20,23` `[docs]` · SHAs were fetched from the upstream release tags with `gh api` on 2026-10-15. Verified.
- `04-class.md:8` `[design]` · Member separate from Session without account code: low-cost seam justified by ADR-0005.
- `01-use-case.md:96` `[design|docs]` · "Receive a private message" correctly rejected as a use case.
- `02a:45` `[design]` · Passing `now` to the domain is a justified testability seam.

## Resolution (same day, before push)

- Topology: owner chose a single Hub Durable Object, recorded in ADR-0007 (445/500).
- All 6 Must and 14 Should fixed in ADRs 0001–0007, the 8 diagrams, the traceability matrix,
  README, CLAUDE.md and the Caramail research note.
- 7 of 9 Nice fixed in passing. 2 tracked as GitHub issues: the `Reconnecting` state (depends on a
  grace-period decision) and per-claim citations in `docs/research/caramail.md`.

## Per-dimension summary

- Design: over-engineered DO topology drives most findings, simplify first.
- Docs: structure sound, links and fences clean, unsourced facts and README overpromise.
- Tests: not applicable.
- Security: workflow permissions minimal and safe, conception lacks rate limits, message cap and keyed IP hash.
- Correctness: 02c expel flow wrong, 02b message flow inconsistent.
