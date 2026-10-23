import { describe, expect, it, vi } from "vitest";
import type { ConnectionLine, ContributionLine, ConnectionLogStore } from "../domain";
import type { ServerMessage } from "../shared/protocol";
import { createHub, type Outgoing } from "./hub";

const T0 = new Date("2026-10-23T10:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);

/** In-memory log whose writes can be made to fail. */
const fakeLog = () => {
  const opened: ConnectionLine[] = [];
  const closed: string[] = [];
  const contributions: ContributionLine[] = [];
  const fail = { open: false, close: false, contribution: false };
  const store: ConnectionLogStore = {
    open: async (line) => {
      if (fail.open) throw new Error("open");
      opened.push(line);
    },
    close: async (connectionId) => {
      if (fail.close) throw new Error("close");
      closed.push(connectionId);
    },
    appendContribution: async (line) => {
      if (fail.contribution) throw new Error("contribution");
      contributions.push(line);
    },
  };
  return { store, opened, closed, contributions, fail };
};

const setup = (hashToken = (value: string) => `h:${value}`) => {
  let n = 0;
  const log = fakeLog();
  const onLogError = vi.fn();
  const hub = createHub({
    officialRooms: [
      { id: "lyon", name: "Lyon", kind: "regional" },
      { id: "cine", name: "Ciné", kind: "themed" },
    ],
    random: {
      id: () => `id${++n}`,
      token: () => {
        const value = `tok${++n}`;
        return { value, hash: `h:${value}` };
      },
    },
    hashToken,
    log: log.store,
    protocols: "HTTP/1.1 WebSocket",
    onLogError,
  });
  const send = (key: string, type: string, payload: object, seq = 1, now = T0) =>
    hub.receive(key, JSON.stringify({ type, seq, payload }), now);
  const enterAs = async (key: string, pseudo: string, extra: object = {}) => {
    hub.open(key, `10.0.0.${key}`, 4000);
    const out = await send(key, "enter", { pseudo, gender: "woman", age: 30, adultConfirmed: true, termsAccepted: true, ...extra });
    const entered = only(out, "entered");
    return entered.payload;
  };
  return { hub, log, onLogError, send, enterAs };
};

/** The single outgoing message of a type, with its recipients checked by the caller. */
const find = <T extends ServerMessage["type"]>(out: Outgoing[], type: T) =>
  out.filter((o): o is Outgoing & { message: Extract<ServerMessage, { type: T }> } => o.message.type === type);
const only = <T extends ServerMessage["type"]>(out: Outgoing[], type: T) => {
  const [first, ...rest] = find(out, type);
  if (!first || rest.length > 0) throw new Error(`expected one ${type}, got ${out.map((o) => o.message.type).join(",")}`);
  return first.message;
};
const to = (out: Outgoing[], type: ServerMessage["type"]) => find(out, type).flatMap((o) => o.to);

describe("hub entry (UC1)", () => {
  it("enters, opens the connection line and counts the session", async () => {
    const { hub, log, enterAs } = setup();

    const entered = await enterAs("1", "Lola");

    expect(entered).toMatchObject({ isModerator: false, roomList: [{ id: "lyon", count: 0 }, { id: "cine", count: 0 }] });
    expect(log.opened).toEqual([
      { connectionId: expect.any(String), ip: "10.0.0.1", port: 4000, protocols: "HTTP/1.1 WebSocket", pseudo: "Lola", accountId: undefined, openedAt: T0 },
    ]);
    expect(hub.stats()).toEqual({ connected: 1 });
  });

  it("maps a refusal and a modified client", async () => {
    const { hub, send } = setup();
    hub.open("1", "ip", undefined);

    const refused = await send("1", "enter", { pseudo: "x", age: 30, adultConfirmed: true, termsAccepted: true });
    const invalid = await send("1", "enter", { pseudo: "Lola", age: 30, adultConfirmed: true, termsAccepted: false }, 4);

    expect(only(refused, "entryRefused").payload).toEqual({ reason: "pseudoInvalid" });
    expect(only(invalid, "error").payload).toEqual({ code: "invalid", message: "invalid", replyTo: 4 });
  });

  it("refuses the entry when the connection line cannot be written, and frees the pseudo", async () => {
    const { hub, log, onLogError, send, enterAs } = setup();
    log.fail.open = true;
    hub.open("1", "ip", undefined);

    const out = await send("1", "enter", { pseudo: "Lola", age: 30, adultConfirmed: true, termsAccepted: true }, 2);

    expect(only(out, "error").payload).toMatchObject({ code: "logUnavailable", replyTo: 2 });
    expect(hub.stats().connected).toBe(0);
    expect(onLogError).toHaveBeenCalledWith(expect.any(Error));
    log.fail.open = false;
    await expect(enterAs("2", "Lola")).resolves.toMatchObject({ isModerator: false });
  });

  it("refuses commands before entry and a second entry", async () => {
    const { hub, send, enterAs } = setup();
    hub.open("1", "ip", undefined);

    expect(only(await send("1", "joinRoom", { roomId: "lyon" }, 3), "error").payload).toMatchObject({ code: "forbidden", replyTo: 3 });
    await enterAs("2", "Lola");
    expect(only(await send("2", "enter", { pseudo: "Max", age: 30, adultConfirmed: true, termsAccepted: true }), "error").payload)
      .toMatchObject({ code: "invalid" });
  });
});

describe("hub validation (issue #13)", () => {
  it("refuses a frame over the cap, invalid JSON and an invalid message", async () => {
    const { hub } = setup();
    hub.open("1", "ip", undefined);

    const big = await hub.receive("1", "x".repeat(65_537), T0);
    const json = await hub.receive("1", "{", T0);
    const shape = await hub.receive("1", JSON.stringify({ type: "joinRoom", seq: 9, payload: {} }), T0);
    const noSeq = await hub.receive("1", JSON.stringify({ type: "joinRoom", seq: -1 }), T0);
    const notObject = await hub.receive("1", "3", T0);

    expect(only(big, "error").payload).toEqual({ code: "invalid", message: "frameTooLarge" });
    expect(only(json, "error").payload).toEqual({ code: "invalid", message: "invalid" });
    expect(only(shape, "error").payload).toEqual({ code: "invalid", message: "invalid", replyTo: 9 });
    expect(only(noSeq, "error").payload).toEqual({ code: "invalid", message: "invalid" });
    expect(only(notObject, "error").payload).toEqual({ code: "invalid", message: "invalid" });
  });

  it("ignores frames from an unknown socket", async () => {
    expect(await setup().hub.receive("nope", "{}", T0)).toEqual([]);
  });

  it("answers commands of later bricks with notAvailable", async () => {
    const { send, enterAs } = setup();
    await enterAs("1", "Lola");

    expect(only(await send("1", "search", { query: "Lyon" }, 5), "error").payload)
      .toEqual({ code: "invalid", message: "notAvailable", replyTo: 5 });
  });
});

describe("hub rooms (UC3, UC4, UC5)", () => {
  it("joins: members to the joiner, presence to the others, list to everyone", async () => {
    const { send, enterAs } = setup();
    const lola = await enterAs("1", "Lola", { city: "Lyon" });
    const max = await enterAs("2", "Max", { gender: "man", city: "  " });
    await send("1", "joinRoom", { roomId: "lyon" });

    const out = await send("2", "joinRoom", { roomId: "lyon" });

    expect(to(out, "roomJoined")).toEqual(["2"]);
    expect(only(out, "roomJoined").payload.members).toEqual([
      { sessionId: lola.sessionId, pseudo: "Lola", away: false, gender: "woman", age: 30, city: "Lyon" },
      { sessionId: max.sessionId, pseudo: "Max", away: false, gender: "man", age: 30 },
    ]);
    expect(to(out, "memberJoined")).toEqual(["1"]);
    expect(only(out, "memberJoined").payload).toEqual({
      roomId: "lyon",
      member: { sessionId: max.sessionId, pseudo: "Max", away: false, gender: "man", age: 30 },
    });
    expect(to(out, "roomList").sort()).toEqual(["1", "2"]);
    expect(only(out, "roomList").payload.rooms[0]).toMatchObject({ id: "lyon", count: 2 });
  });

  it("posts after writing the contribution line, to every member with the author's gender", async () => {
    const { log, send, enterAs } = setup();
    const lola = await enterAs("1", "Lola");
    await enterAs("2", "Max");
    await send("1", "joinRoom", { roomId: "lyon" });
    await send("2", "joinRoom", { roomId: "lyon" });

    const out = await send("1", "postRoom", { roomId: "lyon", text: " slt :) " }, 1, later(1000));

    expect(to(out, "roomMessage").sort()).toEqual(["1", "2"]);
    expect(only(out, "roomMessage").payload).toEqual({
      roomId: "lyon",
      authorSessionId: lola.sessionId,
      pseudo: "Lola",
      gender: "woman",
      text: "slt :)",
      sentAt: later(1000).toISOString(),
    });
    expect(log.contributions).toEqual([{ connectionId: log.opened[0]?.connectionId, protocols: "HTTP/1.1 WebSocket", at: later(1000) }]);
  });

  it("drops a message whose contribution line cannot be written (BR-060)", async () => {
    const { log, onLogError, send, enterAs } = setup();
    await enterAs("1", "Lola");
    await send("1", "joinRoom", { roomId: "lyon" });
    log.fail.contribution = true;

    const failed = await send("1", "postRoom", { roomId: "lyon", text: "hi" }, 7);
    const created = await send("1", "createRoom", { name: "Les Viennois" }, 8);

    expect(failed.map((o) => o.message.type)).toEqual(["error"]);
    expect(only(failed, "error").payload).toMatchObject({ code: "logUnavailable", replyTo: 7 });
    expect(only(created, "error").payload).toMatchObject({ code: "logUnavailable", replyTo: 8 });
    expect(onLogError).toHaveBeenCalledTimes(2);
    log.fail.contribution = false;
    // Nothing was kept: the room name is still free.
    const retried = only(await send("1", "createRoom", { name: "Les Viennois" }), "roomJoined").payload;
    expect(retried.roomId).not.toBe("lyon");
    expect(retried.members).toHaveLength(1);
  });

  it("maps a refusal to a warning linked to the command", async () => {
    const { send, enterAs } = setup();
    await enterAs("1", "Lola");

    const out = await send("1", "postRoom", { roomId: "lyon", text: "hi" }, 6);

    expect(only(out, "warning").payload).toEqual({ code: "notMember", message: "notMember", replyTo: 6 });
  });

  it("creates a room, logged, and refreshes the list", async () => {
    const { log, send, enterAs } = setup();
    await enterAs("1", "Lola");

    const out = await send("1", "createRoom", { name: "Les Viennois" });

    expect(only(out, "roomJoined").payload.members).toHaveLength(1);
    expect(find(out, "memberJoined")).toEqual([]);
    expect(only(out, "roomList").payload.rooms.at(-1)).toMatchObject({ name: "Les Viennois", kind: "user", count: 1 });
    expect(log.contributions).toHaveLength(1);
  });

  it("leaves a room: presence to the others, list refreshed", async () => {
    const { send, enterAs } = setup();
    await enterAs("1", "Lola");
    await enterAs("2", "Max");
    await send("1", "joinRoom", { roomId: "lyon" });
    await send("2", "joinRoom", { roomId: "lyon" });

    const out = await send("2", "leaveRoom", { roomId: "lyon" });

    expect(to(out, "memberLeft")).toEqual(["1"]);
    expect(only(out, "roomList").payload.rooms[0]).toMatchObject({ count: 1 });
  });
});

describe("hub away, resume, leave and expiry (UC10, UC13)", () => {
  /** Lola and Max in Lyon, then Max's socket dies. */
  const maxAway = async () => {
    const ctx = setup();
    await ctx.enterAs("1", "Lola");
    const max = await ctx.enterAs("2", "Max");
    await ctx.send("1", "joinRoom", { roomId: "lyon" });
    await ctx.send("2", "joinRoom", { roomId: "lyon" });
    const out = await ctx.hub.close("2", later(1000));
    return { ...ctx, max, out };
  };

  it("announces an away member, closes its line and lists it without profile (#21)", async () => {
    const { log, max, out, send, enterAs } = await maxAway();
    await enterAs("3", "Zoe");

    const joined = await send("3", "joinRoom", { roomId: "lyon" });

    expect(to(out, "memberAway")).toEqual(["1"]);
    expect(only(out, "memberAway").payload).toEqual({ roomId: "lyon", sessionId: max.sessionId, pseudo: "Max" });
    expect(log.closed).toEqual([log.opened[1]?.connectionId]);
    expect(only(joined, "roomJoined").payload.members).toContainEqual({ sessionId: max.sessionId, pseudo: "Max", away: true });
  });

  it("resumes with the rooms and a new connection line, announced to the others", async () => {
    const { hub, log, max, send } = await maxAway();
    hub.open("9", "10.0.0.9", 5000);

    const out = await send("9", "resume", { resumeToken: max.resumeToken, profile: { gender: "man", age: 31 } }, 1, later(2000));

    const resumed = only(out, "resumed").payload;
    expect(resumed).toMatchObject({ sessionId: max.sessionId, pseudo: "Max", windows: [], buffered: [], rooms: [{ roomId: "lyon" }] });
    expect(resumed.resumeToken).not.toBe(max.resumeToken);
    expect(to(out, "roomList")).toEqual(["9"]);
    expect(to(out, "memberBack")).toEqual(["1"]);
    expect(only(out, "memberBack").payload).toEqual({
      roomId: "lyon",
      member: { sessionId: max.sessionId, pseudo: "Max", away: false, gender: "man", age: 31 },
    });
    expect(log.opened.at(-1)).toMatchObject({ ip: "10.0.0.9", port: 5000, pseudo: "Max", openedAt: later(2000) });
  });

  it("takes the session over from a socket not swept yet (network change)", async () => {
    const ctx = setup();
    await ctx.enterAs("1", "Lola");
    const max = await ctx.enterAs("2", "Max");
    await ctx.send("1", "joinRoom", { roomId: "lyon" });
    await ctx.send("2", "joinRoom", { roomId: "lyon" });
    ctx.hub.open("9", "10.0.0.9", undefined);

    const out = await ctx.send("9", "resume", { resumeToken: max.resumeToken, profile: { age: 30 } }, 1, later(2000));
    const posted = await ctx.send("9", "postRoom", { roomId: "lyon", text: "re" });

    expect(only(out, "resumed").payload).toMatchObject({ sessionId: max.sessionId, rooms: [{ roomId: "lyon" }] });
    expect(ctx.log.closed).toEqual([ctx.log.opened[1]?.connectionId]);
    expect(to(posted, "roomMessage")).toEqual(["1", "9"]);
    expect(only(await ctx.send("2", "postRoom", { roomId: "lyon", text: "x" }), "error").payload).toMatchObject({ code: "forbidden" });
    expect(await ctx.hub.close("2", later(3000))).toEqual([]);
  });

  it("refuses a wrong token and an invalid profile", async () => {
    const { hub, max, send } = await maxAway();
    hub.open("9", "ip", undefined);

    expect(only(await send("9", "resume", { resumeToken: "bad", profile: { age: 30 } }), "resumeRefused").payload).toEqual({});
    expect(only(await send("9", "resume", { resumeToken: max.resumeToken, profile: { age: 12 } }, 3), "error").payload)
      .toMatchObject({ code: "invalid", replyTo: 3 });
  });

  it("keeps the session away when the new line cannot be written", async () => {
    const { hub, log, max, send } = await maxAway();
    hub.open("9", "ip", undefined);
    log.fail.open = true;

    const failed = await send("9", "resume", { resumeToken: max.resumeToken, profile: { age: 30 } });
    log.fail.open = false;
    const retried = await send("9", "resume", { resumeToken: max.resumeToken, profile: { age: 30 } });

    expect(only(failed, "error").payload).toMatchObject({ code: "logUnavailable" });
    expect(only(retried, "resumed").payload.rooms).toMatchObject([{ roomId: "lyon" }]);
  });

  it("expires an away session after 5 minutes (BR-015)", async () => {
    const { hub } = await maxAway();

    expect(await hub.tick(later(60_000))).toEqual([]);
    const out = await hub.tick(later(1000 + 5 * 60_000));

    expect(to(out, "memberLeft")).toEqual(["1"]);
    expect(only(out, "roomList").payload.rooms[0]).toMatchObject({ count: 1 });
    expect(hub.stats().connected).toBe(1);
  });

  it("leaves: presence to the others, line closed, socket free to enter again", async () => {
    const { log, send, enterAs } = setup();
    await enterAs("1", "Lola");
    await enterAs("2", "Max");
    await send("1", "joinRoom", { roomId: "lyon" });
    await send("2", "joinRoom", { roomId: "lyon" });

    const out = await send("2", "leave", {});
    const again = await send("2", "enter", { pseudo: "Max", age: 30, adultConfirmed: true, termsAccepted: true });

    expect(to(out, "memberLeft")).toEqual(["1"]);
    expect(log.closed).toEqual([log.opened[1]?.connectionId]);
    expect(only(again, "entered").payload.isModerator).toBe(false);
  });

  it("reports a line that cannot be closed and still closes the session", async () => {
    const { hub, log, onLogError, enterAs } = setup();
    await enterAs("1", "Lola");
    log.fail.close = true;

    await hub.close("1", T0);

    expect(onLogError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("forgets a socket without session", async () => {
    const { hub } = setup();
    hub.open("1", "ip", undefined);

    expect(await hub.close("1", T0)).toEqual([]);
    expect(await hub.close("1", T0)).toEqual([]);
  });

  it("runs operations one after the other", async () => {
    const { hub, send, enterAs } = setup();
    await enterAs("1", "Lola");

    const [joined, posted] = await Promise.all([
      send("1", "joinRoom", { roomId: "lyon" }),
      send("1", "postRoom", { roomId: "lyon", text: "hi" }),
    ]);

    // The post was accepted, so it ran after the join: before it, the post is refused with notMember.
    expect(only(joined, "roomJoined").payload.roomId).toBe("lyon");
    expect(only(posted, "roomMessage").payload).toMatchObject({ roomId: "lyon", text: "hi" });
    expect(find(posted, "warning")).toEqual([]);
    expect(hub.stats().connected).toBe(1);
  });
});

describe("hub queue", () => {
  it("keeps serving after an operation threw", async () => {
    const { hub, send, enterAs } = setup(() => {
      throw new Error("hash");
    });
    hub.open("9", "ip", undefined);

    await expect(send("9", "resume", { resumeToken: "t", profile: { age: 30 } })).rejects.toThrow("hash");
    await expect(enterAs("1", "Lola")).resolves.toMatchObject({ isModerator: false });
  });
});
