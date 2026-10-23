import { describe, expect, it } from "vitest";
import type { Member, ServerMessage } from "../shared/protocol";
import { chatReducer, initialState, MAX_LINES, type Action, type ChatState } from "./store";

const server = (state: ChatState, message: ServerMessage) => chatReducer(state, { type: "server", message });
const act = (state: ChatState, action: Action) => chatReducer(state, action);

const man = (sessionId: string, pseudo = sessionId): Member => ({ sessionId, pseudo, away: false, gender: "man", age: 30 });
const woman = (sessionId: string, pseudo = sessionId): Member => ({ sessionId, pseudo, away: false, gender: "woman", age: 25, city: "Lyon" });
const away = (sessionId: string, pseudo = sessionId): Member => ({ sessionId, pseudo, away: true });

const withRoom = (roomId: string, members: Member[] = [], lines: ChatState["open"][string]["lines"] = []): ChatState => ({
  ...initialState,
  screen: "room",
  active: roomId,
  open: { [roomId]: { members, lines } },
});

const roomMessage = (roomId: string, text: string): ServerMessage => ({
  type: "roomMessage",
  seq: 0,
  payload: { roomId, authorSessionId: "s1", pseudo: "ana", gender: "woman", text, sentAt: "2026-10-23T10:00:00.000Z" },
});

describe("chatReducer: server messages", () => {
  it("entered goes to rooms with the pending pseudo and the room list", () => {
    const state = { ...initialState, pendingPseudo: "ana", entryError: "age" };
    const roomList = [{ id: "r1", name: "Paris", kind: "regional" as const, count: 2 }];

    const next = server(state, {
      type: "entered",
      seq: 0,
      payload: { sessionId: "s1", resumeToken: "t", roomList, isModerator: false },
    });

    expect(next.screen).toBe("rooms");
    expect(next.me).toEqual({ sessionId: "s1", pseudo: "ana" });
    expect(next.pendingPseudo).toBeUndefined();
    expect(next.entryError).toBeUndefined();
    expect(next.roomList).toEqual(roomList);
  });

  it("entered without a pending pseudo falls back to an empty pseudo", () => {
    const next = server(initialState, {
      type: "entered",
      seq: 0,
      payload: { sessionId: "s1", resumeToken: "t", roomList: [], isModerator: false },
    });

    expect(next.me).toEqual({ sessionId: "s1", pseudo: "" });
  });

  it("entryRefused stores the reason and clears the pending pseudo", () => {
    const next = server({ ...initialState, pendingPseudo: "ana" }, {
      type: "entryRefused",
      seq: 0,
      payload: { reason: "pseudoTaken" },
    });

    expect(next.entryError).toBe("pseudoTaken");
    expect(next.pendingPseudo).toBeUndefined();
  });

  describe("resumed", () => {
    const resumed = (rooms: { roomId: string; members: Member[] }[]): ServerMessage => ({
      type: "resumed",
      seq: 0,
      payload: { sessionId: "me1", pseudo: "ana", resumeToken: "t2", rooms, windows: [], buffered: [] },
    });

    it("keeps existing lines and the active room, and learns genders", () => {
      const line = { id: 0, authorSessionId: "s1", pseudo: "ana", gender: "woman" as const, text: "hi", sentAt: "x" };
      const state = withRoom("r1", [], [line]);

      const next = server(state, resumed([{ roomId: "r1", members: [man("s2")] }, { roomId: "r2", members: [away("s3")] }]));

      expect(next.open.r1?.lines).toEqual([line]);
      expect(next.open.r2?.lines).toEqual([]);
      expect(next.active).toBe("r1");
      expect(next.screen).toBe("room");
      expect(next.me).toEqual({ sessionId: "me1", pseudo: "ana" });
      expect(next.known).toEqual({ s2: "man" });
    });

    it("falls back to the first room when the active one is gone", () => {
      const next = server(withRoom("gone"), resumed([{ roomId: "r9", members: [] }]));

      expect(next.active).toBe("r9");
      expect(next.screen).toBe("room");
    });

    it("falls back to the rooms list when there is no active room", () => {
      const next = server(withRoom("gone"), resumed([]));

      expect(next.active).toBeUndefined();
      expect(next.screen).toBe("rooms");
    });

    it("shows the rooms list when the user was not on the room screen", () => {
      const next = server({ ...initialState, screen: "rooms" }, resumed([{ roomId: "r1", members: [] }]));

      expect(next.active).toBe("r1");
      expect(next.screen).toBe("rooms");
    });

    it("falls back when no room was active before", () => {
      const next = server({ ...initialState, screen: "rooms", active: undefined }, resumed([{ roomId: "r1", members: [] }]));

      expect(next.active).toBe("r1");
    });
  });

  it("resumeRefused resets the state, keeps the link and the last pseudo", () => {
    const state: ChatState = { ...withRoom("r1"), link: "online", me: { sessionId: "s1", pseudo: "ana" } };

    const next = server(state, { type: "resumeRefused", seq: 0, payload: {} });

    expect(next).toEqual({ ...initialState, link: "online", lastPseudo: "ana" });
  });

  it("resumeRefused without a known user leaves lastPseudo undefined", () => {
    const next = server(initialState, { type: "resumeRefused", seq: 0, payload: {} });

    expect(next.lastPseudo).toBeUndefined();
  });

  it("roomList replaces the list", () => {
    const rooms = [{ id: "r1", name: "A", kind: "user" as const, count: 1 }];

    const next = server(initialState, { type: "roomList", seq: 0, payload: { rooms } });

    expect(next.roomList).toEqual(rooms);
  });

  describe("roomJoined", () => {
    it("opens the room, shows it and learns genders", () => {
      const next = server(initialState, { type: "roomJoined", seq: 0, payload: { roomId: "r1", members: [woman("s1"), away("s2")] } });

      expect(next.open.r1?.members).toHaveLength(2);
      expect(next.open.r1?.lines).toEqual([]);
      expect(next.active).toBe("r1");
      expect(next.screen).toBe("room");
      expect(next.known).toEqual({ s1: "woman" });
    });

    it("keeps the lines of an already open room", () => {
      const line = { id: 0, authorSessionId: "s1", pseudo: "ana", gender: "woman" as const, text: "hi", sentAt: "x" };

      const next = server(withRoom("r1", [], [line]), { type: "roomJoined", seq: 0, payload: { roomId: "r1", members: [] } });

      expect(next.open.r1?.lines).toEqual([line]);
    });
  });

  it.each(["memberJoined", "memberBack"] as const)("%s adds the member and learns the gender", (type) => {
    const next = server(withRoom("r1", [man("s1")]), { type, seq: 0, payload: { roomId: "r1", member: woman("s2") } });

    expect(next.open.r1?.members.map((m) => m.sessionId)).toEqual(["s1", "s2"]);
    expect(next.known).toEqual({ s2: "woman" });
  });

  it("memberBack replaces the away entry of the same session", () => {
    const next = server(withRoom("r1", [away("s1")]), { type: "memberBack", seq: 0, payload: { roomId: "r1", member: man("s1") } });

    expect(next.open.r1?.members).toEqual([man("s1")]);
  });

  it("memberJoined for an unknown room changes nothing but known", () => {
    const next = server(initialState, { type: "memberJoined", seq: 0, payload: { roomId: "nope", member: man("s1") } });

    expect(next.open).toEqual({});
    expect(next.known).toEqual({ s1: "man" });
  });

  it("memberLeft removes the member", () => {
    const next = server(withRoom("r1", [man("s1"), man("s2")]), {
      type: "memberLeft",
      seq: 0,
      payload: { roomId: "r1", sessionId: "s1", pseudo: "s1" },
    });

    expect(next.open.r1?.members.map((m) => m.sessionId)).toEqual(["s2"]);
  });

  it("memberLeft without a room id is ignored", () => {
    const state = withRoom("r1", [man("s1")]);

    const next = server(state, { type: "memberLeft", seq: 0, payload: { sessionId: "s1", pseudo: "s1" } });

    expect(next).toBe(state);
  });

  it("memberAway turns the member into the away variant and leaves others untouched", () => {
    const next = server(withRoom("r1", [man("s1", "ana"), man("s2")]), {
      type: "memberAway",
      seq: 0,
      payload: { roomId: "r1", sessionId: "s1", pseudo: "ana" },
    });

    expect(next.open.r1?.members).toEqual([{ sessionId: "s1", pseudo: "ana", away: true }, man("s2")]);
  });

  it("memberAway without a room id is ignored", () => {
    const state = withRoom("r1", [man("s1")]);

    expect(server(state, { type: "memberAway", seq: 0, payload: { sessionId: "s1", pseudo: "s1" } })).toBe(state);
  });

  describe("roomMessage", () => {
    it("appends a numbered line", () => {
      const next = server({ ...withRoom("r1"), nextLineId: 7 }, roomMessage("r1", "hi"));

      expect(next.open.r1?.lines).toEqual([
        { id: 7, authorSessionId: "s1", pseudo: "ana", gender: "woman", text: "hi", sentAt: "2026-10-23T10:00:00.000Z" },
      ]);
      expect(next.nextLineId).toBe(8);
    });

    it("keeps only the newest MAX_LINES lines", () => {
      let state = withRoom("r1");
      for (let i = 0; i < MAX_LINES + 5; i++) state = server(state, roomMessage("r1", `m${i}`));

      const lines = state.open.r1?.lines ?? [];
      expect(lines).toHaveLength(MAX_LINES);
      expect(lines[0]?.text).toBe("m5");
      expect(lines.at(-1)?.text).toBe(`m${MAX_LINES + 4}`);
    });

    it("ignores a message for a closed room", () => {
      const state = withRoom("r1");

      const next = server(state, roomMessage("closed", "hi"));

      expect(next.open).toBe(state.open);
    });
  });

  it.each([
    ["warning", { type: "warning", seq: 0, payload: { code: "flood", message: "m" } } as ServerMessage, "flood"],
    ["error", { type: "error", seq: 0, payload: { code: "invalid", message: "m" } } as ServerMessage, "invalid"],
  ])("%s sets the notice code", (_type, message, code) => {
    expect(server(initialState, message).notice).toBe(code);
  });

  it("returns the same state for an unhandled message type", () => {
    const next = server(initialState, { type: "codeSent", seq: 0, payload: {} });

    expect(next).toBe(initialState);
  });
});

describe("chatReducer: local actions", () => {
  it("link sets the link", () => {
    expect(act(initialState, { type: "link", link: "online" }).link).toBe("online");
  });

  it("a lost link drops the pending entry", () => {
    const next = act({ ...initialState, link: "online", pendingPseudo: "ana" }, { type: "link", link: "offline" });

    expect(next.pendingPseudo).toBeUndefined();
  });

  it("entering stores the pending pseudo and clears the entry error", () => {
    const next = act({ ...initialState, entryError: "age" }, { type: "entering", pseudo: "ana" });

    expect(next.pendingPseudo).toBe("ana");
    expect(next.entryError).toBeUndefined();
  });

  it("left resets the state and keeps the link and the last pseudo", () => {
    const state: ChatState = { ...withRoom("r1"), link: "online", me: { sessionId: "s1", pseudo: "ana" } };

    expect(act(state, { type: "left" })).toEqual({ ...initialState, link: "online", lastPseudo: "ana" });
  });

  it("showRooms shows the list", () => {
    expect(act(withRoom("r1"), { type: "showRooms" }).screen).toBe("rooms");
  });

  it("showRoom of a known room activates it", () => {
    const state = { ...withRoom("r1"), screen: "rooms" as const };

    const next = act(state, { type: "showRoom", roomId: "r1" });

    expect(next.screen).toBe("room");
    expect(next.active).toBe("r1");
  });

  it("showRoom of an unknown room changes nothing", () => {
    const state = withRoom("r1");

    expect(act(state, { type: "showRoom", roomId: "nope" })).toBe(state);
  });

  it("closeRoom of the active room falls back to another open room", () => {
    const state: ChatState = {
      ...withRoom("r1"),
      open: { r1: { members: [], lines: [] }, r2: { members: [], lines: [] } },
    };

    const next = act(state, { type: "closeRoom", roomId: "r1" });

    expect(Object.keys(next.open)).toEqual(["r2"]);
    expect(next.active).toBe("r2");
    expect(next.screen).toBe("room");
  });

  it("closeRoom of the last active room goes back to the list", () => {
    const next = act(withRoom("r1"), { type: "closeRoom", roomId: "r1" });

    expect(next.open).toEqual({});
    expect(next.active).toBeUndefined();
    expect(next.screen).toBe("rooms");
  });

  it("closeRoom of an inactive room only removes it", () => {
    const state: ChatState = {
      ...withRoom("r1"),
      open: { r1: { members: [], lines: [] }, r2: { members: [], lines: [] } },
    };

    const next = act(state, { type: "closeRoom", roomId: "r2" });

    expect(Object.keys(next.open)).toEqual(["r1"]);
    expect(next.active).toBe("r1");
    expect(next.screen).toBe("room");
  });

  it("notice sets and dismissNotice clears the notice", () => {
    const noticed = act(initialState, { type: "notice", code: "flood" });

    expect(noticed.notice).toBe("flood");
    expect(act(noticed, { type: "dismissNotice" }).notice).toBeUndefined();
  });
});
