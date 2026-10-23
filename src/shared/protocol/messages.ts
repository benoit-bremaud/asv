/**
 * WebSocket protocol contract shared by the web client and the server
 * (study `platform/04-class-protocol`, ADR-0015).
 *
 * Schemas check the shape of a message and cap every string (transport caps,
 * issue #13). Business rules (pseudo format, text length, rate limits) belong
 * to `src/domain`; the caps leave a margin over them so the domain still gives
 * its precise refusal.
 */
import * as z from "zod/mini";

/** Transport caps of `platform/04`, in UTF-16 code units; `frame` also in bytes on the wire. */
export const CAPS = {
  frame: 65_536,
  id: 64,
  pseudo: 64,
  city: 160,
  text: 2_000,
  roomName: 120,
  query: 64,
  email: 254,
  code: 16,
  moderatorGrant: 512,
  excerpt: 2_000,
  contextLine: 1_000,
  contextLines: 20,
} as const;

const capped = (max: number) => z.string().check(z.maxLength(max));
const id = z.string().check(z.minLength(1), z.maxLength(CAPS.id));
const pseudo = capped(CAPS.pseudo);
const text = capped(CAPS.text);
const isoDate = z.iso.datetime();

/** Builds one envelope `{ type, seq, payload }` for a given message type. */
const message = <T extends string, P extends z.ZodMiniType>(type: T, payload: P) =>
  z.object({ type: z.literal(type), seq: z.int().check(z.nonnegative()), payload });

const empty = z.object({});

/** BR-005. Used for display only, never persisted. */
export const gender = z.enum(["woman", "man", "unspecified"]);
/** Official rooms are themed or regional, user rooms are created by chatters (`rooms` study). */
export const roomKind = z.enum(["themed", "regional", "user"]);
/** BR-050. */
export const reportReason = z.enum(["harassment", "seemsMinor", "spam", "illegalContent", "other"]);
/** What a report points at (`moderation/04-class`). */
export const reportTarget = z.enum(["chatter", "message", "room"]);
/** BR-057. The AI triage never sets an outcome (ADR-0010). */
export const reportOutcome = z.enum([
  "noAction",
  "warned",
  "expelled",
  "suspended",
  "severeDeleted",
  "roomRemoved",
]);
/** Urgency suggested by the AI triage, for sorting only (ADR-0010). */
export const urgency = z.enum(["unknown", "low", "medium", "high"]);
/** Expulsion lengths a moderator may pick. */
export const expelDuration = z.enum(["1h", "24h", "7d"]);
/** Why an entry was refused; `banned` comes with `bannedUntil`. */
export const entryRefusal = z.enum(["rate", "banned", "pseudoInvalid", "pseudoTaken", "age"]);
/**
 * Codes of the `error` message; `offline` means the private message target is gone,
 * `logUnavailable` that the connection log could not be written (BR-060).
 */
export const errorCode = z.enum(["offline", "accountRequired", "forbidden", "invalid", "logUnavailable"]);

/** Self-declared profile; age bounds (BR-004) are checked by the domain. */
const profile = z.object({
  gender: z.optional(gender),
  age: z.int(),
  city: z.optional(capped(CAPS.city)),
});

const roomTarget = z.object({ roomId: id });
const sessionTarget = z.object({ targetSessionId: id });
const suspensionTarget = z.object({ accountId: id, reportId: id });

/** Every message a client may send, discriminated on `type`. */
/** What `resume` carries; the client also checks its saved session against it (ADR-0011). */
export const resumePayload = z.object({ resumeToken: id, profile });

export const clientMessage = z.discriminatedUnion("type", [
  message(
    "enter",
    z.extend(profile, {
      pseudo,
      adultConfirmed: z.boolean(),
      termsAccepted: z.boolean(),
      moderatorGrant: z.optional(capped(CAPS.moderatorGrant)),
    }),
  ),
  message("resume", resumePayload),
  message("joinRoom", roomTarget),
  message("leaveRoom", roomTarget),
  message("createRoom", z.object({ name: capped(CAPS.roomName) })),
  message("postRoom", z.object({ roomId: id, text })),
  message("sendPrivate", z.object({ targetPseudo: pseudo, text })),
  message("ignore", sessionTarget),
  message("unignore", sessionTarget),
  message("search", z.object({ query: capped(CAPS.query) })),
  message(
    "report",
    z.object({
      targetKind: reportTarget,
      targetPseudo: z.optional(pseudo),
      targetRoomId: z.optional(id),
      reason: reportReason,
      excerpt: capped(CAPS.excerpt),
      // BR-051: at most 20 context lines the reporter saw.
      context: z.array(capped(CAPS.contextLine)).check(z.maxLength(CAPS.contextLines)),
    }),
  ),
  message("listOpenReports", empty),
  message("warn", z.object({ targetSessionId: id, text })),
  message(
    "expel",
    z.object({
      targetSessionId: id,
      duration: expelDuration,
      severe: z.optional(z.boolean()),
      reportId: z.optional(id),
    }),
  ),
  message("closeReport", z.object({ reportId: id, outcome: reportOutcome })),
  message("confirmSuspension", suspensionTarget),
  message("declineSuspension", suspensionTarget),
  message("removeRoom", roomTarget),
  message("requestCode", z.object({ email: capped(CAPS.email), remember: z.boolean() })),
  message("verifyCode", z.object({ code: capped(CAPS.code) })),
  message("signOutEverywhere", empty),
  message("deleteAccount", empty),
  message("leave", empty),
]);

const roomSummary = z.object({ id, name: z.string(), kind: roomKind, count: z.int() });
/** An away session has no profile (ADR-0011): `member` is a union on `away` (issue #21). */
const awayChatter = z.object({ sessionId: id, pseudo: z.string(), away: z.literal(true) });
const connectedMember = z.object({
  sessionId: id,
  pseudo: z.string(),
  away: z.literal(false),
  gender,
  age: z.int(),
  city: z.optional(z.string()),
});
const member = z.discriminatedUnion("away", [connectedMember, awayChatter]);
const otherChatter = z.discriminatedUnion("away", [
  z.pick(connectedMember, { sessionId: true, pseudo: true, away: true, gender: true }),
  awayChatter,
]);
const roomJoined = z.object({ roomId: id, members: z.array(member) });
const presence = z.object({ roomId: z.optional(id), sessionId: id, pseudo: z.string() });
const roomMessage = z.object({
  roomId: id,
  authorSessionId: id,
  pseudo: z.string(),
  gender,
  text: z.string(),
  sentAt: isoDate,
});
const privateWindow = z.object({
  conversationId: id,
  other: otherChatter,
});
const privateMessage = z.object({
  conversationId: id,
  authorSessionId: id,
  text: z.string(),
  sentAt: isoDate,
});
/** `replyTo` is the `seq` of the client message that caused the notice. */
const replyTo = z.optional(z.int().check(z.nonnegative()));

/** Every message the server may send, discriminated on `type`. */
export const serverMessage = z.discriminatedUnion("type", [
  message(
    "entered",
    z.object({
      sessionId: id,
      resumeToken: id,
      roomList: z.array(roomSummary),
      isModerator: z.boolean(),
      accountId: z.optional(id),
      staleDevice: z.optional(z.boolean()),
    }),
  ),
  message("entryRefused", z.object({ reason: entryRefusal, bannedUntil: z.optional(isoDate) })),
  message(
    "resumed",
    z.object({
      // The session identity, so the client can show its pseudo again (it is not stored, ADR-0011).
      sessionId: id,
      pseudo: z.string(),
      resumeToken: id,
      rooms: z.array(roomJoined),
      windows: z.array(privateWindow),
      // BR-013: only private messages are buffered while away, never room messages.
      buffered: z.array(privateMessage),
      accountId: z.optional(id),
    }),
  ),
  message("resumeRefused", empty),
  message("roomList", z.object({ rooms: z.array(roomSummary) })),
  message("roomJoined", roomJoined),
  // Arrivals carry the member, so the list shows age and city without another request.
  message("memberJoined", z.object({ roomId: id, member })),
  message("memberLeft", presence),
  message("memberAway", presence),
  message("memberBack", z.object({ roomId: id, member })),
  message("roomMessage", roomMessage),
  message("privateWindow", privateWindow),
  message("privateMessage", privateMessage),
  message("ignoreUpdated", z.object({ ignored: z.array(id) })),
  message(
    "searchResults",
    z.object({
      results: z.array(
        z.discriminatedUnion("away", [
          z.extend(connectedMember, { rooms: z.array(id) }),
          z.extend(awayChatter, { rooms: z.array(id) }),
        ]),
      ),
    }),
  ),
  message("reportSent", z.object({ reportId: id })),
  message(
    "openReports",
    z.object({
      reports: z.array(
        z.object({
          id,
          reason: reportReason,
          targetKind: reportTarget,
          targetPseudo: z.optional(z.string()),
          targetRoomId: z.optional(id),
          excerpt: z.string(),
          context: z.array(z.string()),
          authorPseudo: z.string(),
          createdAt: isoDate,
          // Set once the AI triage ran; a human decides (ADR-0010).
          triage: z.optional(z.object({ category: z.string(), urgency, summary: z.string() })),
        }),
      ),
    }),
  ),
  message("warned", z.object({ rule: z.string(), text: z.string(), activeStrikes: z.int() })),
  message("expelled", z.object({ until: isoDate })),
  message("reportClosed", z.object({ reportId: id })),
  message("suspensionProposed", z.object({ accountId: id, reportId: id, activeStrikes: z.int() })),
  message("roomClosed", roomTarget),
  message("codeSent", empty),
  message("accountLinked", z.object({ accountId: id, deviceClaim: z.optional(z.string()) })),
  message("accountUnlinked", empty),
  message("warning", z.object({ code: z.string(), message: z.string(), replyTo })),
  message("error", z.object({ code: errorCode, message: z.string(), replyTo })),
]);

/** Inferred from {@link clientMessage}. */
export type ClientMessage = z.infer<typeof clientMessage>;
/** Inferred from {@link serverMessage}. */
export type ServerMessage = z.infer<typeof serverMessage>;
/** Gender of a profile; drives the pseudo colour (ADR-0006). */
export type Gender = z.infer<typeof gender>;
/** A room member as sent in `roomJoined` and `resumed`. */
export type Member = z.infer<typeof member>;
