/**
 * Pure domain (ADR-0002). Imports nothing outside `src/domain`;
 * the rule is enforced by ESLint (`platform/03-component`).
 */
export * from "./accounts";
export * from "./authority";
export * from "./directory";
export * from "./ignore";
export * from "./moderation";
export * from "./moderators";
export * from "./private";
export * from "./entry";
export * from "./ports";
export * from "./pseudo";
export * from "./triage";
export {
  countMessage,
  createRoom,
  emptyHubState,
  joinRoom,
  leaveRoom,
  postRoom,
  pruneFlood,
  removeRoom,
  restoreHubState,
  ROOM_LIMITS,
  roomList,
  roomMembers,
  type CreateRoomCommand,
  type HubState,
  type OfficialRoom,
  type PostRoomCommand,
  type RoomRemoval,
  type Room,
  type RoomEffect,
  type RoomKind,
  type RoomRefusal,
  type RoomsResult,
  type RoomSummary,
} from "./rooms";
// Shadow the entry and accounts versions: closing a session must also leave its rooms and conversations
// (`rooms/07`, `private-conversations/07`).
export { expireAway, leave, resume, unlinkSessions, type HubResult } from "./hub";
