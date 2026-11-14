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
  triageSummary: 400,
  triageLabel: 64,
  /** Open reports per `openReports` (`platform/04-class-protocol`, `web-ui/08`). */
  queuePage: 50,
  /** Alerted reports per `alertedReports` (`platform/04-class-protocol`, `web-ui/08`). */
  alertPage: 50,
  /** Filing reference (BR-104). */
  filingReference: 100,
  /** Moderator name (BR-094). */
  moderatorName: 20,
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
/** BR-101: the AI category, shown as "tri automatique, à vérifier" only. */
export const triageCategory = z.enum(["harassment", "sexualMinor", "threat", "hate", "spam", "illegalOther", "none"]);
/** BR-104, `security-and-rgpd.md` §6: picked by the moderator, never copied from the AI category. */
export const offenceCategory = z.enum(["childAbuse", "threatToLife", "terrorism", "hateOrViolence", "harassment", "otherListed"]);
/** Where the owner filed (UC20). */
export const alertChannel = z.enum(["PHAROS", "police17", "emergency112", "PointDeContact"]);
/** Expulsion lengths a moderator may pick. */
export const expelDuration = z.enum(["1h", "24h", "7d"]);
/** Why an entry was refused; `banned` comes with `bannedUntil`. */
/** `notModerator`: a moderator grant was sent but refused (BR-095, BR-096). */
export const entryRefusal = z.enum(["rate", "banned", "pseudoInvalid", "pseudoTaken", "age", "notModerator"]);
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
/** BR-104: absent means no alert. */
const alertAuthorities = z.optional(offenceCategory);

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
  // D1: frees a window slot (BR-043); the other side is not told.
  message("closePrivate", z.object({ conversationId: id })),
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
  message("listAlertedReports", empty),
  message("warn", z.object({ targetSessionId: id, text })),
  message(
    "expel",
    // Acts on the report's captured target (`moderation/04`); `severe` deletes and bans 7 days (BR-103).
    z.object({ reportId: id, duration: expelDuration, severe: z.optional(z.boolean()), alertAuthorities }),
  ),
  message("closeReport", z.object({ reportId: id, outcome: reportOutcome, alertAuthorities })),
  message("confirmSuspension", z.extend(suspensionTarget, { alertAuthorities })),
  message("declineSuspension", z.extend(suspensionTarget, { alertAuthorities })),
  // BR-106: acts on the report's room.
  message("removeRoom", z.object({ reportId: id, alertAuthorities })),
  message("requestCode", z.object({ email: capped(CAPS.email), remember: z.boolean() })),
  message("verifyCode", z.object({ code: capped(CAPS.code) })),
  message("signOutEverywhere", empty),
  message("deleteAccount", empty),
  message("leave", empty),
]);

const roomSummary = z.object({ id, name: z.string(), kind: roomKind, count: z.int() });
/** An away session has no profile (ADR-0011): `member` is a union on `away` (issue #21). */
// `hasAccount` (brick 6): the client greys "message privé" on a chatter without an account (BR-040).
const awayChatter = z.object({ sessionId: id, pseudo: z.string(), hasAccount: z.boolean(), away: z.literal(true) });
const connectedMember = z.object({
  sessionId: id,
  pseudo: z.string(),
  hasAccount: z.boolean(),
  away: z.literal(false),
  gender,
  age: z.int(),
  city: z.optional(z.string()),
});
const member = z.discriminatedUnion("away", [connectedMember, awayChatter]);
const otherChatter = z.discriminatedUnion("away", [
  z.pick(connectedMember, { sessionId: true, pseudo: true, hasAccount: true, away: true, gender: true }),
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
/** BR-104: the alert of a report, as moderators see it. */
const authorityAlert = z.object({
  offenceCategory,
  raisedBy: capped(CAPS.moderatorName),
  raisedAt: isoDate,
  status: z.enum(["pending", "filed"]),
  channel: z.optional(alertChannel),
  reference: z.optional(capped(CAPS.filingReference)),
  filedAt: z.optional(isoDate),
});
/** What a moderator reads of a report in both tabs (`web-ui/08`). */
const reportView = {
  id,
  reason: reportReason,
  targetKind: reportTarget,
  targetPseudo: z.optional(z.string()),
  targetRoomId: z.optional(id),
  targetRoomName: z.optional(z.string()),
  excerpt: z.string(),
  context: z.array(z.string()),
  authorPseudo: z.string(),
  createdAt: isoDate,
};
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
      // BR-095: the enrolled name, shown in the queue title.
      moderatorName: z.optional(capped(CAPS.moderatorName)),
      // Brick 8a stays off for testers until the impact assessment of 8c (`moderation/01`).
      canReport: z.boolean(),
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
      // BR-095: a moderator session keeps its rights and name across a resume.
      isModerator: z.optional(z.boolean()),
      moderatorName: z.optional(capped(CAPS.moderatorName)),
      canReport: z.boolean(),
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
          ...reportView,
          // The captured target as it is now (brick 8a, `moderation/04`).
          hasAccount: z.boolean(),
          connected: z.boolean(),
          activeStrikes: z.int().check(z.nonnegative()),
          // BR-074: the report already gave its strike; a new `warned` only asks the suspension again.
          struck: z.boolean(),
          // Set once the AI triage ran; a human decides (ADR-0010). `labels` is the legend "[A] = ‹pseudo›" (BR-100).
          triage: z.optional(
            z.object({
              category: triageCategory,
              urgency,
              summary: capped(CAPS.triageSummary),
              labels: z.array(z.object({ label: capped(CAPS.triageLabel), pseudo })),
            }),
          ),
          // BR-104: an open row with an alert shows its status.
          alert: z.optional(authorityAlert),
        }),
      ).check(z.maxLength(CAPS.queuePage)),
      // The open count; `reports` holds the first 50 in BR-102 order.
      total: z.int().check(z.nonnegative()),
    }),
  ),
  message(
    "alertedReports",
    z.object({
      // Closed reports with an alert: pending first, then the most recently filed (`web-ui/08`).
      reports: z.array(z.object({ ...reportView, closedAt: isoDate, alert: authorityAlert })).check(z.maxLength(CAPS.alertPage)),
    }),
  ),
  message("warned", z.object({ rule: z.string(), text: z.string(), activeStrikes: z.int() })),
  message("expelled", z.object({ until: isoDate })),
  message("reportClosed", z.object({ reportId: id })),
  // BR-104: `alert` is the category already raised on the report; the proposal then shows it read-only.
  message("suspensionProposed", z.object({ accountId: id, reportId: id, activeStrikes: z.int(), alert: z.optional(offenceCategory) })),
  message("roomClosed", roomTarget),
  message("codeSent", empty),
  message("accountLinked", z.object({ accountId: id, deviceClaim: z.optional(z.string()) })),
  message("accountUnlinked", empty),
  // `triesLeft` answers a wrong `verifyCode` (BR-070).
  message("warning", z.object({ code: z.string(), message: z.string(), replyTo, triesLeft: z.optional(z.int().check(z.nonnegative())) })),
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
