import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Member, ServerMessage } from "../shared/protocol";
import { App } from "./App";
import { browserConnection, ChatProvider, useChat, type ConnectionFactory } from "./chat-context";
import type { Connection } from "./connection";
import { STATS_MS } from "./screens/EntryScreen";
import { RoomScreen } from "./screens/RoomScreen";
import type { Action } from "./store";
import { STRINGS } from "./strings";

type Dispatch = (action: Action) => void;

let dispatch: Dispatch;
let connection: { [K in keyof Connection]: ReturnType<typeof vi.fn<Connection[K]>> };
let connect: ConnectionFactory;

const fire = (action: Action) => act(() => dispatch(action));
const fromServer = (message: ServerMessage) => fire({ type: "server", message });
const msg = <T extends ServerMessage["type"]>(type: T, payload: Extract<ServerMessage, { type: T }>["payload"]) =>
  ({ type, seq: 0, payload }) as ServerMessage;

const man = (sessionId: string, pseudo = sessionId): Member => ({ sessionId, pseudo, away: false, gender: "man", age: 30 });
const woman = (sessionId: string, pseudo = sessionId): Member => ({ sessionId, pseudo, away: false, gender: "woman", age: 25, city: "Lyon" });
const away = (sessionId: string, pseudo = sessionId): Member => ({ sessionId, pseudo, away: true });

const rooms = [
  { id: "r1", name: "Paris", kind: "regional" as const, count: 2 },
  { id: "r2", name: "Cinéma", kind: "themed" as const, count: 0 },
  { id: "u1", name: "Chez Ana", kind: "user" as const, count: 1 },
];

const stubStats = (body: unknown = { connected: 3 }, ok = true) => {
  const fetchStub = vi.fn(async () => ({ ok, json: async () => body }) as Response);
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
};

const setup = async () => {
  const user = userEvent.setup();
  render(<App connect={connect} />);
  await act(async () => {});
  return user;
};

const goOnline = () => fire({ type: "link", link: "online" });
const enterChat = async (pseudo = "ana") => {
  await fire({ type: "entering", pseudo });
  await fromServer(msg("entered", { sessionId: "me", resumeToken: "t", roomList: rooms, isModerator: false }));
};
const joinRoom = (roomId: string, members: Member[] = [man("s2", "bob")]) =>
  fromServer(msg("roomJoined", { roomId, members }));

beforeEach(() => {
  connection = { enter: vi.fn(), signOutDevice: vi.fn(async () => undefined), send: vi.fn(() => true), leave: vi.fn(), close: vi.fn() };
  connect = (d) => {
    dispatch = d;
    return connection;
  };
  stubStats();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("entry screen", () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>, { age = "30", pseudo = "  ana  " } = {}) => {
    await user.type(screen.getByLabelText(STRINGS.pseudo), pseudo);
    if (age !== "") await user.type(screen.getByLabelText(STRINGS.age), age);
    await user.click(screen.getByLabelText(STRINGS.adult));
    await user.click(screen.getByLabelText(STRINGS.terms));
  };
  const enterButton = () => screen.getByRole("button", { name: STRINGS.enter }) as HTMLButtonElement;

  it("caps the city at 40 characters, not UTF-16 units (BR-006)", async () => {
    const user = await setup();
    const city = screen.getByLabelText(STRINGS.city) as HTMLInputElement;
    await user.click(city);

    await user.paste("😀".repeat(41));

    expect([...city.value]).toHaveLength(40);
  });

  it("disables ENTRER while an entry is pending", async () => {
    const user = await setup();
    await goOnline();
    await fill(user);

    act(() => dispatch({ type: "entering", pseudo: "ana" }));

    expect(enterButton().disabled).toBe(true);
  });

  it("disables ENTRER while the link is not online", async () => {
    const user = await setup();

    await fill(user);

    expect(enterButton().disabled).toBe(true);
  });

  it.each([
    ["the pseudo is blank", { pseudo: "   " }],
    ["the age is empty", { age: "" }],
  ])("keeps ENTRER disabled when %s", async (_name, overrides) => {
    const user = await setup();
    await goOnline();

    await fill(user, overrides);

    expect(enterButton().disabled).toBe(true);
  });

  it.each([
    ["adult", STRINGS.adult],
    ["terms", STRINGS.terms],
  ])("keeps ENTRER disabled when only the %s box is missing", async (_name, label) => {
    const user = await setup();
    await goOnline();
    await fill(user);

    await user.click(screen.getByLabelText(label));

    expect(enterButton().disabled).toBe(true);
  });

  it("enables ENTRER once everything is filled and online", async () => {
    const user = await setup();
    await goOnline();

    await fill(user);

    expect(enterButton().disabled).toBe(false);
  });

  it("calls enter with trimmed fields and the chosen gender, city omitted when blank", async () => {
    const user = await setup();
    await goOnline();
    await fill(user);
    await user.click(screen.getByLabelText(STRINGS.genders.man));

    await user.click(enterButton());

    expect(connection.enter).toHaveBeenCalledWith({
      pseudo: "ana",
      gender: "man",
      age: 30,
      adultConfirmed: true,
      termsAccepted: true,
    }, undefined);
  });

  it("sends the trimmed city when given", async () => {
    const user = await setup();
    await goOnline();
    await fill(user);
    await user.type(screen.getByLabelText(STRINGS.city), "  Lyon ");

    await user.click(enterButton());

    expect(connection.enter).toHaveBeenCalledWith(expect.objectContaining({ city: "Lyon", gender: "unspecified" }), undefined);
  });

  it("does not submit a form that is not ready", async () => {
    await setup();
    await goOnline();

    fireEvent.submit(screen.getByRole("form", { name: STRINGS.guestTitle }));

    expect(connection.enter).not.toHaveBeenCalled();
  });

  it("shows the entry error text", async () => {
    await setup();
    await fromServer(msg("entryRefused", { reason: "pseudoTaken" }));

    expect(screen.getByRole("alert").textContent).toBe(STRINGS.entryRefused.pseudoTaken);
  });

  it("prefills the pseudo after a leave", async () => {
    await setup();
    await enterChat("ana");
    await fire({ type: "left" });

    expect((screen.getByLabelText(STRINGS.pseudo) as HTMLInputElement).value).toBe("ana");
  });

  it("enters then asks for a code from the members panel", async () => {
    const user = await setup();
    await goOnline();
    await fill(user);
    const panel = screen.getByRole("form", { name: STRINGS.membersTitle });
    await user.type(within(panel).getByLabelText(STRINGS.email), " nath@example.org ");
    await user.click(within(panel).getByLabelText(STRINGS.remember));

    await user.click(within(panel).getByRole("button", { name: STRINGS.getCode }));

    expect(connection.enter).toHaveBeenCalledWith(expect.objectContaining({ pseudo: "ana" }), { email: "nath@example.org", remember: false });
  });

  it("shows a hint when the members panel is used before the pseudo form is ready", async () => {
    const user = await setup();
    await goOnline();
    const panel = screen.getByRole("form", { name: STRINGS.membersTitle });
    await user.type(within(panel).getByLabelText(STRINGS.email), "nath@example.org");

    await user.click(within(panel).getByRole("button", { name: STRINGS.getCode }));

    expect(within(panel).getByRole("alert").textContent).toBe(STRINGS.membersHint);
    expect(connection.enter).not.toHaveBeenCalled();
  });

  it("renders the footer links", async () => {
    await setup();

    for (const label of STRINGS.footer) expect(screen.getByText(label)).toBeTruthy();
  });
});

describe("connected count", () => {
  it("shows the count from /api/stats", async () => {
    const fetchStub = stubStats({ connected: 1 });
    await setup();

    expect(fetchStub).toHaveBeenCalledWith("/api/stats", { signal: expect.any(AbortSignal) });
    expect(screen.getByText("1 connecté")).toBeTruthy();
  });

  it("pluralises the count", async () => {
    stubStats({ connected: 12 });
    await setup();

    expect(screen.getByText("12 connectés")).toBeTruthy();
  });

  it.each([
    ["a non-ok response", () => stubStats({ connected: 3 }, false)],
    ["a non-object body", () => stubStats("nope")],
    ["a null body", () => stubStats(null)],
    ["a body without the field", () => stubStats({})],
    ["a non-number field", () => stubStats({ connected: "3" })],
    ["a network error", () => vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))))],
  ])("hides the count on %s", async (_name, stub) => {
    stub();
    await setup();

    expect(screen.queryByText(/connecté/)).toBeNull();
  });

  it("refreshes every 30 seconds", async () => {
    vi.useFakeTimers();
    const fetchStub = stubStats({ connected: 3 });
    render(<App connect={connect} />);
    await act(async () => {});
    stubStats({ connected: 4 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATS_MS);
    });

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(screen.getByText("4 connectés")).toBeTruthy();
  });

  it("stops refreshing on unmount", async () => {
    vi.useFakeTimers();
    const fetchStub = stubStats();
    const { unmount } = render(<App connect={connect} />);
    await act(async () => {});

    unmount();
    await vi.advanceTimersByTimeAsync(STATS_MS * 2);

    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["answer", () => new Promise<Response>((resolve) => setTimeout(() => resolve({ ok: true, json: async () => ({ connected: 3 }) } as Response), 10))],
    ["failure", () => new Promise<Response>((_resolve, reject) => setTimeout(() => reject(new Error("late")), 10))],
  ])("aborts the request and ignores a late %s after unmount", async (_name, slow) => {
    vi.useFakeTimers();
    const fetchStub = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(slow);
    vi.stubGlobal("fetch", fetchStub);
    const { unmount } = render(<App connect={connect} />);

    unmount();
    await vi.advanceTimersByTimeAsync(20);

    const init: unknown = fetchStub.mock.calls[0]?.[1];
    expect(init).toMatchObject({ signal: { aborted: true } });
  });

  it("shows the pseudo and a quit button instead of the count once entered", async () => {
    await setup();

    await enterChat("ana");

    expect(screen.queryByText(/connecté/)).toBeNull();
    expect(screen.getByText("ana")).toBeTruthy();
  });
});

describe("header", () => {
  it("calls leave when clicking quitter", async () => {
    const user = await setup();
    await enterChat();

    await user.click(screen.getByRole("button", { name: STRINGS.quit }));

    expect(connection.leave).toHaveBeenCalledTimes(1);
  });
});

describe("banners", () => {
  it("shows the reconnecting banner", async () => {
    await setup();

    await fire({ type: "link", link: "reconnecting" });

    expect(screen.getByRole("status").textContent).toBe(STRINGS.reconnecting);
  });

  it("shows the offline banner on the entry screen", async () => {
    await setup();

    expect(screen.getByRole("status").textContent).toBe(STRINGS.offline);
  });

  it("hides the offline banner once online", async () => {
    await setup();

    await goOnline();

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("hides the offline banner outside the entry screen", async () => {
    await setup();
    await enterChat();

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows a known notice, then dismisses it", async () => {
    const user = await setup();
    await fire({ type: "notice", code: "flood" });

    expect(screen.getByRole("alert").textContent).toContain(STRINGS.notices.flood);

    await user.click(screen.getByRole("button", { name: STRINGS.dismiss }));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the generic text for an unknown notice code", async () => {
    await setup();

    await fire({ type: "notice", code: "mystery" });

    expect(screen.getByRole("alert").textContent).toContain(STRINGS.genericNotice);
  });

  it("shows the notice of a server warning", async () => {
    await setup();

    await fromServer(msg("warning", { code: "full", message: "m" }));

    expect(screen.getByRole("alert").textContent).toContain(STRINGS.notices.full);
  });
});

describe("rooms screen", () => {
  it("lists official and user rooms with counts", async () => {
    await setup();

    await enterChat();

    expect(screen.getByRole("button", { name: "Paris (2)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cinéma (0)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chez Ana (1)" })).toBeTruthy();
    expect(screen.queryByText(STRINGS.noUserRoom)).toBeNull();
  });

  it("says when there is no user room", async () => {
    await setup();

    await fromServer(msg("entered", { sessionId: "me", resumeToken: "t", roomList: [rooms[0] as (typeof rooms)[0]], isModerator: false }));

    expect(screen.getByText(STRINGS.noUserRoom)).toBeTruthy();
  });

  it("joins a room that is not open yet", async () => {
    const user = await setup();
    await enterChat();

    await user.click(screen.getByRole("button", { name: "Paris (2)" }));

    expect(connection.send).toHaveBeenCalledWith({ type: "joinRoom", payload: { roomId: "r1" } });
  });

  it("shows an already open room without sending anything", async () => {
    const user = await setup();
    await enterChat();
    await joinRoom("r1");
    await user.click(screen.getByRole("button", { name: STRINGS.backToRooms }));

    await user.click(screen.getByRole("button", { name: "Paris (2)" }));

    expect(connection.send).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "# Paris" })).toBeTruthy();
  });

  it("creates a room from the form and clears the field", async () => {
    const user = await setup();
    await enterChat();
    const field = screen.getByLabelText(STRINGS.roomName) as HTMLInputElement;

    await user.type(field, "Mon salon");
    await user.click(screen.getByRole("button", { name: STRINGS.create }));

    expect(connection.send).toHaveBeenCalledWith({ type: "createRoom", payload: { name: "Mon salon" } });
    expect(field.value).toBe("");
  });

  it("keeps the room name when the create could not be sent", async () => {
    const user = await setup();
    await enterChat();
    connection.send.mockReturnValue(false);
    const field = screen.getByLabelText(STRINGS.roomName) as HTMLInputElement;

    await user.type(field, "Mon salon{Enter}");

    expect(field.value).toBe("Mon salon");
  });

  it("ignores a blank room name", async () => {
    const user = await setup();
    await enterChat();

    await user.type(screen.getByLabelText(STRINGS.roomName), "   ");
    await user.click(screen.getByRole("button", { name: STRINGS.create }));

    expect(connection.send).not.toHaveBeenCalled();
  });
});

describe("room screen", () => {
  const message = (roomId: string, text: string, pseudo = "bob"): ServerMessage =>
    msg("roomMessage", { roomId, authorSessionId: "s2", pseudo, gender: "man", text, sentAt: "2026-10-23T10:00:00.000Z" });

  it("renders nothing when no room is active", () => {
    const { container } = render(
      <ChatProvider connect={connect}>
        <RoomScreen />
      </ChatProvider>,
    );

    expect(container.innerHTML).toBe("");
  });

  it("falls back to the room id when its name is unknown", async () => {
    await setup();
    await enterChat();

    await joinRoom("zz");

    expect(screen.getByRole("heading", { name: "# zz" })).toBeTruthy();
  });

  it("shows tabs, marks the active one and switches on click", async () => {
    const user = await setup();
    await enterChat();
    await joinRoom("r1");
    await joinRoom("r2");
    const nav = screen.getByRole("navigation");

    await user.click(within(nav).getByRole("button", { name: "# Paris" }));

    expect(within(nav).getByRole("button", { name: "# Paris" }).getAttribute("aria-current")).toBe("true");
    expect(within(nav).getByRole("button", { name: "# Cinéma" }).getAttribute("aria-current")).toBe("false");
    expect(screen.getByRole("heading", { name: "# Paris" })).toBeTruthy();
  });

  it("closing a tab sends leaveRoom and falls back to another room", async () => {
    const user = await setup();
    await enterChat();
    await joinRoom("r1");
    await joinRoom("r2");

    await user.click(screen.getByRole("button", { name: STRINGS.closeTab("Cinéma") }));

    expect(connection.send).toHaveBeenCalledWith({ type: "leaveRoom", payload: { roomId: "r2" } });
    expect(screen.getByRole("heading", { name: "# Paris" })).toBeTruthy();
  });

  it("keeps the tab when leaveRoom could not be sent", async () => {
    const user = await setup();
    await enterChat();
    await joinRoom("r1");
    connection.send.mockReturnValue(false);

    await user.click(screen.getByRole("button", { name: STRINGS.closeTab("Paris") }));

    expect(screen.getByRole("heading", { name: "# Paris" })).toBeTruthy();
  });

  it("closing the last tab goes back to the rooms list", async () => {
    const user = await setup();
    await enterChat();
    await joinRoom("r1");

    await user.click(screen.getByRole("button", { name: STRINGS.closeTab("Paris") }));

    expect(screen.getByRole("heading", { name: STRINGS.officialRooms })).toBeTruthy();
  });

  it("goes back to the rooms list with the salons button", async () => {
    const user = await setup();
    await enterChat();
    await joinRoom("r1");

    await user.click(screen.getByRole("button", { name: STRINGS.backToRooms }));

    expect(screen.getByRole("heading", { name: STRINGS.officialRooms })).toBeTruthy();
  });

  it("toggles the members panel", async () => {
    const user = await setup();
    await enterChat();
    await joinRoom("r1");
    const toggle = screen.getByRole("button", { name: `${STRINGS.members} (1)` });

    await user.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector("aside")?.className).toContain("members-open");

    await user.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("aside")?.className).not.toContain("members-open");
  });

  it("lists connected members with age and city when given", async () => {
    await setup();
    await enterChat();

    await joinRoom("r1", [woman("s1", "ana"), man("s2", "bob")]);

    const items = within(screen.getByRole("complementary")).getAllByRole("listitem");
    expect(items[0]?.textContent).toBe("ana 25 Lyon");
    expect(items[0]?.querySelector(".pseudo-woman")).not.toBeNull();
    expect(items[1]?.textContent).toBe("bob 30");
  });

  it("shows an away member with (absent) in its known gender class", async () => {
    await setup();
    await enterChat();
    await joinRoom("r1", [man("s2", "bob")]);

    await fromServer(msg("memberAway", { roomId: "r1", sessionId: "s2", pseudo: "bob" }));

    const pseudo = within(screen.getByRole("complementary")).getByText("bob");
    expect(pseudo.className).toContain("pseudo-man");
    expect(pseudo.className).toContain("pseudo-away");
    expect(pseudo.textContent).toContain(STRINGS.away);
  });

  it("uses the neutral class for an away member whose gender was never seen", async () => {
    await setup();
    await enterChat();

    await joinRoom("r1", [away("s9", "zed")]);

    expect(within(screen.getByRole("complementary")).getByText("zed").className).toContain("pseudo-unspecified");
  });

  it("renders lines with smileys and literal HTML", async () => {
    await setup();
    await enterChat();
    await joinRoom("r1");

    await fromServer(message("r1", "salut :) <b>x</b>"));

    const line = within(screen.getByRole("log")).getByRole("listitem");
    expect(line.textContent).toBe("bob: salut 🙂 <b>x</b>");
    expect(line.querySelector("b")).toBeNull();
    expect(within(line).getByRole("img").getAttribute("aria-label")).toBe(":)");
  });

  it("posts the text on submit and clears the field", async () => {
    const user = await setup();
    await enterChat();
    await joinRoom("r1");
    const field = screen.getByLabelText(STRINGS.message) as HTMLInputElement;

    await user.type(field, "bonjour");
    await user.click(screen.getByRole("button", { name: STRINGS.send }));

    expect(connection.send).toHaveBeenCalledWith({ type: "postRoom", payload: { roomId: "r1", text: "bonjour" } });
    expect(field.value).toBe("");
  });

  it("keeps the draft when the post could not be sent", async () => {
    const user = await setup();
    await enterChat();
    await joinRoom("r1");
    connection.send.mockReturnValue(false);
    const field = screen.getByLabelText(STRINGS.message) as HTMLInputElement;

    await user.type(field, "bonjour{Enter}");

    expect(field.value).toBe("bonjour");
  });

  it("keeps one draft per room across tab switches", async () => {
    const user = await setup();
    await enterChat();
    await joinRoom("r1");
    await joinRoom("r2");
    const nav = screen.getByRole("navigation");
    const field = () => screen.getByLabelText(STRINGS.message) as HTMLInputElement;
    await user.type(field(), "pour cinéma");

    await user.click(within(nav).getByRole("button", { name: "# Paris" }));

    expect(field().value).toBe("");

    await user.click(within(nav).getByRole("button", { name: "# Cinéma" }));

    expect(field().value).toBe("pour cinéma");
  });

  it("ignores a blank message", async () => {
    const user = await setup();
    await enterChat();
    await joinRoom("r1");

    await user.type(screen.getByLabelText(STRINGS.message), "   {Enter}");

    expect(connection.send).not.toHaveBeenCalled();
  });

  it("keeps a message over 500 characters in the field and does not send it (BR-020)", async () => {
    const user = await setup();
    await enterChat();
    await joinRoom("r1");
    const field = screen.getByLabelText(STRINGS.message) as HTMLInputElement;
    await user.click(field);

    await user.paste("a".repeat(501));
    await user.keyboard("{Enter}");

    expect(connection.send).not.toHaveBeenCalled();
    expect(field.value).toHaveLength(501);
    expect((screen.getByRole("button", { name: STRINGS.send }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("appends a smiley code from the palette", async () => {
    const user = await setup();
    await enterChat();
    await joinRoom("r1");
    const field = screen.getByLabelText(STRINGS.message) as HTMLInputElement;
    await user.type(field, "hi ");

    await user.click(screen.getByLabelText(":caramel:"));

    expect(field.value).toBe("hi :caramel:");
  });

  it("counts characters, not UTF-16 units", async () => {
    const user = await setup();
    await enterChat();
    await joinRoom("r1");

    await user.type(screen.getByLabelText(STRINGS.message), "a😀");

    expect(screen.getByText("2/500")).toBeTruthy();
  });

  it("starts the counter at zero", async () => {
    await setup();
    await enterChat();

    await joinRoom("r1");

    expect(screen.getByText("0/500")).toBeTruthy();
  });
});

describe("useChat", () => {
  it("throws outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => renderHook(() => useChat())).toThrow("useChat outside ChatProvider");
  });
});

describe("browserConnection", () => {
  class FakeWebSocket {
    static readonly instances: FakeWebSocket[] = [];
    readyState = 0;
    onopen: unknown = null;
    onclose: unknown = null;
    onmessage: unknown = null;
    readonly close = vi.fn();
    readonly send = vi.fn();
    constructor(readonly url: string) {
      FakeWebSocket.instances.push(this);
    }
  }

  beforeEach(() => {
    FakeWebSocket.instances.length = 0;
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  it("builds a ws:// URL on http", () => {
    const built = browserConnection(vi.fn());

    expect(FakeWebSocket.instances[0]?.url).toBe(`ws://${location.host}/ws`);
    built.close();
    expect(FakeWebSocket.instances[0]?.close).toHaveBeenCalled();
  });

  it("builds a wss:// URL on https", () => {
    vi.stubGlobal("location", { protocol: "https:", host: "chat.example" });

    const built = browserConnection(vi.fn());

    expect(FakeWebSocket.instances[0]?.url).toBe("wss://chat.example/ws");
    built.close();
  });
});

describe("account panel", () => {
  const openPanel = async () => {
    const user = await setup();
    await goOnline();
    await enterChat();
    await user.click(screen.getByRole("button", { name: STRINGS.myAccount }));
    return user;
  };
  const panel = () => screen.getByRole("dialog", { name: STRINGS.accountTitle });

  it("is not shown on the entry screen", async () => {
    await setup();
    await fire({ type: "openAccount" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("requests a code with the e-mail and the remember box", async () => {
    const user = await openPanel();

    await user.type(within(panel()).getByLabelText(STRINGS.email), "nath@example.org");
    await user.click(within(panel()).getByRole("button", { name: STRINGS.getCode }));

    expect(connection.send).toHaveBeenCalledWith({ type: "requestCode", payload: { email: "nath@example.org", remember: true } });
  });

  it("keeps digits only and sends the code on the sixth digit", async () => {
    const user = await openPanel();
    await fromServer(msg("codeSent", {}));

    await user.type(within(panel()).getByLabelText(STRINGS.code), "12a3456");

    expect(connection.send).toHaveBeenCalledWith({ type: "verifyCode", payload: { code: "123456" } });
    expect(screen.getByRole("alert").textContent).toContain(STRINGS.notices.codeSent);
  });

  it("shows the tries left and goes back to the e-mail on 'nouveau code'", async () => {
    const user = await openPanel();
    await fromServer(msg("codeSent", {}));
    await fromServer(msg("warning", { code: "codeWrong", message: "codeWrong", triesLeft: 2 }));

    expect(within(panel()).getByText(STRINGS.triesLeft(2))).toBeTruthy();
    await user.click(within(panel()).getByRole("button", { name: STRINGS.newCode }));
    expect(within(panel()).getByLabelText(STRINGS.email)).toBeTruthy();
  });

  it("offers the account actions once linked, and confirms before deleting", async () => {
    const user = await openPanel();
    await fromServer(msg("accountLinked", { accountId: "a1" }));

    await user.click(within(panel()).getByRole("button", { name: STRINGS.signOutEverywhere }));
    expect(connection.send).toHaveBeenCalledWith({ type: "signOutEverywhere", payload: {} });
    await user.click(within(panel()).getByRole("button", { name: STRINGS.signOutDevice }));
    expect(connection.signOutDevice).toHaveBeenCalled();

    await user.click(within(panel()).getByRole("button", { name: STRINGS.deleteAccount }));
    await user.click(within(panel()).getByRole("button", { name: STRINGS.cancel }));
    await user.click(within(panel()).getByRole("button", { name: STRINGS.deleteAccount }));
    await user.click(within(panel()).getByRole("button", { name: STRINGS.confirm }));
    expect(connection.send).toHaveBeenCalledWith({ type: "deleteAccount", payload: {} });
  });

  it("sends the code once, even when 'valider' follows the sixth digit", async () => {
    const user = await openPanel();
    await fromServer(msg("codeSent", {}));

    await user.type(within(panel()).getByLabelText(STRINGS.code), "123456");
    await user.click(within(panel()).getByRole("button", { name: STRINGS.validate }));

    expect(connection.send.mock.calls.filter(([command]) => command.type === "verifyCode")).toHaveLength(1);
  });

  it("waits while the device is saved, and closes on demand", async () => {
    const user = await openPanel();
    await fromServer(msg("accountLinked", { accountId: "a1", deviceClaim: "c" }));
    expect(within(panel()).getByText(STRINGS.savingDevice)).toBeTruthy();

    await user.click(within(panel()).getByRole("button", { name: STRINGS.close }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
