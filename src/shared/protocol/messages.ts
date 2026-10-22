/**
 * WebSocket protocol contract shared by the web client and the server
 * (study `platform/04-class-protocol`, ADR-0015).
 *
 * Schemas check the shape of a message only. Business rules (pseudo format,
 * text length, rate limits) belong to `src/domain`.
 */
import * as z from "zod/mini";

const id = z.string().check(z.minLength(1));
const isoDate = z.iso.datetime();

/** Builds one envelope `{ type, seq, payload }` for a given message type. */
const message = <T extends string, P extends z.ZodMiniType>(type: T, payload: P) =>
  z.object({ type: z.literal(type), seq: z.int().check(z.nonnegative()), payload });

const empty = z.object({});

export const gender = z.enum(["woman", "man", "unspecified"]);
export const roomKind = z.enum(["themed", "regional", "user"]);
export const reportReason = z.enum(["harassment", "seemsMinor", "spam", "illegalContent", "other"]);
export const reportTarget = z.enum(["chatter", "message", "room"]);
export const reportOutcome = z.enum([
  "noAction",
  "warned",
  "expelled",
  "suspended",
  "severeDeleted",
  "roomRemoved",
]);
export const urgency = z.enum(["unknown", "low", "medium", "high"]);
export const expelDuration = z.enum(["1h", "24h", "7d"]);
export const entryRefusal = z.enum(["rate", "banned", "pseudoInvalid", "pseudoTaken", "age"]);
export const errorCode = z.enum(["offline", "accountRequired", "forbidden", "invalid"]);

const profile = z.object({
  gender: z.optional(gender),
  age: z.int(),
  city: z.optional(z.string()),
});

const roomTarget = z.object({ roomId: id });
const sessionTarget = z.object({ targetSessionId: id });
const suspensionTarget = z.object({ accountId: id, reportId: id });

export const clientMessage = z.discriminatedUnion("type", [
  message(
    "enter",
    z.object({
      pseudo: z.string(),
      gender: z.optional(gender),
      age: z.int(),
      city: z.optional(z.string()),
      adultConfirmed: z.boolean(),
      termsAccepted: z.boolean(),
      moderatorGrant: z.optional(z.string()),
    }),
  ),
  message("resume", z.object({ resumeToken: id, profile })),
  message("joinRoom", roomTarget),
  message("leaveRoom", roomTarget),
  message("createRoom", z.object({ name: z.string() })),
  message("postRoom", z.object({ roomId: id, text: z.string() })),
  message("sendPrivate", z.object({ targetPseudo: z.string(), text: z.string() })),
  message("ignore", sessionTarget),
  message("unignore", sessionTarget),
  message("search", z.object({ query: z.string() })),
  message(
    "report",
    z.object({
      targetKind: reportTarget,
      targetPseudo: z.optional(z.string()),
      targetRoomId: z.optional(id),
      reason: reportReason,
      excerpt: z.string(),
      context: z.array(z.string()).check(z.maxLength(20)),
    }),
  ),
  message("listOpenReports", empty),
  message("warn", z.object({ targetSessionId: id, text: z.string() })),
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
  message("requestCode", z.object({ email: z.string(), remember: z.boolean() })),
  message("verifyCode", z.object({ code: z.string() })),
  message("signOutEverywhere", empty),
  message("deleteAccount", empty),
  message("leave", empty),
]);

const roomSummary = z.object({ id, name: z.string(), kind: roomKind, count: z.int() });
const member = z.object({
  sessionId: id,
  pseudo: z.string(),
  gender,
  age: z.int(),
  city: z.optional(z.string()),
  away: z.boolean(),
});
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
  other: z.object({ sessionId: id, pseudo: z.string(), gender, away: z.boolean() }),
});
const privateMessage = z.object({
  conversationId: id,
  authorSessionId: id,
  text: z.string(),
  sentAt: isoDate,
});
const notice = z.object({ code: z.string(), message: z.string(), replyTo: z.optional(z.int()) });

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
      resumeToken: id,
      rooms: z.array(roomJoined),
      windows: z.array(privateWindow),
      buffered: z.array(z.union([roomMessage, privateMessage])),
      accountId: z.optional(id),
    }),
  ),
  message("resumeRefused", empty),
  message("roomList", z.object({ rooms: z.array(roomSummary) })),
  message("roomJoined", roomJoined),
  message("memberJoined", presence),
  message("memberLeft", presence),
  message("memberAway", presence),
  message("memberBack", presence),
  message("roomMessage", roomMessage),
  message("privateWindow", privateWindow),
  message("privateMessage", privateMessage),
  message("ignoreUpdated", z.object({ ignored: z.array(id) })),
  message(
    "searchResults",
    z.object({
      results: z.array(
        z.object({
          sessionId: id,
          pseudo: z.string(),
          gender,
          age: z.int(),
          city: z.optional(z.string()),
          rooms: z.array(id),
          away: z.boolean(),
        }),
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
  message("warning", notice),
  message("error", notice),
]);

export type ClientMessage = z.infer<typeof clientMessage>;
export type ServerMessage = z.infer<typeof serverMessage>;
