# Class diagram — platform — transport-neutral hub

> **Feature**: platform (roadmap brick 7a)
> **Use cases**: UC1, UC2, UC3, UC4, UC5, UC10, UC13
> **Business rules**: BR-001 to BR-034, BR-060, BR-084 to BR-086, BR-088, BR-089
> **Related ADRs**: ADR-0002, ADR-0007, ADR-0011, ADR-0015, ADR-0018; brick 7a owner choices D2 (485/500), D3, D4, D5 (455/500)

## Context

`src/server/hub.ts` holds the live hub state, validates incoming messages, calls the pure domain, writes
the connection log and maps domain effects to protocol messages for the right sockets. It knows no socket
API: transports give it socket keys and send what it returns. Written once, used by the Node transport
(brick 7a) and wrapped by the Hub Durable Object (brick 9). Private conversations
(`hub-private.ts`) and moderation (`hub-moderation.ts`) add their commands to the handler map.

## Diagram

```mermaid
classDiagram
  class Hub {
    <<module createHub(HubDeps)>>
    +open(socketKey, ip, port) void
    +receive(socketKey, raw, now) Promise~Outgoing[]~
    +close(socketKey, now) Promise~Outgoing[]~
    +tick(now) Promise~Outgoing[]~
    +stats() Stats
  }
  class HubDeps {
    +OfficialRoom[] officialRooms
    +Random random
    +hashToken(value) String
    +ConnectionLogStore log
    +String protocols
    +onLogError(error) void
    +closeSocket(socketKey, reason?) void
    +AccountIo accounts
    +Mailer mailer
    +onStoreError(error) void
    +ModerationIo moderation
    +Bytes grantKey
    +Boolean canReport
  }
  class ConnectionLogStore {
    <<interface, src/domain/ports.ts>>
    +open(ConnectionLine) Promise~void~
    +close(connectionId, at) Promise~void~
    +appendContribution(ContributionLine) Promise~void~
  }
  class ConnectionLine {
    +String connectionId
    +String ip
    +Number port
    +String protocols
    +String pseudo
    +String accountId
    +Date openedAt
  }
  class ContributionLine {
    +String connectionId
    +String protocols
    +Date at
  }
  class Socket {
    +String key
    +String ip
    +Number port optional
    +Bound bound optional
    +Number invalid
    +Number unboundSince optional
    +Boolean unboundClosed optional
  }
  class UpgradeLimiter {
    <<src/server/upgrade-limit.ts, used by the transport>>
    +admit(ip, nowMs) ok | perIp | total | rate
    +release(ip) void
    +prune(nowMs) void
  }
  class TokenBucket {
    <<src/server/token-bucket.ts>>
    +take(nowMs) Boolean
    +isFull(nowMs) Boolean
  }
  UpgradeLimiter *-- TokenBucket : one per IP
  class Bound {
    +String sessionId
    +String connectionId
  }
  class Outgoing {
    +String[] to
    +ServerMessage message
  }
  class Stats {
    +Number connected
  }
  class MemoryConnectionLog {
    <<src/transports/node>>
    +lines(): read-only view for tests
  }
  Hub ..> HubDeps
  Hub *-- Socket
  Socket *-- Bound
  Hub ..> Outgoing
  HubDeps --> ConnectionLogStore
  ConnectionLogStore ..> ConnectionLine
  ConnectionLogStore ..> ContributionLine
  MemoryConnectionLog ..|> ConnectionLogStore
  FileConnectionLog ..|> ConnectionLogStore
  class FileConnectionLog {
    <<src/transports/node>>
    +String path
    +purge(now) void
  }
  class FileVault {
    <<src/transports/node>>
    +String path
    +opened(entry) void
    +purge(now) void
  }
  FileVault ..|> LegalVaultStore
  class NodeServerOptions {
    <<src/transports/node>>
    +String logFile optional
    +String vaultFile optional
    +Boolean behindTunnel
    +Boolean secureCookie
    +String staticRoot optional
    +LegalIdentity legal optional
    +String moderatorFile optional
    +String ownerSecret optional
    +String publicOrigin
  }
  NodeServerOptions ..> FileConnectionLog : logFile set
  NodeServerOptions ..> MemoryConnectionLog : logFile absent
  NodeServerOptions ..> FileModeratorStore : moderatorFile set, BR-099
```

## Notes

- `Socket.unboundSince` (BR-089): epoch milliseconds of the first `tick` that saw the socket without a
  session; a bound socket clears it, and `leave` clears it too (a session may enter and leave between two ticks), so the count restarts. When it is 10 minutes old, `tick` calls
  `closeSocket(key, "unbound")` once; `unboundClosed` records that request so later ticks do not repeat it. Setting it from `tick` keeps `open` unchanged and works the same on
  the Durable Object alarm; the cost is an error of one tick at most.
- `UpgradeLimiter` (BR-089) belongs to the transport side of the upgrade: the hub never sees a refused
  upgrade. `createFrameBudget` (BR-088) is a `TokenBucket` of 40 tokens at 20 per second.

## Modules (issues #25, #36)

The hub is split by command group, all behind the same `createHub(HubDeps)`:

| Module | Holds |
|---|---|
| `src/server/hub.ts` | live state, sockets, serial queue, `receive`/`close`/`tick`, entry commands (`enter`, `resume`, `leave`), rooms commands, and the **handler map** |
| `src/server/outgoing.ts` | effect mapping: `sessionOf`, `toMember`, `send`, `error`, `warning`, `keysOf`, `roomJoined`, `roomOutgoing` (with the `roomList` broadcast), `memberAwayInRooms`, `memberBackInRooms` |
| `src/server/hub-moderation.ts` | brick 8a commands (`report`, `listOpenReports`, `expel`, `closeReport`, `confirmSuspension`, `declineSuspension`), the 8c `notAvailable` handler and the statement retry of the tick |
| `src/server/moderation-io.ts` | encryption at rest of reports and keyed hashes of bans around the `ModerationStore` port (ADR-0017) |
| `src/server/moderator-grant.ts` | build and check of the passkey grant (BR-095); replaces the 8a `moderator-token.ts` (BR-091); the used-nonce set lives in `hub.ts`, which runs entries one at a time |
| `src/server/hub-moderators.ts` | brick 8b operations for the `/mod` routes: `createInvitation`, `keepChallenge`, `takeChallenge` (5 min, single use, bound to its purpose and invitation, 200 at most, BR-096), `purge`, and `io` (the `ModeratorIo`) |
| `src/server/moderator-routes.ts` | Hono `/mod/*` routes and the SimpleWebAuthn ceremonies (`moderation/02f`), owner-secret guard (BR-093), 404 behind the tunnel (BR-097) |
| `src/server/moderator-io.ts` | encryption at rest around the `ModeratorStore` port (BR-099) |
| `src/server/hub-private.ts` | brick 6 commands (`sendPrivate`, `closePrivate`, `ignore`, `unignore`, `search`), contribution first for `sendPrivate`, and the private presence of `close`, away and resume |
| `src/server/hub-accounts.ts` | account commands (`requestCode`, `verifyCode`, `signOutEverywhere`, `deleteAccount`) and their `warning unavailable` guard (`platform/04d`) |

```mermaid
classDiagram
  class HubContext {
    <<src/server/hub-accounts.ts>>
    +AccountDeps deps : random, accounts, mailer, onStoreError
    +OutgoingModule out
    +state() HubState
    +setState(HubState) void
  }
  class HandlerMap {
    <<Record keyed by ClientMessage type>>
    +bound(socket, bound, command, now) Promise~Outgoing[]~
  }
  class OutgoingModule {
    <<src/server/outgoing.ts>>
    +send(to, type, payload) Outgoing
    +error(socketKey, code, replyTo, text = code) Outgoing
    +warning(socketKey, code, replyTo) Outgoing
    +keysOf(sessionIds) String[]
    +roomJoined(roomId) Payload
    +roomOutgoing(effects, replyTo) Outgoing[]
    +memberAwayInRooms(session) Outgoing[]
    +memberBackInRooms(session) Outgoing[]
  }
  class AccountHandlers {
    <<src/server/hub-accounts.ts>>
    +requestCode(caller, command, now)
    +verifyCode(caller, command, now)
    +signOutEverywhere(caller, command, now)
    +deleteAccount(caller, command, now)
    +unlink(filter) Outgoing[]
  }
  Hub ..> HandlerMap
  HandlerMap ..> AccountHandlers
  Hub ..> OutgoingModule
  AccountHandlers ..> HubContext
  Hub ..> HubContext
```

- **Handler map**: every `ClientMessage['type']` except `enter` and `resume` has an entry, so the type
  checker refuses a missing command. `enter` and `resume` are handled before the map because they need a
  socket without session. The brick 8c commands map to one `notAvailable` handler in `hub-moderation.ts`.
- **Error text** defaults to the code (`error(key, "forbidden")` sends `message: "forbidden"`); only
  `frameTooLarge` and `notAvailable` pass a different text.
- Each account handler is wrapped in the same guard: a store failure answers `warning unavailable` and
  commits nothing. `unlink` also serves `signOutDevice`.

## Rules the code applies

- **Tester exposure files (ADR-0018, BR-084)**: `FileVault` and `FileConnectionLog` close, when they are built,
  every account and connection a previous process left open; the transport runs `purge` on both files at start-up and once a day, since the hub tick
  calls `purgeExpired` every second. With the tunnel flag the transport refuses to start without every
  ADR-0017 key or off loopback (BR-085).

- **Serial**: `receive`, `close` and `tick` run one after the other (a promise queue), so an awaited log
  write never lets another operation see a stale state; an operation that throws does not block the next.
- **One mutable place**: the hub keeps the current `HubState` (`emptyHubState(officialRooms)`) and a map
  socket key → `Socket`. Domain functions stay pure; the hub swaps in the returned state.
- **Incoming** (`receive`): text over 65 536 code units → `error { code: "invalid", message: "frameTooLarge" }`;
  invalid JSON or a message failing `clientMessage` → `error { code: "invalid", message: "invalid", replyTo }`
  (`replyTo` when a `seq` could be read). The socket stays open. An unknown socket key yields nothing.
- **Socket binding**: `bound` (session id and connection id) is set once `log.open` succeeds and cleared on
  `leave`; a socket without `bound` has no session.
- **Socket without session**: only `enter` and `resume` are accepted; anything else → `error forbidden`.
  `enter` or `resume` on a socket that already has a session → `error invalid`.
- **Moderation commands** (brick 8a): a chatter gets `error forbidden`; `report` answers `error invalid` with message `notAvailable` when `canReport` is false; the 8c commands always answer `notAvailable`.
- **enter** (`entry/02a`): `activeBan` comes from `moderation.activeBan` (brick 8a), `accountId` from the device cookie (brick 5). On `entered` the hub
  draws a connection id (`random.id()`), awaits `log.open`, stores session id and connection id on the
  socket, then sends `entered { sessionId, resumeToken, roomList, isModerator, moderatorName?, canReport }`. If `log.open`
  fails, the new state is dropped (the pseudo stays free) and the sender gets `error logUnavailable`; a
  failed resume likewise leaves the session away.
- **resume** (`entry/02b`): the hub hashes the token with `hashToken` and passes `accountStillExists: true`
  until brick 5. If the token matches a connected session still bound to another socket (not swept
  yet), that socket is unbound first as on `close` (`socketLost`, `log.close`), then `closeSocket` asks the
  transport to close it (the displaced page still pings); `memberAway` is sent only if
  the resume then fails. On `resumed` it opens a new connection line like `enter`, then sends
  `resumed { sessionId, pseudo, resumeToken, rooms, windows, buffered }` (brick 6: `windows` from `windowsOf`, `buffered` from the domain effect), `rooms` built with `roomMembers` for each room of the
  session, then `roomList` to the resumer only (its list is stale after the loss), then `memberBack` to the
  other connected members of each room, then `privateWindow` (the resumer as `other`) to each connected
  partner whose window on it is open.
- **leave**: `hub.leave`, `log.close` for the socket's connection id; the socket stays open without session,
  so the client can enter again.
- **Invalid frames** (BR-088): each socket keeps a count of invalid frames in a row (not JSON, refused by
  `clientMessage`, over `CAPS.frame`); any valid frame resets it. The fifth answers `error invalid`, then
  `closeSocket(key, "invalidFrames")`, which the transport sends as close 1008. A resume's `closeSocket`
  passes no reason and keeps the default close. A `ping` never reaches the hub, so it neither counts nor
  resets.
- **Socket closed** (`close`): a connected session goes through `socketLost`; `log.close`; `memberAway` to
  the other connected members of each of its rooms, and `memberAway` without `roomId` to each connected
  partner whose window on it is open. A socket without session is just forgotten.
- **Contribution first** (`rooms/02`, BR-060, D5): for `postRoom` and `createRoom` the hub computes the
  domain result, awaits `log.appendContribution` (connection id, protocols, now) when the result holds
  `roomMessage` or `roomCreated`, and only then keeps the new state and sends. If the write fails, the old
  state is kept and the sender gets `error logUnavailable`. The content id, operation and date fields are
  added only under an injunction (BR-060): not in brick 7a. Brick 6: `sendPrivate` follows the same rule
  when the result holds `privateMessage` (`private-conversations/02`).
- **Log failures**: every failed write goes to `onLogError` for the operator. A failed `log.open` or
  `appendContribution` also refuses the command (`logUnavailable`); a failed `log.close` never refuses the
  close or the leave.
- **Effect mapping**:

| Domain effect | Sent | To |
|---|---|---|
| `entryRefused` | `entryRefused { reason, bannedUntil? }` | sender |
| `invalid` | `error { code: "invalid" }` | sender |
| `resumeRefused` | `resumeRefused` | sender |
| `roomJoined` | `roomJoined { roomId, members }` from `roomMembers` | the joiner |
| `memberJoined` | `memberJoined { roomId, member }` | connected members of the room except the subject |
| `memberLeft` | presence `{ roomId, sessionId, pseudo }` | same |
| `wentAway` | `memberAway` presence per room of the session | connected members of each room except the subject |
| `resumed` | `memberBack { roomId, member }` per room of the session | same |
| `roomMessage` | `roomMessage { …, gender, sentAt }`, gender from the author's profile | `recipients` |
| `roomRefused` | `warning { code: reason, message: reason, replyTo }` | sender |
| `privateRefused` | `error { code }` for `accountRequired` and `offline`, else `warning { code: reason }`, with `replyTo` | sender |
| `privateWindowOpened` | `privateWindow { conversationId, other }`, `other` = the other side as `otherChatter` | that side |
| `privateMessage` | `privateMessage { conversationId, authorSessionId, text, sentAt }` | `recipients` |
| `ignoreUpdated` | `ignoreUpdated { ignored }` | the session |
| `partnerLeft` | `memberLeft { sessionId, pseudo }` without `roomId` | `recipients` |
| search hits (`directory/07`) | `searchResults { results }` with `rooms` per hit | the searcher |
| `roomCreated`, `roomDeleted`, `closed` | nothing of their own | — |

- **Member shape** (D4): `roomMembers` sessions map to the protocol `member` union: a connected session gives
  `{ away: false, sessionId, pseudo, hasAccount, gender, age, city? }` (city omitted when empty), an away
  session `{ away: true, sessionId, pseudo, hasAccount }`. `hasAccount` is `accountId !== undefined`
  (brick 6).
- **Room list**: after every command or tick that changed membership or the set of rooms, the hub sends
  `roomList` to every connected session. Fine at V1 traffic; to batch in the Durable Object if needed
  (brick 9).
- **tick(now)**: `expireAway` (sends the resulting `memberLeft`), `pruneFlood`, `pruneEntryAttempts`.
- **stats()**: `connected` = number of sessions, connected and away. No pseudo, no list (`GET /api/stats`).
- **Memory connection log** (Node, D5): keeps lines in memory only, never on disk, at most the last 10 000;
  enough for development and tests. The SQLite store with the 1-year retention arrives in brick 9.
- **Protocols** field: `"HTTP/1.1 WebSocket"` on Node (`ws` on plain HTTP in development); the Cloudflare
  transport passes its own value.
- `src/domain/ports.ts` declares only types (ports), so the dependency rule holds: `src/server` imports
  `src/domain` and `src/shared/protocol`, never a transport.

- Brick 8b (#210): `grantKey` is the random key drawn at start (BR-095), shared by the hub and the `/mod`
  routes; the transport builds the moderator operations (`hub-moderators.ts` over `moderator-io.ts` and the
  `ModeratorStore`, file or memory, BR-099) and hands them to the routes only, not to `HubDeps`; `moderatorTokenDigest` and `ASV_MODERATOR_TOKEN` are gone.
  The entry checks the grant, then the entry rules, and consumes the nonce only on `entered`.
- Brick 8a (#209): `moderation` is the encrypted moderation store, `moderatorTokenDigest` (removed in 8b) the digest
  of `ASV_MODERATOR_TOKEN` (absent: no grant), `canReport` false behind the tester tunnel. Moderation
  commands live in `hub-moderation.ts`: `error(forbidden)` for a non-moderator comes before any other
  check, `error(invalid, notAvailable)` for the 8c commands. The entry checks `activeBan` before the
  domain; a store failure answers `warning(unavailable)`. The tick retries refused statements of reasons every
  10 minutes, never awaited.
