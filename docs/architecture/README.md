# asv — architecture

## Context

asv is a retro web chat (Caramail spirit). Adults only, session pseudos, public rooms and private
conversations. To be hosted on Cloudflare (Workers + one Hub Durable Object), developed and tested on Node.

## Decisions

| ADR | Decision |
|---|---|
| [0001](decisions/0001-name-and-domain.md) | Name asv, domain asvchat.fr |
| [0002](decisions/0002-stack.md) | Hono, pure domain, Node transport for dev, Durable Objects in production |
| [0003](decisions/0003-flat-single-package.md) | Flat single package |
| [0004](decisions/0004-audience-adults-only.md) | 18+ only, self-declared |
| [0005](decisions/0005-identity-session-first.md) | Session pseudo in V1, accounts in V2 |
| [0006](decisions/0006-pseudo-colours.md) | Pink / blue / grey, gender optional |
| [0007](decisions/0007-single-hub-durable-object.md) | Single Hub Durable Object in production |

## Diagrams — chat-core

| File | Kind |
|---|---|
| [01-use-case](diagrams/chat-core/01-use-case.md) | uc |
| [02a-sequence-join-room-and-post](diagrams/chat-core/02a-sequence-join-room-and-post.md) | sd |
| [02b-sequence-open-private-conversation](diagrams/chat-core/02b-sequence-open-private-conversation.md) | sd |
| [02c-sequence-report-and-expel](diagrams/chat-core/02c-sequence-report-and-expel.md) | sd |
| [03-component](diagrams/chat-core/03-component.md) | cmp |
| [04-class](diagrams/chat-core/04-class.md) | cd |
| [05-state-session](diagrams/chat-core/05-state-session.md) | stm |
| [06-data-flow](diagrams/chat-core/06-data-flow.md) | data-flow |

Coverage: [traceability matrix](traceability-matrix.md).

## Open questions

- How a moderator authenticates in V1 (secret moderator key is the likely answer).
- Reconnection grace period before a pseudo is freed.
- Retention periods for connection logs, reports and bans (legal check on Légifrance).
- Shared protocol types between web and server (`src/shared/` seam), decided in brick 2.
