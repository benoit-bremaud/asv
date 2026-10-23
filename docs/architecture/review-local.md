# Local review — asv (branch diff main...feat/18-domain-rooms)

- Date: 2026-10-23
- Commit: reviewed edcff02, fixes in the following commits
- Scope: branch diff `main...HEAD` (brick 4: study `rooms/07`, domain rooms, posting, session close leaving rooms)
- Checks run: design · docs · tests · security · correctness
- Verdict: ship after fixes · Must 0 · Should 15 (fixed, 2 through owner decisions R1 and R2) · Nice 14 (9 fixed, 5 accepted)

## Pre-merge gate (head SHA of the fix commit)
| Step | Result |
|---|---|
| 1 Tests | ✅ 159 Vitest tests (domain, protocol, server, web, lint fixtures) |
| 2 Coverage | tests 100 % stmts / 100 % branches / 100 % funcs / 100 % lines (floor 80) · docs: every export of `rooms.ts`, `hub.ts`, `official-rooms.ts` documented (floor 90; 79 % before fixes) |
| 3 SonarQube | run with `pnpm sonar` after push, result in the PR |
| 4 Secrets | ✅ gitleaks clean (`main..HEAD`) · no tracked .env · diff read: nothing sensitive (test IPs from RFC 5737 ranges) |
| 5 QA pass | pure domain, no runtime path yet (no transport wired): `pnpm build` green, unit suite is the artefact check |

## 🔴 Must Have
_None._

## 🟡 Should Have
- `src/domain/rooms.ts` `joinRoom`, `createRoom` `[security]` · unbounded `session.rooms` through room churn (attachment size, list scans) · owner R1 (435/500): new BR-024, at most 10 rooms per session, `tooManyRooms`.
- `src/domain/rooms.ts` `restoreHubState` `[security|correctness]` · refs from many sockets were trusted · rules checked again: first ref per id and name key, one owned room per session, duplicate memberships dropped, rooms rebuilt field by field.
- `src/domain/index.ts` `[design]` · `vacateRooms` was public, so the transport could skip the D6 cleanup · explicit export list.
- `src/domain/rooms.ts` `WORD` `[design]` · BR-001 characters duplicated · `PSEUDO_CHARS` exported once from `pseudo.ts`.
- `src/domain/rooms.ts`, `hub.ts` `[docs]` · 6 exports undocumented, weak `vacateRooms` contract, `createRoom` and `leaveRoom` docs incomplete · documented.
- `docs/architecture/diagrams/rooms/07-class-domain-api.md` `[docs]` · `memberJoined` missing after `createRoom`, `leaveRoom` on away sessions unspecified · added.
- `src/domain/rooms.test.ts` `[tests]` · limits read from `ROOM_LIMITS` (tests follow a changed constant), refused `empty`/`tooLong` not shown uncounted, check order of `createRoom`, `postRoom` to an unknown room or from an away author, reference-identity assertion · fixed with literals, a `ROOM_LIMITS` pin and new cases.

## 🔵 Nice to Have
- `src/domain/rooms.ts` `[security]` · punctuation-only names and `Paris.` next to `Paris` · owner R2 (420/500): a letter or digit required, uniqueness key keeps letters and digits only. Fixed.
- `src/domain/hub.ts` `[design]` · second `memberLeft` for a room already deleted when two expiries share it · skipped, test added. Fixed.
- `src/domain/rooms.ts` `[design]` · `withoutOwner` helper, `existing` rename · fixed.
- `src/domain/rooms.test.ts` `[tests]` · capacity boundary and rejoin of a full room, flood per session, official room kept on close, trim boundaries · added.
- `src/server/official-rooms.test.ts` `[tests]` · duplicate of the configuration-order test · removed.
- Accepted: flood counters reset on rebuild (ADR-0011 already accepts it); long UC10 effect-order assertion kept (the order is the contract); BR-034 negative check kept with the newcomer behaviour implied by `joinRoom` effects; doc WHY notes on `restoreHubState` remarks merged into its docstring; validating official names against BR-030 left to the config test on uniqueness.

## ⚪ Disagree / Intentional
- `src/domain/entry.ts` `Session.rooms` `[design]` · room knowledge in entry · owner choice D1.
- `src/domain/entry.ts` generics `<S extends EntryState>` `[design]` · rule "State" of `rooms/07`.
- `src/domain/rooms.ts` `roomMembers` full scan `[design]` · KISS at 50 members and a few hundred sessions, follows D1.

## Per-dimension summary
- Design: dependency rule held, study followed; public `vacateRooms` and duplicated character set fixed.
- Docs: no stale doc; coverage brought from ~79 % to full.
- Tests: no false-confidence test; literals pinned, gaps filled.
- Security: no Must; room churn and rebuild trust fixed, name spoofing closed by R2.
- Correctness: no bug found on the main paths; presence after a double expiry tidied.
