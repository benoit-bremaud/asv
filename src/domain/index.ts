/**
 * Pure domain (ADR-0002). Imports nothing outside `src/domain`;
 * the rule is enforced by ESLint (`platform/03-component`).
 */
export * from "./accounts";
export * from "./entry";
export * from "./ports";
export * from "./pseudo";
export {
  createRoom,
  emptyHubState,
  joinRoom,
  leaveRoom,
  postRoom,
  pruneFlood,
  restoreHubState,
  ROOM_LIMITS,
  roomList,
  roomMembers,
  type CreateRoomCommand,
  type HubState,
  type OfficialRoom,
  type PostRoomCommand,
  type Room,
  type RoomEffect,
  type RoomKind,
  type RoomRefusal,
  type RoomsResult,
  type RoomSummary,
} from "./rooms";
// Shadow the entry versions: closing a session must also leave its rooms (`rooms/07`).
export { expireAway, leave, type HubResult } from "./hub";
