# Local review — asv (brick 7a, branch diff main...HEAD)

- Date: 2026-10-23
- Commit: a491d1d
- Scope: branch diff `main...feat/13-brick-7a-transport-ui`
- Checks run: design · docs · tests · security · correctness · execution gate · QA pass
- Verdict: **fix Must Have first** · Must 4 · Should 8 · Nice 7

## Pre-merge gate (head SHA a491d1d)
| Step | Result |
|---|---|
| 1 Tests | ✅ 356 unit/component/integration (node + jsdom projects), including real `ws` integration tests in `server.test.ts` · no E2E suite in the project yet |
| 2 Coverage | tests 99.77 % stmts / 99.48 % branches / 99.18 % funcs / 99.86 % lines (floor 80) · docs ≈ 70 % presence on the changed public surface (floor 90): **red**, see Must 3 |
| 3 SonarQube | ❌ FAILED on the first push (14 new issues: deprecated `FormEvent`, `role="status"`, index keys, needless `async`, default stringification) → fixed in `0c3a87d` → ✅ PASSED (new coverage 99.2 %, 0 duplication, 0 new issues) |
| 4 Secrets | ✅ gitleaks clean (`--all`, 12 commits) · no tracked `.env*` · diff read: nothing sensitive |
| 5 QA pass | ✅ full · entry → resume after reload → rooms → join Lyon → post (smiley rendered, `<b>` stays literal text) · light, dark, 375 px (no horizontal overflow, `scrollWidth` 375) · a11y names correct (`pseudo`, `âge`, `ville`, both checkboxes) · console: transient `502` and `ws` connection failures only while the dev server restarted, reconnection recovered · screenshots: `qa/2026-10-23-brick7a-{entry,room,rooms-dark,rooms-light,rooms-mobile}.jpg` |

The Chrome pass was cut short: another extension blocked the Claude in Chrome tab after the entry screenshot. The rest of the pass ran in the app's built-in Chromium browser.

- Gate: **GREEN on `0c3a87d` after the fixes** (Resolution below). A clean restart of the dev server and a new entry worked; the only console errors were `ws` retries while the Node server was still starting.

## Resolution (owner choice B, 420/500)

The 4 Must and 7 of the 8 Should were fixed on the branch: both diagrams were updated, public docstrings added, the stats request is aborted on unmount and that test now asserts it, failed log writes are reported, `Gender` is defined once, `LocalAction` narrows what screens can dispatch, a missing `roomId` changes nothing, Vite ignores `coverage/`, and the hub and transport tests have stronger assertions and bounded waits. After the fixes there are 357 tests at 99.77 / 99.48 / 99.18 / 99.86 %. The socket caps go to an issue for brick 9, and the Nice items go to issues.

## 🔴 Must Have
- `docs/architecture/diagrams/web-ui/04-class-client-state.md` `[design]`: drifted from `src/web/store.ts:44` and `src/web/connection.ts:30`. Differences:
  - the `Action` union (`entering`, `left`, `closeRoom`, `notice`, `dismissNotice`; no `resumeFailed`);
  - the `createConnection(deps)` signature and `send(Command): void`;
  - the `ChatState` fields (`pendingPseudo`, `lastPseudo`, `nextLineId`, `known: Record`);
  - notices stored as codes, not French text.

  Fix: update the diagram, since the code is the better design.
- `docs/architecture/diagrams/platform/04c-class-server-hub.md:28,54,87,101` `[design|docs]`: the diagram no longer matches the hub.
  - `HubDeps` lacks `protocols` and `onLogError`.
  - `Socket` holds `bound?` and an optional `port`.
  - Resume also sends `roomList` to the resumer.
  - The frame-too-large message is `frameTooLarge`.
  - A failed `log.close` is only reported.

  Fix: update the diagram.
- `src/server/hub.ts:55`, `src/transports/node/server.ts:17,30`, `src/web/connection.ts:28-45`, `src/web/store.ts:7-58` and `src/web/chat-context.tsx:23,35,65` `[docs]`: the public API is undocumented (`Hub`, `NodeServerOptions` with its millisecond units and defaults, `ConnectionDeps`, `Connection`, the timers, the state types, `ChatProvider` and `useChat`). The `ConnectionFactory` doc is wrong: it says storage is injected. The comment on `Outbound` belongs on `Command`. Fix: add one-line docstrings.
- `src/web/App.test.tsx:247-261` `[tests]`: "ignores a late stats after unmount" cannot fail, because React 19 does not warn on an update after unmount. Fix: assert the observable effect, or delete the test.

## 🟡 Should Have
- `src/server/hub.ts:226,330` `[design|security]`: failed `log.open` and `appendContribution` writes go to the client as `logUnavailable` but are never reported to `onLogError`. Legal log failures (BR-060) stay invisible to the operator. Fix: call `deps.onLogError(cause)` in both catches.
- `src/web/store.ts:9`, `screens/Pseudo.tsx:4`, `screens/RoomScreen.tsx:11` and `screens/EntryScreen.tsx:6` `[design]`: `Gender` is defined four times, once as a hand-written union. Fix: export `Gender` from the protocol.
- `src/web/chat-context.tsx` (`local(action: Action)`) `[design]`: screens can dispatch server actions. Fix: narrow the parameter to `showRooms | showRoom | dismissNotice`.
- `src/web/store.ts:134,140` `[correctness]`: `roomId ?? ""` stands in for a missing room id. Fix: return early when `roomId` is missing.
- `src/transports/node/server.ts:66-101` `[security]`: nothing caps concurrent sockets per IP or in total, so a socket that never enters can be kept open with pings. Fix: add caps in `upgrade` (429/503) and close a socket that is still unbound after N seconds. Can be filed for brick 9, where the Durable Object adds its own limits.
- `vite.config.ts` `[correctness]`: the dev server watches `coverage/`, so `pnpm verify` reloads open pages. Fix: add `server.watch.ignored: ["**/coverage/**"]`.
- `src/server/hub.test.ts:211,295,310,336,366` `[tests]`: `toBeDefined()` after `only(...)` adds nothing, so the queue-order test does not prove the order. Fix: assert on the payloads.
- `src/transports/node/server.test.ts:92-123` `[tests]`: the `next()` helper has no timeout, and `expect.poll` uses the default timeouts. Fix: bound `next()` with a named rejection, and give `poll` an explicit timeout.

## 🔵 Nice to Have
- `src/transports/node/memory-log.ts:19-27` `[security]`: each write copies the whole array, O(10 000) work per write. Fix: use `push` + `shift` and update closes in place.
- `src/web/connection.ts:105,150` `[correctness]`: `pendingProfile` is never cleared after `entered` or `entryRefused`.
- `src/web/connection.ts:118-145` `[correctness]`: there is no connect timeout, and reconnection after a pong timeout waits for the late `onclose`.
- `src/web/connection.ts:131` `[design]`: `resume` builds its `seq` by hand instead of going through `write`.
- `src/server/hub.ts:85,136,153` `[design]`: an untyped `Set<string>` of effect names, repeated `error(…, "invalid", "invalid")`, and a type-switched `presenceInRooms`.
- `eslint.config.js:47` `[design]`: no import boundary for `src/web/**`.
- `src/web/App.test.tsx:184-232` `[tests]`: the 30 s refresh test does not check the new value, and the footer and plural tests restate constants (use `it.each`).

## ⚪ Disagree / Intentional
- `src/server/hub.ts:386` `[correctness]`: `stats().connected` counts away sessions. This is intentional: `04c` says "connected and away".
- `src/server/hub.ts` size (388 lines) `[design]`: the handler-map split waits for brick 6 (YAGNI). Noted in `04c`.
- `src/domain/ports.ts` and `SocketLike` `[design]`: seams justified by test fakes and the brick 9 SQLite store.

## Per-dimension summary
- Design: dependency rule holds and there is no over-engineering. Two diagrams drifted (fix the docs, not the code), plus minor leaks and duplication.
- Docs: about 70 % presence on the public surface; `04c` and `web-ui/04` are stale.
- Tests: healthy pyramid with boundary-only doubles. One test cannot fail, and some assertions are weak.
- Security: Origin check, caps, XSS-safe rendering, HMAC token hashing and personal data all hold. There is no socket-count cap.
- Correctness: no blocking bug. There are small client reconnect and cleanup issues.
