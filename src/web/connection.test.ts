import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKOFF_MS,
  createConnection,
  HEARTBEAT_MS,
  PONG_TIMEOUT_MS,
  type Connection,
  type EnterForm,
  type SocketLike,
} from "./connection";
import type { Action } from "./store";

const KEY = "asv.session";
const OPEN = 1;
const CLOSED = 3;

class FakeSocket implements SocketLike {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  readonly sent: string[] = [];
  send = vi.fn((data: string) => void this.sent.push(data));
  close = vi.fn();

  open() {
    this.readyState = OPEN;
    this.onopen?.(new Event("open"));
  }
  receive(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
  drop() {
    this.readyState = CLOSED;
    this.onclose?.(new CloseEvent("close"));
  }
  frames(): { type: string; seq: number; payload: Record<string, unknown> }[] {
    return this.sent.filter((s) => s !== "ping").map((s) => JSON.parse(s));
  }
}

const profile = { gender: "woman", age: 30, city: "Lyon" };
const saved = { resumeToken: "tok1", profile };

const form: EnterForm = { pseudo: "ana", gender: "woman", age: 30, city: "Lyon", adultConfirmed: true, termsAccepted: true };

const entered = (resumeToken = "tok1") =>
  JSON.stringify({ type: "entered", seq: 0, payload: { sessionId: "s1", resumeToken, roomList: [], isModerator: false } });
const resumed = (resumeToken = "tok2") =>
  JSON.stringify({ type: "resumed", seq: 0, payload: { sessionId: "s1", pseudo: "ana", resumeToken, rooms: [], windows: [], buffered: [] } });
const simple = (type: string, payload: object = {}) => JSON.stringify({ type, seq: 0, payload });

describe("createConnection", () => {
  let sockets: FakeSocket[];
  let store: Map<string, string>;
  let dispatch: ReturnType<typeof vi.fn<(action: Action) => void>>;
  let connection: Connection;
  let fetchStub: ReturnType<typeof vi.fn<typeof fetch>>;

  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  const last = () => sockets.at(-1) as FakeSocket;
  const start = () => {
    connection = createConnection({
      url: "ws://x/ws",
      createSocket: (url) => {
        expect(url).toBe("ws://x/ws");
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      storage,
      dispatch,
      fetch: fetchStub,
    });
    return last();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    store = new Map();
    dispatch = vi.fn();
    fetchStub = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
  });
  afterEach(() => {
    connection.close();
    vi.useRealTimers();
  });

  describe("opening", () => {
    it("goes online without sending anything when no session is saved", () => {
      const socket = start();

      socket.open();

      expect(dispatch).toHaveBeenCalledWith({ type: "link", link: "online" });
      expect(socket.sent).toEqual([]);
    });

    it("sends resume first when a session is saved, and waits for the answer to go online", () => {
      store.set(KEY, JSON.stringify(saved));
      const socket = start();

      socket.open();

      expect(socket.frames()).toEqual([{ type: "resume", seq: 0, payload: saved }]);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it.each([
      ["corrupt JSON", "{not json"],
      ["null", "null"],
      ["a string", '"x"'],
      ["a missing profile", JSON.stringify({ resumeToken: "t" })],
      ["a missing token", JSON.stringify({ profile })],
      ["a non-string token", JSON.stringify({ resumeToken: 1, profile })],
      ["a null profile", JSON.stringify({ resumeToken: "t", profile: null })],
      ["a non-integer age", JSON.stringify({ resumeToken: "t", profile: { ...profile, age: "30" } })],
    ])("ignores and forgets stored %s", (_name, value) => {
      store.set(KEY, value);
      const socket = start();

      socket.open();

      expect(socket.sent).toEqual([]);
      expect(store.has(KEY)).toBe(false);
      expect(dispatch).toHaveBeenCalledWith({ type: "link", link: "online" });
    });
  });

  describe("session storage", () => {
    it("stores the token and the profile on entered", () => {
      const socket = start();
      socket.open();
      connection.enter(form);

      socket.receive(entered("tokE"));

      expect(JSON.parse(store.get(KEY) ?? "")).toEqual({ resumeToken: "tokE", profile });
      expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: "server" }));
    });

    it("does not store anything on entered when enter was never called", () => {
      const socket = start();
      socket.open();

      socket.receive(entered());

      expect(store.has(KEY)).toBe(false);
    });

    it("forgets the pending profile after a refused entry", () => {
      const socket = start();
      socket.open();
      connection.enter(form);

      socket.receive(JSON.stringify({ type: "entryRefused", seq: 0, payload: { reason: "pseudoTaken" } }));
      socket.receive(entered());

      expect(store.has(KEY)).toBe(false);
    });

    it("rotates the token on resumed and goes online", () => {
      store.set(KEY, JSON.stringify(saved));
      const socket = start();
      socket.open();

      socket.receive(resumed("tokR"));

      expect(JSON.parse(store.get(KEY) ?? "")).toEqual({ resumeToken: "tokR", profile });
      expect(dispatch).toHaveBeenCalledWith({ type: "link", link: "online" });
      expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: "server" }));
    });

    it("does not recreate a session on resumed when storage was emptied", () => {
      const socket = start();
      socket.open();

      socket.receive(resumed());

      expect(store.has(KEY)).toBe(false);
    });

    it.each([
      ["resumeRefused", simple("resumeRefused")],
      ["expelled", simple("expelled", { until: "2026-10-23T10:00:00.000Z" })],
    ])("forgets the session on %s and goes online", (_type, frame) => {
      store.set(KEY, JSON.stringify(saved));
      const socket = start();
      socket.open();

      socket.receive(frame);

      expect(store.has(KEY)).toBe(false);
      expect(dispatch).toHaveBeenCalledWith({ type: "link", link: "online" });
      expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: "server" }));
    });

    it("closes to retry when the resume hits logUnavailable, keeping the session", () => {
      store.set(KEY, JSON.stringify(saved));
      const socket = start();
      socket.open();
      const replyTo = socket.frames().at(-1)?.seq;

      socket.receive(simple("error", { code: "logUnavailable", message: "x", replyTo }));

      expect(socket.close).toHaveBeenCalled();
      expect(store.has(KEY)).toBe(true);
    });

    it("forgets the session and goes online when the resume hits another error", () => {
      store.set(KEY, JSON.stringify(saved));
      const socket = start();
      socket.open();
      const replyTo = socket.frames().at(-1)?.seq;

      socket.receive(simple("error", { code: "invalid", message: "x", replyTo }));

      expect(socket.close).not.toHaveBeenCalled();
      expect(store.has(KEY)).toBe(false);
      expect(dispatch).toHaveBeenCalledWith({ type: "link", link: "online" });
    });

    it("refuses leave while the resume is pending, keeping the session", () => {
      store.set(KEY, JSON.stringify(saved));
      const socket = start();
      socket.open();

      connection.leave();

      expect(socket.frames().map((frame) => frame.type)).toEqual(["resume"]);
      expect(store.has(KEY)).toBe(true);
      expect(dispatch).toHaveBeenLastCalledWith({ type: "notice", code: "notConnected" });
    });

    it("ignores an error that does not answer the resume", () => {
      store.set(KEY, JSON.stringify(saved));
      const socket = start();
      socket.open();

      socket.receive(simple("error", { code: "invalid", message: "x", replyTo: 99 }));

      expect(store.has(KEY)).toBe(true);
    });

    it("keeps the session on other server messages", () => {
      store.set(KEY, JSON.stringify(saved));
      const socket = start();
      socket.open();

      socket.receive(simple("roomList", { rooms: [] }));

      expect(JSON.parse(store.get(KEY) ?? "")).toEqual(saved);
    });
  });

  describe("incoming frames", () => {
    it.each([
      ["invalid JSON", "{nope"],
      ["a schema-invalid frame", JSON.stringify({ type: "roomList", seq: 0, payload: {} })],
      ["an unknown type", JSON.stringify({ type: "mystery", seq: 0, payload: {} })],
    ])("drops %s", (_name, data) => {
      const socket = start();
      socket.open();
      dispatch.mockClear();

      socket.receive(data);

      expect(dispatch).not.toHaveBeenCalled();
    });

    it("dispatches a valid server message", () => {
      const socket = start();
      socket.open();

      socket.receive(simple("roomList", { rooms: [] }));

      expect(dispatch).toHaveBeenLastCalledWith({
        type: "server",
        message: { type: "roomList", seq: 0, payload: { rooms: [] } },
      });
    });
  });

  describe("heartbeat", () => {
    it("sends ping every 25 seconds", () => {
      const socket = start();
      socket.open();

      vi.advanceTimersByTime(HEARTBEAT_MS * 2);

      expect(socket.sent.filter((s) => s === "ping")).toHaveLength(2);
    });

    it("closes the socket when no pong comes within 10 seconds", () => {
      const socket = start();
      socket.open();

      vi.advanceTimersByTime(HEARTBEAT_MS + PONG_TIMEOUT_MS);

      expect(socket.close).toHaveBeenCalledTimes(1);
    });

    it("does not close the socket when the pong arrives in time", () => {
      const socket = start();
      socket.open();
      vi.advanceTimersByTime(HEARTBEAT_MS);

      socket.receive("pong");
      vi.advanceTimersByTime(PONG_TIMEOUT_MS);

      expect(socket.close).not.toHaveBeenCalled();
    });

    it("stops pinging once the socket closes", () => {
      const socket = start();
      socket.open();
      socket.drop();
      socket.sent.length = 0;

      vi.advanceTimersByTime(HEARTBEAT_MS);

      expect(socket.sent).toEqual([]);
    });

    it("keeps pinging and closing on every missed pong", () => {
      const socket = start();
      socket.open();

      vi.advanceTimersByTime(HEARTBEAT_MS * 2 + PONG_TIMEOUT_MS);

      expect(socket.close).toHaveBeenCalledTimes(2);
    });
  });

  describe("reconnection", () => {
    it("reports reconnecting when a session is saved", () => {
      store.set(KEY, JSON.stringify(saved));
      const socket = start();
      socket.open();

      socket.drop();

      expect(dispatch).toHaveBeenLastCalledWith({ type: "link", link: "reconnecting" });
    });

    it("reports offline when no session is saved", () => {
      const socket = start();
      socket.open();

      socket.drop();

      expect(dispatch).toHaveBeenLastCalledWith({ type: "link", link: "offline" });
    });

    it("retries with 1, 2, 4, 8, 16 then 30 seconds capped", () => {
      start();
      const delays: number[] = [];

      for (let i = 0; i < 8; i++) {
        const before = sockets.length;
        last().drop();
        let waited = 0;
        while (sockets.length === before) {
          vi.advanceTimersByTime(1_000);
          waited += 1_000;
        }
        delays.push(waited);
      }

      expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]);
      expect(BACKOFF_MS.at(-1)).toBe(30_000);
    });

    it("resets the backoff once a socket opens", () => {
      start();
      last().drop();
      vi.advanceTimersByTime(1_000);
      last().drop();
      vi.advanceTimersByTime(2_000);
      last().open();

      last().drop();
      const count = sockets.length;
      vi.advanceTimersByTime(999);
      expect(sockets).toHaveLength(count);
      vi.advanceTimersByTime(1);

      expect(sockets).toHaveLength(count + 1);
    });

    it("ignores the close event of a replaced socket", () => {
      const first = start();
      first.drop();
      vi.advanceTimersByTime(1_000);
      dispatch.mockClear();

      first.drop();

      expect(dispatch).not.toHaveBeenCalled();
      expect(sockets).toHaveLength(2);
    });

    it("resumes on the new socket after a reconnection", () => {
      store.set(KEY, JSON.stringify(saved));
      start().drop();
      vi.advanceTimersByTime(1_000);

      last().open();

      expect(last().frames()[0]).toMatchObject({ type: "resume", payload: saved });
    });

    it("stops reconnecting after close()", () => {
      const socket = start();
      connection.close();

      socket.drop();
      vi.advanceTimersByTime(60_000);

      expect(sockets).toHaveLength(1);
      expect(dispatch).not.toHaveBeenCalled();
      expect(socket.close).toHaveBeenCalled();
    });

    it("cancels a pending retry on close()", () => {
      start().drop();

      connection.close();
      vi.advanceTimersByTime(60_000);

      expect(sockets).toHaveLength(1);
    });
  });

  describe("commands", () => {
    it("numbers outgoing frames", () => {
      const socket = start();
      socket.open();

      connection.send({ type: "joinRoom", payload: { roomId: "r1" } });
      connection.send({ type: "createRoom", payload: { name: "abc" } });

      expect(socket.frames().map((f) => f.seq)).toEqual([0, 1]);
      expect(socket.frames()[0]).toEqual({ type: "joinRoom", seq: 0, payload: { roomId: "r1" } });
    });

    it("enter sends the form and dispatches entering with a normalised pseudo", () => {
      const socket = start();
      socket.open();

      connection.enter({ ...form, pseudo: "Zoé" });

      expect(dispatch).toHaveBeenCalledWith({ type: "entering", pseudo: "Zoé" });
      expect(socket.frames()[0]).toMatchObject({ type: "enter", payload: { ...form, pseudo: "Zoé" } });
    });

    it("enter while not open leaves no pending entry", () => {
      start();

      connection.enter(form);

      expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "entering" }));
      expect(dispatch).toHaveBeenLastCalledWith({ type: "notice", code: "notConnected" });
    });

    it("send while not open raises a notConnected notice and sends nothing", () => {
      const socket = start();

      connection.send({ type: "joinRoom", payload: { roomId: "r1" } });

      expect(socket.send).not.toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledWith({ type: "notice", code: "notConnected" });
    });

    it("leave sends leave, forgets the session and dispatches left", () => {
      store.set(KEY, JSON.stringify(saved));
      const socket = start();
      socket.open();
      socket.receive(resumed());

      connection.leave();

      expect(socket.frames().at(-1)).toMatchObject({ type: "leave", payload: {} });
      expect(store.has(KEY)).toBe(false);
      expect(dispatch).toHaveBeenLastCalledWith({ type: "left" });
    });

    it("leave while not open keeps the session to resume it", () => {
      store.set(KEY, JSON.stringify(saved));
      const socket = start();

      connection.leave();

      expect(socket.send).not.toHaveBeenCalled();
      expect(store.has(KEY)).toBe(true);
      expect(dispatch).toHaveBeenLastCalledWith({ type: "notice", code: "notConnected" });
    });
  });

  describe("accounts (web-ui/06)", () => {
    const posted = () => fetchStub.mock.calls.map(([path, init]) => [path, init?.body]);

    it("asks for the code once entered, from the members panel", () => {
      const socket = start();
      socket.open();

      connection.enter(form, { email: "nath@example.org", remember: true });
      expect(socket.frames().map((f) => f.type)).toEqual(["enter"]);
      socket.receive(entered());

      expect(socket.frames().at(-1)).toMatchObject({ type: "requestCode", payload: { email: "nath@example.org", remember: true } });
      expect(dispatch).toHaveBeenCalledWith({ type: "requestingCode" });
    });

    it("forgets the code request when the entry is refused", () => {
      const socket = start();
      socket.open();
      connection.enter(form, { email: "nath@example.org", remember: true });
      socket.receive(simple("entryRefused", { reason: "pseudoTaken" }));
      socket.receive(entered());

      expect(socket.frames().map((f) => f.type)).toEqual(["enter"]);
    });

    it("sends requestCode through send, and reports a closed socket", () => {
      const socket = start();
      socket.open();
      expect(connection.send({ type: "requestCode", payload: { email: "a@b.fr", remember: false } })).toBe(true);
      socket.drop();
      expect(connection.send({ type: "requestCode", payload: { email: "a@b.fr", remember: false } })).toBe(false);
    });

    it("clears a stale device cookie silently", () => {
      const socket = start();
      socket.open();
      socket.receive(JSON.stringify({ type: "entered", seq: 0, payload: { sessionId: "s1", resumeToken: "t", roomList: [], isModerator: false, staleDevice: true } }));

      expect(posted()).toEqual([["/account/sign-out", "{}"]]);
      expect(fetchStub.mock.calls[0]?.[1]).toMatchObject({ method: "POST", credentials: "same-origin" });
    });

    it("redeems the device claim, then shows the panel signed in", async () => {
      const socket = start();
      socket.open();
      socket.receive(simple("accountLinked", { accountId: "a1", deviceClaim: "c1" }));
      await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "accountStep", step: "signedIn" }));

      expect(posted()).toEqual([["/account/device", JSON.stringify({ claim: "c1" })]]);
      expect(dispatch).not.toHaveBeenCalledWith({ type: "notice", code: "deviceNotSaved" });
    });

    it.each([
      ["refused", () => Promise.resolve(new Response(null, { status: 400 }))],
      ["unreachable", () => Promise.reject(new Error("offline"))],
    ])("keeps this visit signed in when the claim is %s", async (_, answer) => {
      fetchStub.mockImplementationOnce(answer);
      const socket = start();
      socket.open();
      socket.receive(simple("accountLinked", { accountId: "a1", deviceClaim: "c1" }));

      await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "accountStep", step: "signedIn" }));
      expect(dispatch).toHaveBeenCalledWith({ type: "notice", code: "deviceNotSaved" });
    });

    it("signs this device out, then shows the panel signed out", async () => {
      start().open();

      await connection.signOutDevice();

      expect(posted()).toEqual([["/account/sign-out", "{}"]]);
      expect(dispatch).toHaveBeenCalledWith({ type: "accountStep", step: "signedOut" });
    });
  });
});
