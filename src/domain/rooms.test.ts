import { describe, expect, it } from "vitest";
import { enter, resume, socketLost, type EnterCommand, type Random, type Session } from "./entry";
import { expireAway, leave } from "./hub";
import {
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
  type HubState,
  type OfficialRoom,
  type RoomsResult,
} from "./rooms";

const T0 = new Date("2026-10-23T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

const OFFICIAL: readonly OfficialRoom[] = [
  { id: "blabla", name: "Blabla", kind: "themed" },
  { id: "lyon", name: "Lyon", kind: "regional" },
];

const fakeRandom = (): Random => {
  let n = 0;
  return {
    id: () => `id${++n}`,
    token: () => {
      n += 1;
      return { value: `t${n}`, hash: `h(t${n})` };
    },
  };
};

const form = (pseudo: string, ip: string): EnterCommand => ({
  pseudo,
  age: 30,
  adultConfirmed: true,
  termsAccepted: true,
  ip,
});

/** A hub with connected sessions named after `pseudos`; returns their ids in order. */
const hubWith = (...pseudos: string[]) => {
  const random = fakeRandom();
  let state: HubState = emptyHubState(OFFICIAL);
  const ids: string[] = [];
  pseudos.forEach((pseudo, i) => {
    const entered = enter(state, form(pseudo, `203.0.113.${i}`), T0, random);
    const effect = entered.effects[0];
    if (effect?.type !== "entered") throw new Error("entry refused in fixture");
    state = entered.state;
    ids.push(effect.sessionId);
  });
  const id = (i: number): string => {
    const found = ids[i];
    if (found === undefined) throw new Error(`no session ${i} in fixture`);
    return found;
  };
  return { state, ids, id, random };
};

const joined = (state: HubState, sessionId: string, roomId: string): HubState =>
  joinRoom(state, sessionId, roomId).state;

const refusal = (r: RoomsResult) => {
  const effect = r.effects[0];
  return effect?.type === "roomRefused" ? effect.reason : undefined;
};

const createdRoomId = (r: RoomsResult): string => {
  const effect = r.effects[0];
  if (effect?.type !== "roomCreated") throw new Error("room not created in fixture");
  return effect.roomId;
};

describe("BR-033 official rooms", () => {
  it("come from configuration with no owner", () => {
    const state = emptyHubState(OFFICIAL);
    expect([...state.rooms.values()]).toEqual([
      { id: "blabla", name: "Blabla", kind: "themed" },
      { id: "lyon", name: "Lyon", kind: "regional" },
    ]);
  });

  it("are never deleted when their last member leaves", () => {
    const { state, id } = hubWith("lola");
    const left = leaveRoom(joined(state, id(0), "lyon"), id(0), "lyon");
    expect(left.state.rooms.has("lyon")).toBe(true);
    expect(left.effects).toEqual([{ type: "memberLeft", roomId: "lyon", sessionId: id(0), pseudo: "lola" }]);
  });
});

describe("UC2 room list", () => {
  it("lists official rooms first, then user rooms, with live counts", () => {
    const { state, id, random } = hubWith("lola", "zed");
    const created = createRoom(state, { sessionId: id(0), name: "Apéro" }, random);
    const roomId = createdRoomId(created);
    const withZed = joined(joined(created.state, id(1), "lyon"), id(1), roomId);
    expect(roomList(withZed)).toEqual([
      { id: "blabla", name: "Blabla", kind: "themed", count: 0 },
      { id: "lyon", name: "Lyon", kind: "regional", count: 1 },
      { id: roomId, name: "Apéro", kind: "user", count: 2 },
    ]);
  });

  it("puts official rooms first even if a user room was inserted earlier", () => {
    const state = restoreHubState(OFFICIAL, [], []);
    const mixed: HubState = { ...state, rooms: new Map([["u", { id: "u", name: "Zut", kind: "user" }], ...state.rooms]) };
    expect(roomList(mixed).map((room) => room.id)).toEqual(["blabla", "lyon", "u"]);
  });
});

describe("UC3 join a room", () => {
  it("adds the room to the session and announces the newcomer", () => {
    const { state, id } = hubWith("lola");
    const r = joinRoom(state, id(0), "blabla");
    expect(r.state.sessions.get(id(0))?.rooms).toEqual(["blabla"]);
    expect(r.effects).toEqual([
      { type: "roomJoined", sessionId: id(0), roomId: "blabla" },
      { type: "memberJoined", roomId: "blabla", sessionId: id(0), pseudo: "lola" },
    ]);
    expect(roomMembers(r.state, "blabla").map((s) => s.id)).toEqual([id(0)]);
  });

  it("lets a chatter be in several rooms", () => {
    const { state, id } = hubWith("lola");
    const s = joined(joined(state, id(0), "blabla"), id(0), "lyon");
    expect(s.sessions.get(id(0))?.rooms).toEqual(["blabla", "lyon"]);
  });

  it("answers a second join without a broadcast", () => {
    const { state, id } = hubWith("lola");
    const r = joinRoom(joined(state, id(0), "blabla"), id(0), "blabla");
    expect(r.effects).toEqual([{ type: "roomJoined", sessionId: id(0), roomId: "blabla" }]);
    expect(r.state.sessions.get(id(0))?.rooms).toEqual(["blabla"]);
  });

  it("refuses an unknown room", () => {
    const { state, id } = hubWith("lola");
    expect(refusal(joinRoom(state, id(0), "nowhere"))).toBe("unknownRoom");
  });

  it("ignores an unknown or away session", () => {
    const { state, id } = hubWith("lola");
    const away = socketLost(state, id(0), T0).state;
    expect(joinRoom(state, "ghost", "blabla")).toEqual({ state, effects: [] });
    expect(joinRoom(away, id(0), "blabla")).toEqual({ state: away, effects: [] });
  });
});

describe("BR-023 room capacity", () => {
  const pseudos = Array.from({ length: 51 }, (_, i) => `chatter${i}`);

  it("refuses the 51st member, away members included", () => {
    const { state, ids, id } = hubWith(...pseudos);
    let s = state;
    for (const member of ids.slice(0, 49)) s = joined(s, member, "blabla");
    s = socketLost(s, id(0), T0).state;
    expect(joinRoom(s, id(49), "blabla").effects[0]?.type).toBe("roomJoined");
    s = joined(s, id(49), "blabla");
    expect(roomMembers(s, "blabla")).toHaveLength(50);
    expect(refusal(joinRoom(s, id(50), "blabla"))).toBe("full");
    expect(joinRoom(s, id(49), "blabla").effects).toEqual([{ type: "roomJoined", sessionId: id(49), roomId: "blabla" }]);
  });

  it("keeps the V1 values in one place", () => {
    expect(ROOM_LIMITS).toEqual({
      maxTextLength: 500,
      floodMessages: 5,
      floodWindowMs: 10_000,
      capacity: 50,
      maxRoomsPerSession: 10,
    });
  });
});

describe("BR-024 rooms per session", () => {
  const inTenRooms = () => {
    const { state, id, random } = hubWith(...Array.from({ length: 10 }, (_, i) => `chatter${i}`));
    let s = state;
    for (let i = 0; i < 10; i += 1) {
      const created = createRoom(s, { sessionId: id(i), name: `Salon ${i}` }, random);
      s = joined(created.state, id(0), createdRoomId(created));
    }
    return { state: s, id, random };
  };

  it("refuses an 11th room, joined or created", () => {
    const { state, id, random } = inTenRooms();
    expect(state.sessions.get(id(0))?.rooms).toHaveLength(10);
    expect(refusal(joinRoom(state, id(0), "lyon"))).toBe("tooManyRooms");
    // Leaving its own room ends the ownership; rejoining an official one fills the 10th slot again.
    const ownsNothing = leaveRoom(state, id(0), state.sessions.get(id(0))?.rooms[0] ?? "").state;
    const back = joined(ownsNothing, id(0), "lyon");
    expect(back.sessions.get(id(0))?.rooms).toHaveLength(10);
    expect(refusal(createRoom(back, { sessionId: id(0), name: "Brunch" }, random))).toBe("tooManyRooms");
  });

  it("still answers a room already joined", () => {
    const { state, id } = inTenRooms();
    const roomId = state.sessions.get(id(0))?.rooms[0] ?? "";
    expect(joinRoom(state, id(0), roomId).effects).toEqual([{ type: "roomJoined", sessionId: id(0), roomId }]);
  });
});

describe("BR-020 message length", () => {
  const posting = () => {
    const { state, id } = hubWith("lola");
    return { state: joined(state, id(0), "blabla"), id: id(0) };
  };

  it("refuses an empty message after trimming", () => {
    const { state, id } = posting();
    expect(refusal(postRoom(state, { sessionId: id, roomId: "blabla", text: "   " }, T0))).toBe("empty");
  });

  it("accepts 500 characters and refuses 501, counted in code points", () => {
    const { state, id } = posting();
    const ok = postRoom(state, { sessionId: id, roomId: "blabla", text: "😀".repeat(500) }, T0);
    expect(ok.effects[0]?.type).toBe("roomMessage");
    expect(refusal(postRoom(state, { sessionId: id, roomId: "blabla", text: "a".repeat(501) }, T0))).toBe("tooLong");
  });

  it("broadcasts the trimmed text to connected members, author included", () => {
    const { state, id } = hubWith("lola", "zed", "max");
    let s = joined(joined(joined(state, id(0), "blabla"), id(1), "blabla"), id(2), "blabla");
    s = socketLost(s, id(2), T0).state;
    const r = postRoom(s, { sessionId: id(0), roomId: "blabla", text: "  salut :caramel:  " }, T0);
    expect(r.effects).toEqual([
      {
        type: "roomMessage",
        roomId: "blabla",
        authorSessionId: id(0),
        pseudo: "lola",
        text: "salut :caramel:",
        sentAt: T0,
        recipients: [id(0), id(1)],
      },
    ]);
  });

  it("refuses a post to an unknown room and ignores an away author", () => {
    const { state, id } = hubWith("lola");
    const s = joined(state, id(0), "blabla");
    expect(refusal(postRoom(s, { sessionId: id(0), roomId: "nowhere", text: "hi" }, T0))).toBe("notMember");
    const away = socketLost(s, id(0), T0).state;
    expect(postRoom(away, { sessionId: id(0), roomId: "blabla", text: "hi" }, T0)).toEqual({ state: away, effects: [] });
  });

  it("refuses a chatter who is not a member, and ignores an unknown session", () => {
    const { state, id } = hubWith("lola");
    expect(refusal(postRoom(state, { sessionId: id(0), roomId: "blabla", text: "hi" }, T0))).toBe("notMember");
    expect(postRoom(state, { sessionId: "ghost", roomId: "blabla", text: "hi" }, T0).effects).toEqual([]);
  });
});

describe("BR-021 flood limit", () => {
  const flooding = () => {
    const { state, id: nth } = hubWith("lola");
    const id = nth(0);
    let s = joined(joined(state, id, "blabla"), id, "lyon");
    for (let i = 0; i < 5; i += 1) {
      s = postRoom(s, { sessionId: id, roomId: i % 2 ? "lyon" : "blabla", text: `m${i}` }, at(i * 1000)).state;
    }
    return { state: s, id };
  };

  it("refuses a 6th message within 10 seconds, across rooms", () => {
    const { state, id } = flooding();
    expect(refusal(postRoom(state, { sessionId: id, roomId: "lyon", text: "again" }, at(9_000)))).toBe("flood");
  });

  it("does not count refused messages, and accepts again once the oldest leaves the window", () => {
    const { state, id } = flooding();
    const r = postRoom(state, { sessionId: id, roomId: "lyon", text: "again" }, at(9_000));
    expect(r.state).toBe(state);
    expect(postRoom(r.state, { sessionId: id, roomId: "lyon", text: "later" }, at(10_000)).effects[0]?.type).toBe(
      "roomMessage",
    );
  });

  it("does not count empty or too long messages", () => {
    const { state, id: nth } = hubWith("lola");
    let s = joined(state, nth(0), "blabla");
    for (let i = 0; i < 5; i += 1) {
      s = postRoom(s, { sessionId: nth(0), roomId: "blabla", text: i % 2 ? "   " : "a".repeat(501) }, T0).state;
    }
    expect(postRoom(s, { sessionId: nth(0), roomId: "blabla", text: "ok" }, T0).effects[0]?.type).toBe("roomMessage");
  });

  it("counts per session", () => {
    const { state, id: nth } = hubWith("lola", "zed");
    let s = joined(joined(state, nth(0), "blabla"), nth(1), "blabla");
    for (let i = 0; i < 5; i += 1) s = postRoom(s, { sessionId: nth(0), roomId: "blabla", text: "m" }, T0).state;
    expect(refusal(postRoom(s, { sessionId: nth(0), roomId: "blabla", text: "m" }, T0))).toBe("flood");
    expect(postRoom(s, { sessionId: nth(1), roomId: "blabla", text: "m" }, T0).effects[0]?.type).toBe("roomMessage");
  });

  it("forgets idle counters on prune and keeps the state when nothing changes", () => {
    const { state, id } = flooding();
    expect(pruneFlood(state, at(5_000))).toBe(state);
    expect(pruneFlood(state, at(14_000)).flood.has(id)).toBe(false);
  });
});

describe("BR-022 raw text", () => {
  it("keeps markup and smiley codes as text, rendering is the web client's job", () => {
    const { state, id } = hubWith("lola");
    const s = joined(state, id(0), "blabla");
    const r = postRoom(s, { sessionId: id(0), roomId: "blabla", text: "<b>:)</b>" }, T0);
    expect(r.effects[0]).toMatchObject({ type: "roomMessage", text: "<b>:)</b>" });
  });
});

describe("BR-034 no history", () => {
  it("keeps no message in the state", () => {
    const { state, id } = hubWith("lola");
    const s = joined(state, id(0), "blabla");
    const r = postRoom(s, { sessionId: id(0), roomId: "blabla", text: "secret" }, T0);
    expect(JSON.stringify([...r.state.rooms.values(), ...r.state.sessions.values()])).not.toContain("secret");
  });
});

describe("BR-030 user room name", () => {
  const create = (name: string) => {
    const { state, id, random } = hubWith("lola");
    return createRoom(state, { sessionId: id(0), name }, random);
  };

  it.each(["Apéro du soir", "Ciné & co", "Qui l'eût cru ?", "abc", "a".repeat(30)])("accepts %j", (name) => {
    expect(create(name).effects[0]?.type).toBe("roomCreated");
  });

  it.each(["!!!", "? ? ?", "...", "ab", "a".repeat(31), "two  spaces", "tab\there", "<script>", "Модо", "Chez les modos"])(
    "refuses %j",
    (name) => {
      expect(refusal(create(name))).toBe("nameInvalid");
    },
  );

  it.each(["Paris.", "LYON !", "Ly-on", "bla bla"])("refuses %j, taken once spaces and punctuation are ignored", (name) => {
    const { state, id, random } = hubWith("lola");
    const s: HubState = { ...state, rooms: new Map(state.rooms).set("paris", { id: "paris", name: "Paris", kind: "regional" }) };
    expect(refusal(createRoom(s, { sessionId: id(0), name }, random))).toBe("nameTaken");
  });

  it("trims and normalises the name", () => {
    const r = create("  Café  ");
    const roomId = createdRoomId(r);
    expect(r.state.rooms.get(roomId)?.name).toBe("Café");
  });

  it("refuses a name taken by any room, ignoring case and accents", () => {
    expect(refusal(create("lyon"))).toBe("nameTaken");
    const { state, id, random } = hubWith("lola", "zed");
    const first = createRoom(state, { sessionId: id(0), name: "Poésie" }, random);
    expect(refusal(createRoom(first.state, { sessionId: id(1), name: "POESIE" }, random))).toBe("nameTaken");
  });

  it("checks name, then uniqueness, then ownership", () => {
    const { state, id, random } = hubWith("lola");
    const owned = createRoom(state, { sessionId: id(0), name: "Apéro" }, random).state;
    expect(refusal(createRoom(owned, { sessionId: id(0), name: "x" }, random))).toBe("nameInvalid");
    expect(refusal(createRoom(owned, { sessionId: id(0), name: "Lyon" }, random))).toBe("nameTaken");
  });

  it.each(["  ab ", "     "])("refuses %j once trimmed", (name) => {
    expect(refusal(create(name))).toBe("nameInvalid");
  });

  it("finds a decomposed name taken by its composed form", () => {
    const { state, id, random } = hubWith("lola", "zed");
    const first = createRoom(state, { sessionId: id(0), name: "Café" }, random);
    expect(refusal(createRoom(first.state, { sessionId: id(1), name: "Cafe\u0301" }, random))).toBe("nameTaken");
  });

  it("ignores an unknown session", () => {
    const { state, random } = hubWith("lola");
    expect(createRoom(state, { sessionId: "ghost", name: "Apéro" }, random).effects).toEqual([]);
  });
});

describe("BR-031 room ownership", () => {
  it("creates the room owned by and joined by its creator", () => {
    const { state, id, random } = hubWith("lola");
    const r = createRoom(state, { sessionId: id(0), name: "Apéro" }, random);
    const roomId = createdRoomId(r);
    expect(r.state.rooms.get(roomId)).toEqual({ id: roomId, name: "Apéro", kind: "user", ownerId: id(0) });
    expect(r.effects).toEqual([
      { type: "roomCreated", roomId, sessionId: id(0) },
      { type: "roomJoined", sessionId: id(0), roomId },
      { type: "memberJoined", roomId, sessionId: id(0), pseudo: "lola" },
    ]);
  });

  it("refuses a second room while the first is owned", () => {
    const { state, id, random } = hubWith("lola");
    const first = createRoom(state, { sessionId: id(0), name: "Apéro" }, random);
    expect(refusal(createRoom(first.state, { sessionId: id(0), name: "Brunch" }, random))).toBe("alreadyOwner");
  });

  it("ends ownership when the owner leaves a room that still has members", () => {
    const { state, id, random } = hubWith("lola", "zed");
    const created = createRoom(state, { sessionId: id(0), name: "Apéro" }, random);
    const roomId = createdRoomId(created);
    const left = leaveRoom(joined(created.state, id(1), roomId), id(0), roomId);
    expect(left.state.rooms.get(roomId)).toEqual({ id: roomId, name: "Apéro", kind: "user" });
    expect(createRoom(left.state, { sessionId: id(0), name: "Brunch" }, random).effects[0]?.type).toBe("roomCreated");
  });

  it("keeps ownership when another member leaves", () => {
    const { state, id, random } = hubWith("lola", "zed");
    const created = createRoom(state, { sessionId: id(0), name: "Apéro" }, random);
    const roomId = createdRoomId(created);
    const left = leaveRoom(joined(created.state, id(1), roomId), id(1), roomId);
    expect(left.state.rooms.get(roomId)?.ownerId).toBe(id(0));
  });

  it("keeps ownership while the owner is away", () => {
    const { state, id, random } = hubWith("lola");
    const created = createRoom(state, { sessionId: id(0), name: "Apéro" }, random);
    const roomId = createdRoomId(created);
    const away = socketLost(created.state, id(0), T0).state;
    expect(away.rooms.get(roomId)?.ownerId).toBe(id(0));
    expect(away.sessions.get(id(0))?.rooms).toEqual([roomId]);
  });
});

describe("BR-032 user room deletion", () => {
  it("deletes a user room when its last member leaves", () => {
    const { state, id, random } = hubWith("lola");
    const created = createRoom(state, { sessionId: id(0), name: "Apéro" }, random);
    const roomId = createdRoomId(created);
    const left = leaveRoom(created.state, id(0), roomId);
    expect(left.state.rooms.has(roomId)).toBe(false);
    expect(left.state.sessions.get(id(0))?.rooms).toEqual([]);
    expect(left.effects).toEqual([
      { type: "memberLeft", roomId, sessionId: id(0), pseudo: "lola" },
      { type: "roomDeleted", roomId },
    ]);
  });

  it("does nothing when a non-member leaves", () => {
    const { state, id } = hubWith("lola");
    expect(leaveRoom(state, id(0), "blabla")).toEqual({ state, effects: [] });
    expect(leaveRoom(state, "ghost", "blabla")).toEqual({ state, effects: [] });
  });

  it("deletes a user room when its last member closes the session (UC10)", () => {
    const { state, id, random } = hubWith("lola", "zed");
    const created = createRoom(state, { sessionId: id(0), name: "Apéro" }, random);
    const roomId = createdRoomId(created);
    const s = postRoom(joined(created.state, id(0), "lyon"), { sessionId: id(0), roomId: "lyon", text: "bye" }, T0)
      .state;
    const r = leave(s, id(0));
    expect(r.effects).toEqual([
      { type: "closed", sessionId: id(0), pseudo: "lola" },
      { type: "memberLeft", roomId, sessionId: id(0), pseudo: "lola" },
      { type: "roomDeleted", roomId },
      { type: "memberLeft", roomId: "lyon", sessionId: id(0), pseudo: "lola" },
    ]);
    expect(r.state.rooms.has(roomId)).toBe(false);
    expect(r.state.flood.has(id(0))).toBe(false);
    expect(r.state.sessions.has(id(0))).toBe(false);
  });

  it("ends ownership when the owner closes and members remain", () => {
    const { state, id, random } = hubWith("lola", "zed");
    const created = createRoom(state, { sessionId: id(0), name: "Apéro" }, random);
    const roomId = createdRoomId(created);
    const r = leave(joined(created.state, id(1), roomId), id(0));
    expect(r.state.rooms.get(roomId)).toEqual({ id: roomId, name: "Apéro", kind: "user" });
  });

  it("keeps an official room when its last member closes", () => {
    const { state, id } = hubWith("lola");
    const r = leave(joined(state, id(0), "lyon"), id(0));
    expect(r.state.rooms.has("lyon")).toBe(true);
    expect(r.effects.map((effect) => effect.type)).toEqual(["closed", "memberLeft"]);
  });

  it("does nothing when an unknown session leaves", () => {
    const { state } = hubWith("lola");
    expect(leave(state, "ghost")).toEqual({ state, effects: [] });
  });
});

describe("BR-012 and BR-015 rooms across away and expiry", () => {
  it("keeps rooms through away and resume", () => {
    const { state, id, random } = hubWith("lola");
    const s = joined(state, id(0), "blabla");
    const lost = socketLost(s, id(0), T0);
    const away = lost.state.sessions.get(id(0));
    if (away?.status !== "away") throw new Error("not away");
    const back = resume(lost.state, { resumeTokenHash: away.resumeTokenHash, ip: "198.51.100.7", age: 30, accountStillExists: true }, at(1000), random);
    expect(back.state.sessions.get(id(0))?.rooms).toEqual(["blabla"]);
    expect(roomList(back.state)).toEqual(roomList(s));
  });

  it("leaves the rooms of expired away sessions", () => {
    const { state, id, random } = hubWith("lola");
    const created = createRoom(state, { sessionId: id(0), name: "Apéro" }, random);
    const roomId = createdRoomId(created);
    const away = socketLost(created.state, id(0), T0).state;
    expect(expireAway(away, at(1000))).toEqual({ state: away, effects: [] });
    const r = expireAway(away, at(5 * 60_000));
    expect(r.effects).toEqual([
      { type: "closed", sessionId: id(0), pseudo: "lola" },
      { type: "memberLeft", roomId, sessionId: id(0), pseudo: "lola" },
      { type: "roomDeleted", roomId },
    ]);
  });
});

describe("BR-015 two expiries sharing a room", () => {
  it("deletes the room once, with no presence for a room already gone", () => {
    const { state, id, random } = hubWith("lola", "zed");
    const created = createRoom(state, { sessionId: id(0), name: "Apéro" }, random);
    const roomId = createdRoomId(created);
    let s = joined(created.state, id(1), roomId);
    s = socketLost(socketLost(s, id(0), T0).state, id(1), T0).state;
    const r = expireAway(s, at(5 * 60_000));
    expect(r.effects.filter((effect) => effect.type !== "closed")).toEqual([
      { type: "memberLeft", roomId, sessionId: id(0), pseudo: "lola" },
      { type: "roomDeleted", roomId },
    ]);
  });
});

describe("ADR-0011 rebuild after hibernation", () => {
  const session = (id: string, pseudo: string, rooms: string[]): Session => ({
    id,
    pseudo,
    status: "away",
    resumeTokenHash: `h${id}`,
    rooms,
    awayUntil: at(60_000),
    buffered: [],
  });

  it("rebuilds rooms, pseudo index and owners from the sessions and their user room refs", () => {
    const state = restoreHubState(
      OFFICIAL,
      [session("s1", "Hélène", ["lyon", "u1", "gone"]), session("s2", "zed", ["u1", "u2"])],
      [
        { id: "u1", name: "Apéro", kind: "user", ownerId: "s9" },
        { id: "u1", name: "Apéro", kind: "user", ownerId: "s9" },
        { id: "u2", name: "Brunch", kind: "user", ownerId: "s2" },
        { id: "u3", name: "Vide", kind: "user" },
        { id: "lyon", name: "Fake", kind: "user" },
      ],
    );
    expect(state.rooms.get("lyon")).toEqual({ id: "lyon", name: "Lyon", kind: "regional" });
    expect(state.rooms.get("u1")).toEqual({ id: "u1", name: "Apéro", kind: "user" });
    expect(state.rooms.get("u2")?.ownerId).toBe("s2");
    expect(state.rooms.has("u3")).toBe(false);
    expect(state.sessions.get("s1")?.rooms).toEqual(["lyon", "u1"]);
    expect(state.pseudoIndex.get("helene")).toBe("s1");
    expect(state.flood.size).toBe(0);
    expect(state.entryAttempts.size).toBe(0);
  });

  it("lets a stale owner claim from a non-member not block the room really owned", () => {
    const state = restoreHubState(
      OFFICIAL,
      [session("s1", "lola", ["u2"]), session("s2", "zed", ["u1"])],
      [
        { id: "u1", name: "Apéro", kind: "user", ownerId: "s1" },
        { id: "u2", name: "Brunch", kind: "user", ownerId: "s1" },
      ],
    );
    expect(state.rooms.get("u1")).toEqual({ id: "u1", name: "Apéro", kind: "user" });
    expect(state.rooms.get("u2")?.ownerId).toBe("s1");
  });

  it("enforces the rules again on conflicting refs", () => {
    const state = restoreHubState(
      OFFICIAL,
      [session("s1", "lola", ["u1", "u1", "u2", "u3"]), session("s2", "zed", ["u1"])],
      [
        { id: "u1", name: "Apéro", kind: "user", ownerId: "s1" },
        { id: "u2", name: "APERO", kind: "user" },
        { id: "u3", name: "Brunch", kind: "user", ownerId: "s1" },
        { id: "u4", name: "lyon", kind: "user" },
      ],
    );
    expect(state.sessions.get("s1")?.rooms).toEqual(["u1", "u3"]);
    expect(state.rooms.get("u1")?.ownerId).toBe("s1");
    expect(state.rooms.get("u3")).toEqual({ id: "u3", name: "Brunch", kind: "user" });
    expect(state.rooms.has("u4")).toBe(false);
  });
});
