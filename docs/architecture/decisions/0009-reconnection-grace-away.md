# ADR-0009 — Five-minute reconnection grace with an "away" status

- Status: accepted
- Date: 2026-10-15
- Deciders: Benoît Bremaud

## Context

On phones, locking the screen or switching apps suspends the page and kills the WebSocket. Close
events are not always reliable on iOS Safari, so a heartbeat is required
([Apple forum](https://developer.apple.com/forums/thread/716118),
[WebKit bug 247943](https://bugs.webkit.org/show_bug.cgi?id=247943)).
Without a grace period, a chatter loses pseudo and private windows at every pause.

## Options and MCDA

Scores 0–5. Criteria: mobile comfort 35, simplicity 20, ghost presence 15, resume token security 15,
memory and load 15.

| Option | Comfort | Simplicity | Ghosts | Token | Load | Total /500 |
|---|---|---|---|---|---|---|
| **C. 5 minutes + "away" status** | 5 | 3 | 3 | 4 | 3 | **385** |
| D. 2 minutes + "away" status | 4 | 3 | 4 | 4 | 4 | 380 |
| A. No grace | 1 | 5 | 5 | 5 | 5 | 360 |
| B. 30 seconds | 3 | 3 | 4 | 4 | 4 | 345 |

Sensitivity: fragile. With ghosts 25 and comfort 25, A leads (400 vs 365 for C). The "away" status
is what keeps ghosts acceptable in C.

## Decision

- At entry the server gives the client a random resume token, kept in `sessionStorage`.
- Heartbeat: the client pings every 25 seconds. No ping for 60 seconds means the socket is dead
  (mechanism in ADR-0011).
- On disconnect, the session becomes **Away** for up to 5 minutes. Others see the pseudo with the
  "absent" style defined in `design-pack.md`. Room membership and private windows are kept.
- Private messages sent to an away chatter are buffered, up to 50 per session, then dropped oldest
  first. Room messages are not buffered.
- On reconnect with a valid token, the session resumes and receives the buffered messages. The token
  rotates at each resume.
- After 5 minutes without resume, the session closes and the pseudo is freed.

## Consequences

- One more session state (`Away`) and one more use case (UC13 Resume my session).
- The hub keeps away sessions in memory: bounded by the 5-minute window and the buffer cap.
