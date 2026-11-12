import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Member, ServerMessage } from "../shared/protocol";
import { App } from "./App";
import { browserConnection, ChatProvider, useChat, type ConnectionFactory } from "./chat-context";
import type { Connection } from "./connection";
import { STATS_MS } from "./screens/EntryScreen";
import { SMILEYS } from "./render";
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

const man = (sessionId: string, pseudo = sessionId): Member => ({ sessionId, pseudo, hasAccount: false, away: false, gender: "man", age: 30 });
const woman = (sessionId: string, pseudo = sessionId): Member => ({ sessionId, pseudo, hasAccount: false, away: false, gender: "woman", age: 25, city: "Lyon" });
const away = (sessionId: string, pseudo = sessionId): Member => ({ sessionId, pseudo, hasAccount: false, away: true });

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

// jsdom has no `showModal` / `close` (`web-ui/04` Accessibility, #63): stub them with the `open` attribute.
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
});
const closeDialog = vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute("open");
});

beforeEach(() => {
  showModal.mockClear();
  closeDialog.mockClear();
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = closeDialog;
  connection = { enter: vi.fn(), signOutDevice: vi.fn(async () => undefined), send: vi.fn(() => 7), forgetCode: vi.fn(), leave: vi.fn(), close: vi.fn() };
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

/** WCAG 2.5.3: every pseudo button's name starts with its visible text (#153). */
const expectLabelInName = () => {
  const buttons = [...document.querySelectorAll("button.pseudo-button")];
  expect(buttons.length).toBeGreaterThan(0);
  for (const button of buttons) expect(button.getAttribute("aria-label")?.startsWith(button.textContent ?? "")).toBe(true);
};
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

  it("disables ENTRER and shows a notice for a city with an invisible character (BR-090)", async () => {
    const user = await setup();
    await goOnline();
    await fill(user);
    await user.click(screen.getByLabelText(STRINGS.city));

    await user.paste("Paris\u200B");

    expect(enterButton().disabled).toBe(true);
    expect(screen.getByText(STRINGS.invisibleChars)).toBeTruthy();
    expect(screen.getByLabelText(STRINGS.city).getAttribute("aria-invalid")).toBe("true");
  });

  it("removes aria-invalid from the city once its invisible character is gone (#121)", async () => {
    const user = await setup();
    await goOnline();
    await fill(user);
    const city = screen.getByLabelText(STRINGS.city);
    await user.click(city);
    await user.paste("Paris\u200B");

    await user.keyboard("{Backspace}");

    expect(city.hasAttribute("aria-invalid")).toBe(false);
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

  it.each(["pseudoTaken", "pseudoInvalid"] as const)("marks the pseudo field invalid on %s and links it to the alert (#154)", async (reason) => {
    const user = await setup();
    await goOnline();
    await fill(user);
    await user.click(enterButton());
    await fire({ type: "entering", pseudo: "ana" });

    await fromServer(msg("entryRefused", { reason }));

    const field = screen.getByLabelText(STRINGS.pseudo);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(field.getAttribute("aria-describedby") ?? "")?.textContent).toBe(STRINGS.entryRefused[reason]);
  });

  it("unmarks the pseudo field once edited, and marks it again on the refused pseudo (#154)", async () => {
    const user = await setup();
    await goOnline();
    await fill(user);
    await user.click(enterButton());
    await fire({ type: "entering", pseudo: "ana" });
    await fromServer(msg("entryRefused", { reason: "pseudoTaken" }));
    const field = screen.getByLabelText(STRINGS.pseudo);

    await user.type(field, "x");

    expect(field.hasAttribute("aria-invalid")).toBe(false);
    expect(field.hasAttribute("aria-describedby")).toBe(false);
    await user.keyboard("{Backspace}");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toBe("entry-error");
  });

  it("marks the pseudo field after a refusal from the members panel (#154)", async () => {
    const user = await setup();
    await goOnline();
    await fill(user);
    await user.type(screen.getByLabelText(STRINGS.email), "ana@example.org");
    await user.click(screen.getByRole("button", { name: STRINGS.getCode }));
    await fire({ type: "entering", pseudo: "ana" });

    await fromServer(msg("entryRefused", { reason: "pseudoTaken" }));

    expect(screen.getByLabelText(STRINGS.pseudo).getAttribute("aria-invalid")).toBe("true");
  });

  it("leaves an edited pseudo unmarked when its sending fails (#154)", async () => {
    const user = await setup();
    await goOnline();
    await fill(user);
    await user.click(enterButton());
    await fire({ type: "entering", pseudo: "ana" });
    await fromServer(msg("entryRefused", { reason: "pseudoTaken" }));
    const field = screen.getByLabelText(STRINGS.pseudo);
    await user.type(field, "x");

    await user.click(enterButton()); // the write fails: no `entering`, the refusal stays on "ana"

    expect(field.hasAttribute("aria-invalid")).toBe(false);
  });

  it("leaves the pseudo field unmarked on a refusal that is not about the pseudo (#154)", async () => {
    const user = await setup();
    await goOnline();
    await fill(user);
    await user.click(enterButton());
    await fire({ type: "entering", pseudo: "ana" });

    await fromServer(msg("entryRefused", { reason: "age" }));

    const field = screen.getByLabelText(STRINGS.pseudo);
    expect(field.hasAttribute("aria-invalid")).toBe(false);
    expect(field.hasAttribute("aria-describedby")).toBe(false);
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

    expect(screen.getByText(STRINGS.moderatorSignIn)).toBeTruthy();
    for (const label of Object.values(STRINGS.legal)) expect(screen.getByRole("button", { name: label })).toBeTruthy();
  });
});

describe("headings (#64)", () => {
  const expectOutline = (titles: string[]) => {
    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1.map((h) => h.textContent)).toEqual(["asv"]);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(titles);
  };

  it("has one h1, the logo, on the entry screen and with a legal page open", async () => {
    const user = await setup();
    expectOutline([STRINGS.guestTitle, STRINGS.membersTitle]);

    await user.click(screen.getByRole("button", { name: STRINGS.legal.rules }));
    expectOutline([STRINGS.guestTitle, STRINGS.membersTitle, STRINGS.legal.rules]);
  });

  it("has one h1 on the rooms screen, its titles at h2", async () => {
    await setup();
    await goOnline();
    await enterChat();
    expectOutline([STRINGS.officialRooms, STRINGS.userRooms, STRINGS.createRoom, STRINGS.searchTitle]);
  });

  it("has one h1 in a room, with the account panel and its privacy page open", async () => {
    const user = await setup();
    await goOnline();
    await enterChat();
    await joinRoom("r1");
    expectOutline(["# Paris", `${STRINGS.members} (1)`]);

    await user.click(screen.getByRole("button", { name: STRINGS.myAccount }));
    await user.click(within(screen.getByRole("dialog", { name: STRINGS.accountTitle })).getByRole("button", { name: STRINGS.legal.privacy }));
    expectOutline(["# Paris", `${STRINGS.members} (1)`, STRINGS.accountTitle, STRINGS.legal.privacy]);
  });
});

describe("legal pages (ADR-0018)", () => {
  it("opens each page from the footer with the owner identity from /api/legal, and closes it", async () => {
    const fetchStub = stubStats({ ownerName: "Owner Name", contactEmail: "contact@example.org" });
    const user = await setup();

    await user.click(screen.getByRole("button", { name: STRINGS.legal.notice }));
    const page = await screen.findByRole("dialog", { name: STRINGS.legal.notice });
    expect(fetchStub).toHaveBeenCalledWith("/api/legal");
    expect(await within(page).findByText(/Directeur de la publication : Owner Name/)).toBeTruthy();
    expect(within(page).getByText(/contact@example.org/)).toBeTruthy();

    await user.click(within(page).getByRole("button", { name: STRINGS.close }));
    expect(screen.queryByRole("dialog", { name: STRINGS.legal.notice })).toBeNull();

    await user.click(screen.getByRole("button", { name: STRINGS.legal.rules }));
    expect(within(screen.getByRole("dialog", { name: STRINGS.legal.rules })).getByText(/18 ans ou plus/)).toBeTruthy();
  });

  it("shows the privacy page with placeholders when /api/legal fails", async () => {
    stubStats({}, false);
    const user = await setup();

    await user.click(screen.getByRole("button", { name: STRINGS.legal.privacy }));

    const page = screen.getByRole("dialog", { name: STRINGS.legal.privacy });
    expect(within(page).getAllByText(/\(à compléter\)/).length).toBeGreaterThan(0);
    expect(within(page).getByRole("table")).toBeTruthy();
  });

  it("shows the privacy page when the request throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const user = await setup();

    await user.click(screen.getByRole("button", { name: STRINGS.legal.privacy }));

    expect(screen.getByRole("dialog", { name: STRINGS.legal.privacy })).toBeTruthy();
  });

  it("opens each page as a modal dialog holding the focus, and gives it back to its link (#59)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const user = await setup();
    const closers = [
      (page: HTMLElement) => user.click(within(page).getByRole("button", { name: STRINGS.close })),
      async (page: HTMLElement) => expect(fireEvent.keyDown(page, { key: "Escape" })).toBe(false),
      async (page: HTMLElement) => expect(fireEvent(page, new Event("cancel", { cancelable: true }))).toBe(false),
    ];

    for (const topic of ["rules", "notice", "privacy"] as const) {
      for (const closeWith of closers) {
        const link = screen.getByRole("button", { name: STRINGS.legal[topic] });
        await user.click(link);
        const page = screen.getByRole("dialog", { name: STRINGS.legal[topic] });
        expect(showModal.mock.contexts.at(-1)).toBe(page);
        expect(document.activeElement).toBe(page);

        await closeWith(page);

        expect(screen.queryByRole("dialog", { name: STRINGS.legal[topic] })).toBeNull();
        expect(closeDialog.mock.contexts.at(-1)).toBe(page);
        expect(document.activeElement).toBe(link);
      }
    }
  });

  it("gives the focus back to a link a click did not focus, as on macOS (#59, #130)", async () => {
    await setup();
    const footer = screen.getByRole("button", { name: STRINGS.legal.notice });
    fireEvent.click(footer);
    fireEvent.keyDown(screen.getByRole("dialog", { name: STRINGS.legal.notice }), { key: "Escape" });
    expect(document.activeElement).toBe(footer);

    await goOnline();
    await enterChat();
    fireEvent.click(screen.getByRole("button", { name: STRINGS.myAccount }));
    const link = within(screen.getByRole("dialog", { name: STRINGS.accountTitle })).getByRole("button", { name: STRINGS.legal.privacy });
    fireEvent.click(link);
    fireEvent.keyDown(screen.getByRole("dialog", { name: STRINGS.legal.privacy }), { key: "Escape" });
    expect(document.activeElement).toBe(link);
  });

  it("ignores keys other than Escape (#59)", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: STRINGS.legal.rules }));
    const page = screen.getByRole("dialog", { name: STRINGS.legal.rules });

    fireEvent.keyDown(page, { key: "Enter" });

    expect(screen.getByRole("dialog", { name: STRINGS.legal.rules })).toBe(page);
  });

  it("keeps each page within the viewport so it scrolls and its fermer stays reachable (#126)", async () => {
    // jsdom computes no layout: check the rule that bounds the page, then that each page uses it.
    const rule = readFileSync("src/web/styles.css", "utf8").match(/^\.legal-page \{[^}]*\}/m)?.[0] ?? "";
    expect(rule).not.toMatch(/[ {;]height:/);
    expect(rule).toContain("max-height: calc(100dvh - 2 * var(--gap));");
    expect(rule).toContain("overflow: auto;");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const user = await setup();

    for (const topic of ["rules", "notice", "privacy"] as const) {
      await user.click(screen.getByRole("button", { name: STRINGS.legal[topic] }));
      const page = screen.getByRole("dialog", { name: STRINGS.legal[topic] });
      expect(page.classList.contains("legal-page")).toBe(true);
      await user.click(within(page).getByRole("button", { name: STRINGS.close }));
      expect(screen.queryByRole("dialog", { name: STRINGS.legal[topic] })).toBeNull();
    }
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
    connection.send.mockReturnValue(undefined);
    const field = screen.getByLabelText(STRINGS.roomName) as HTMLInputElement;

    await user.type(field, "Mon salon{Enter}");

    expect(field.value).toBe("Mon salon");
  });

  describe("refused room name (#151)", () => {
    const create = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
      const field = screen.getByLabelText(STRINGS.roomName) as HTMLInputElement;
      await user.type(field, `${name}{Enter}`);
      return field;
    };

    it("gives the name back when the server refuses that create", async () => {
      const user = await setup();
      await enterChat();
      connection.send.mockReturnValue(4);
      const field = await create(user, "Mon salon");

      await fromServer(msg("warning", { code: "nameInvalid", message: "m", replyTo: 4 }));

      expect(field.value).toBe("Mon salon");
    });

    it("keeps the field empty when the refusal answers another command", async () => {
      const user = await setup();
      await enterChat();
      connection.send.mockReturnValue(4);
      const field = await create(user, "Mon salon");

      await fromServer(msg("error", { code: "invalid", message: "m", replyTo: 3 }));

      expect(field.value).toBe("");
    });

    it("never overwrites a name typed since", async () => {
      const user = await setup();
      await enterChat();
      connection.send.mockReturnValue(4);
      const field = await create(user, "Mon salon");
      await user.type(field, "Autre");

      await fromServer(msg("warning", { code: "nameInvalid", message: "m", replyTo: 4 }));

      expect(field.value).toBe("Autre");
    });
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

  it("gives each tab close button a 24 px target, 44 px on touch (#105)", async () => {
    // jsdom computes no layout: check the rule, then that each close button uses it.
    const css = readFileSync("src/web/styles.css", "utf8");
    expect(css.match(/^\.icon-button \{[^}]*\}/m)?.[0]).toContain("min-width: 24px; min-height: 24px;");
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*\.icon-button \{ min-width: 44px; min-height: 44px; \}\s*\/\*[^*]*\*\/\s*\.tab \.link \{ min-height: 44px; \}/);
    // Same specificity: the touch block must come after the base rule to win.
    expect(css.indexOf("@media (pointer: coarse) {\n  .icon-button")).toBeGreaterThan(css.indexOf(".icon-button {"));
    await setup();
    await enterChat();
    await joinRoom("r1");
    await joinRoom("r2");

    for (const name of ["Paris", "Cinéma"]) {
      expect(screen.getByRole("button", { name: STRINGS.closeTab(name) }).classList).toContain("icon-button");
    }
  });

  it("gives every bevelled button the 44 px touch floor (#170, #176)", async () => {
    // jsdom computes no layout: check the rule sits in the #105 touch block, then that the buttons carry the class.
    const css = readFileSync("src/web/styles.css", "utf8");
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*\.icon-button \{[^}]*\}\s*\/\*[^*]*\*\/\s*\.tab \.link \{ min-height: 44px; \}\s*(?:\/\*[^*]*\*\/\s*)?\.bevel \{ min-height: 44px; \}\s*\}/);
    // Same specificity: the touch block must come after the base rule to win.
    const base = css.search(/^\.bevel \{/m);
    expect(base).toBeGreaterThanOrEqual(0);
    expect(css.indexOf("  .bevel { min-height: 44px; }")).toBeGreaterThan(base);
    // Base rule and touch rule only: no later or more specific .bevel rule may change the height.
    expect(css.match(/\.bevel[^{}]*\{[^}]*\b(?:min|max)-height/g)).toHaveLength(2);
    // The #170 per-button rule is gone: one class rule covers every bevelled button.
    expect(css).not.toContain(".header-end button {");
    await setup();
    await enterChat();
    await joinRoom("r1");

    for (const name of [STRINGS.myAccount, STRINGS.quit, STRINGS.backToRooms, STRINGS.search, STRINGS.send]) {
      expect(screen.getByRole("button", { name }).classList).toContain("bevel");
    }
    // Every other button on the room screen is a `.link` (glyph, pseudo and menu links have their own floors).
    expect(document.querySelectorAll("button:not(.link):not(.bevel)")).toHaveLength(0);
  });

  it("gives the smileys toggle and the member pseudo buttons a 24 px target, 44 px on touch, and the menu items 44 px on touch (#142, #168)", async () => {
    // jsdom computes no layout: check the rules, then that the controls carry the selectors.
    const css = readFileSync("src/web/styles.css", "utf8");
    expect(css.match(/^\.smileys summary \{[^}]*\}/m)?.[0]).toContain("line-height: 24px;");
    expect(css.match(/^\.pseudo-button \{[^}]*\}/m)?.[0]).toContain("min-height: 24px;");
    const touch = /@media \(pointer: coarse\) \{\s*\.smileys summary \{ line-height: 44px; \}\s*\.pseudo-button \{ min-height: 44px; \}\s*(?:\/\*[^*]*\*\/\s*)?\.menu \.link \{ min-height: 44px; \}\s*(?:\/\*[^*]*\*\/\s*)?\.overlay \.link \{ min-height: 44px; \}\s*\}/;
    expect(css).toMatch(touch);
    // Same specificity: the touch block must come after both base rules to win.
    const touchAt = css.search(touch);
    expect(touchAt).toBeGreaterThan(css.search(/^\.smileys summary \{/m));
    expect(touchAt).toBeGreaterThan(css.search(/^\.pseudo-button \{/m));
    await setup();
    await enterChat();
    await joinRoom("r1");

    expect(screen.getByText(STRINGS.smileys).matches(".smileys summary")).toBe(true);
    expect(document.querySelectorAll(".members button.pseudo-button").length).toBeGreaterThan(0);
  });

  it("gives the pseudo menu items the 44 px touch floor (#168)", async () => {
    // jsdom computes no layout: the touch rule is checked with the #142 block above; here, the items match it.
    await setup();
    await enterChat();
    await joinRoom("r1");
    const pseudo = document.querySelector(".members button.pseudo-button");
    if (!(pseudo instanceof HTMLButtonElement)) throw new Error("no member pseudo button");
    await userEvent.click(pseudo);

    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(2);
    for (const item of items) expect(item.matches(".menu .link")).toBe(true);
  });

  it("lets the header end wrap and the pseudo break, so a long pseudo never widens the page (#143)", async () => {
    // jsdom computes no layout: check the rules, then that the pseudo matches the selector.
    const css = readFileSync("src/web/styles.css", "utf8");
    // One top-level rule each, so no later rule can undo the fix unnoticed.
    expect(css.match(/^\.header-end \{/gm)).toHaveLength(1);
    expect(css.match(/^\.header-end strong \{/gm)).toHaveLength(1);
    const end = css.match(/^\.header-end \{[^}]*\}/m)?.[0] ?? "";
    expect(end).toContain("flex-wrap: wrap;");
    expect(end).toContain("min-width: 0;");
    const pseudo = css.match(/^\.header-end strong \{[^}]*\}/m)?.[0] ?? "";
    expect(pseudo).toContain("min-width: 0;");
    expect(pseudo).toContain("overflow-wrap: anywhere;");
    await setup();
    await enterChat();

    expect(document.querySelector(".header-end strong")?.textContent).toBe("ana");
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
    connection.send.mockReturnValue(undefined);

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
    expect(screen.getByRole("button", { name: "bob (absent), actions" })).toBeTruthy();
    // axe 4.12 drops a space that opens an element's text, so it stays a text node (#153).
    const mark = pseudo.querySelector(".away-mark");
    expect(mark?.textContent).toBe(STRINGS.away);
    expect(mark?.previousSibling?.textContent).toBe(" ");
    expectLabelInName();
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

  // jsdom has no layout: give the lines panel a fixed box so its scroll position can be checked.
  const scrollBox = (scrollTop: number) => {
    const panel = screen.getByRole("log").parentElement as HTMLElement;
    Object.defineProperty(panel, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(panel, "clientHeight", { configurable: true, value: 200 });
    panel.scrollTop = scrollTop;
    fireEvent.scroll(panel);
    return panel;
  };

  it("follows a new line while the reader is at the bottom of the lines", async () => {
    await setup();
    await enterChat();
    await joinRoom("r1");
    const panel = scrollBox(800);

    await fromServer(message("r1", "salut"));

    expect(panel.scrollTop).toBe(1000);
  });

  it("keeps the scroll position while the reader reads older lines", async () => {
    await setup();
    await enterChat();
    await joinRoom("r1");
    const panel = scrollBox(100);

    await fromServer(message("r1", "salut"));

    expect(panel.scrollTop).toBe(100);
  });

  it("keeps the bottom in view when the lines panel shrinks", async () => {
    let resized = () => {};
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resized = callback; }
      observe() {}
      disconnect() {}
    });
    await setup();
    await enterChat();
    await joinRoom("r1");
    const panel = scrollBox(800);
    Object.defineProperty(panel, "scrollHeight", { configurable: true, value: 1300 });

    act(() => resized());

    expect(panel.scrollTop).toBe(1300);
  });

  it("brings the lines back to the bottom when the reader posts", async () => {
    const user = await setup();
    await enterChat();
    await joinRoom("r1");
    const panel = scrollBox(100);
    await user.type(screen.getByLabelText(STRINGS.message), "coucou{Enter}");

    await fromServer(message("r1", "coucou", "ana"));

    expect(panel.scrollTop).toBe(1000);
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
    connection.send.mockReturnValue(undefined);
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
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toBe("message-count");
    expect(document.getElementById("message-count")?.textContent).toBe("501/500");
  });

  it("keeps a message with a bidi override in the field and does not send it (BR-090)", async () => {
    const user = await setup();
    await enterChat();
    await joinRoom("r1");
    const field = screen.getByLabelText(STRINGS.message) as HTMLInputElement;
    await user.click(field);

    await user.paste("gpj.\u202Eexe");
    await user.keyboard("{Enter}");

    expect(connection.send).not.toHaveBeenCalled();
    expect(field.value).toBe("gpj.\u202Eexe");
    expect((screen.getByRole("button", { name: STRINGS.send }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(STRINGS.invisibleChars)).toBeTruthy();
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(field.getAttribute("aria-describedby") ?? "")?.textContent).toBe(STRINGS.invisibleChars);
  });

  it("names both refusals, then clears the field's error state once the text is fixed (#121)", async () => {
    const user = await setup();
    await enterChat();
    await joinRoom("r1");
    const field = screen.getByLabelText(STRINGS.message) as HTMLInputElement;
    await user.click(field);
    await user.paste("\u202E" + "a".repeat(500));

    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toBe("message-count message-invisible");
    expect(document.getElementById("message-count")).not.toBeNull();
    expect(document.getElementById("message-invisible")).not.toBeNull();

    await user.clear(field);
    await user.type(field, "salut");

    expect(field.hasAttribute("aria-invalid")).toBe(false);
    expect(field.hasAttribute("aria-describedby")).toBe(false);
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

  it("gives each smiley button the 24 px target class (#105)", async () => {
    await setup();
    await enterChat();
    await joinRoom("r1");

    const buttons = within(screen.getByText(STRINGS.smileys).closest("details") as HTMLElement).getAllByRole("button", { hidden: true });

    expect(buttons).toHaveLength(Object.keys(SMILEYS).length);
    for (const button of buttons) {
      expect(button.classList).toContain("icon-button");
    }
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

  it("opens as a modal dialog (#63)", async () => {
    await openPanel();

    expect(showModal).toHaveBeenCalledTimes(1);
    expect(showModal.mock.contexts[0]).toBe(panel());
  });

  it("closes on Escape and gives the focus back to the opener (#63)", async () => {
    const user = await openPanel();
    const opener = screen.getByRole("button", { name: STRINGS.myAccount });

    fireEvent(panel(), new Event("cancel", { cancelable: true }));

    expect(screen.queryByRole("dialog", { name: STRINGS.accountTitle })).toBeNull();
    expect(closeDialog).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    await user.click(opener);
    expect(panel()).toBeTruthy();
  });

  it("closes only the privacy page on Escape, then the panel on a second Escape (#63, #59)", async () => {
    const user = await openPanel();
    const link = within(panel()).getByRole("button", { name: STRINGS.legal.privacy });
    await user.click(link);
    const page = screen.getByRole("dialog", { name: STRINGS.legal.privacy });
    expect(showModal.mock.contexts.at(-1)).toBe(page);

    expect(fireEvent.keyDown(page, { key: "Escape" })).toBe(false);

    expect(screen.queryByRole("dialog", { name: STRINGS.legal.privacy })).toBeNull();
    expect(panel()).toBeTruthy();
    expect(document.activeElement).toBe(link);

    fireEvent.keyDown(link, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: STRINGS.accountTitle })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: STRINGS.myAccount }));
  });

  it("closes only the privacy page on a cancel request (#59)", async () => {
    const user = await openPanel();
    const link = within(panel()).getByRole("button", { name: STRINGS.legal.privacy });
    await user.click(link);

    expect(fireEvent(screen.getByRole("dialog", { name: STRINGS.legal.privacy }), new Event("cancel", { cancelable: true }))).toBe(false);

    expect(screen.queryByRole("dialog", { name: STRINGS.legal.privacy })).toBeNull();
    expect(panel()).toBeTruthy();
    expect(document.activeElement).toBe(link);
  });

  it("closes on \"fermer\" and gives the focus back to the opener (#63)", async () => {
    const user = await openPanel();

    await user.click(within(panel()).getByRole("button", { name: STRINGS.close }));

    expect(screen.queryByRole("dialog", { name: STRINGS.accountTitle })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: STRINGS.myAccount }));
  });

  it("closes without stealing the focus when its opener left the page (#63)", async () => {
    await openPanel();

    await fromServer(msg("resumeRefused", {}));

    expect(screen.queryByRole("dialog", { name: STRINGS.accountTitle })).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("is not shown on the entry screen", async () => {
    await setup();
    await fire({ type: "openAccount" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the GDPR notice and opens the privacy page before the code request", async () => {
    stubStats({});
    const user = await openPanel();

    expect(within(panel()).getByText(new RegExp(STRINGS.emailKept.slice(0, 30)))).toBeTruthy();
    await user.click(within(panel()).getByRole("button", { name: STRINGS.legal.privacy }));

    expect(screen.getByRole("dialog", { name: STRINGS.legal.privacy })).toBeTruthy();
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

  it("shows the notice inside the modal dialog, not in the inert page (#63)", async () => {
    await openPanel();
    await fromServer(msg("codeSent", {}));

    expect(within(panel()).getByRole("alert").textContent).toContain(STRINGS.notices.codeSent);
    expect(screen.getAllByRole("alert").every((alert) => panel().contains(alert))).toBe(true);
  });

  it("shows the tries left and goes back to the e-mail on 'nouveau code'", async () => {
    const user = await openPanel();
    await fromServer(msg("codeSent", {}));
    expect(document.activeElement).toBe(within(panel()).getByLabelText(STRINGS.code));
    await fromServer(msg("warning", { code: "codeWrong", message: "codeWrong", triesLeft: 2 }));

    expect(within(panel()).getByText(STRINGS.triesLeft(2))).toBeTruthy();
    await user.click(within(panel()).getByRole("button", { name: STRINGS.newCode }));
    expect(within(panel()).getByLabelText(STRINGS.email)).toBeTruthy();
    expect(connection.forgetCode).toHaveBeenCalled();
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

describe("pseudo menu, private windows and search (web-ui/07)", () => {
  const signedIn = async () => {
    await goOnline();
    await fire({ type: "entering", pseudo: "ana" });
    await fromServer(msg("entered", { sessionId: "me", resumeToken: "t", roomList: rooms, isModerator: false, accountId: "a1" }));
  };
  const member = (hasAccount: boolean): Member => ({ ...man("s2", "bob"), hasAccount });
  const openMenu = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: STRINGS.pseudoButton("bob") }));
  const sent = () => connection.send.mock.calls.map(([command]) => command);

  it("keeps a private draft with a zero-width space and does not send it (BR-090)", async () => {
    const user = await setup();
    await signedIn();
    await joinRoom("r1", [member(true)]);
    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: STRINGS.privateMessage }));
    const dialog = screen.getByRole("dialog", { name: STRINGS.privateWith("bob") });
    const field = within(dialog).getByLabelText(STRINGS.message) as HTMLInputElement;

    await user.paste("a\u200Bb");
    await user.keyboard("{Enter}");

    expect(sent().some((command) => command.type === "sendPrivate")).toBe(false);
    expect(field.value).toBe("a\u200Bb");
    expect(within(dialog).getByText(STRINGS.invisibleChars)).toBeTruthy();
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(field.getAttribute("aria-describedby") ?? "")?.textContent).toBe(STRINGS.invisibleChars);

    await user.clear(field);
    await user.paste("a".repeat(501));

    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(field.getAttribute("aria-describedby") ?? "")?.textContent).toBe("501/500");

    await user.clear(field);
    await user.type(field, "ab");

    expect(field.hasAttribute("aria-invalid")).toBe(false);
    expect(field.hasAttribute("aria-describedby")).toBe(false);
  });

  it("opens a pending window from the pseudo menu, then sends from it", async () => {
    const user = await setup();
    await signedIn();
    await joinRoom("r1", [member(true)]);

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: STRINGS.privateMessage }));
    const dialog = screen.getByRole("dialog", { name: STRINGS.privateWith("bob") });
    await user.type(within(dialog).getByLabelText(STRINGS.message), "salut{Enter}");

    expect(sent()).toContainEqual({ type: "sendPrivate", payload: { targetPseudo: "bob", text: "salut" } });
    expect(within(dialog).getByLabelText(STRINGS.message)).toHaveProperty("value", "");
  });

  describe("refused private message (#151)", () => {
    const openAndSend = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
      await openMenu(user);
      await user.click(screen.getByRole("menuitem", { name: STRINGS.privateMessage }));
      const dialog = screen.getByRole("dialog", { name: STRINGS.privateWith("bob") });
      const field = within(dialog).getByLabelText(STRINGS.message) as HTMLInputElement;
      await user.type(field, `${text}{Enter}`);
      return { dialog, field };
    };

    it("keeps the Opening window and gives the draft back on tooManyWindows", async () => {
      const user = await setup();
      await signedIn();
      await joinRoom("r1", [member(true)]);
      connection.send.mockReturnValue(9);
      const { field } = await openAndSend(user, "salut");
      expect(field.value).toBe("");

      await fromServer(msg("warning", { code: "tooManyWindows", message: "m", replyTo: 9 }));

      expect(screen.getByRole("dialog", { name: STRINGS.privateWith("bob") })).toBeTruthy();
      expect(field.value).toBe("salut");
    });

    it("gives the text back to the window that sent the refused seq only", async () => {
      const user = await setup();
      await signedIn();
      await joinRoom("r1", [member(true), { ...man("s3", "cid"), hasAccount: true }]);
      connection.send.mockReturnValueOnce(9).mockReturnValueOnce(10);
      const bob = await openAndSend(user, "salut");
      await user.click(screen.getByRole("button", { name: STRINGS.pseudoButton("cid") }));
      await user.click(screen.getByRole("menuitem", { name: STRINGS.privateMessage }));
      const cid = within(screen.getByRole("dialog", { name: STRINGS.privateWith("cid") })).getByLabelText(STRINGS.message) as HTMLInputElement;
      await user.type(cid, "coucou{Enter}");

      await fromServer(msg("warning", { code: "tooManyWindows", message: "m", replyTo: 10 }));
      await fromServer(msg("error", { code: "invalid", message: "m" }));

      expect(cid.value).toBe("coucou");
      expect(bob.field.value).toBe("");
    });

    it("keeps the private draft when it could not be sent", async () => {
      const user = await setup();
      await signedIn();
      await joinRoom("r1", [member(true)]);
      connection.send.mockReturnValue(undefined);

      const { field } = await openAndSend(user, "salut");

      expect(field.value).toBe("salut");
    });

    it("gives the text back for seq 0", async () => {
      const user = await setup();
      await signedIn();
      await joinRoom("r1", [member(true)]);
      connection.send.mockReturnValue(0);
      const { field } = await openAndSend(user, "salut");
      expect(field.value).toBe("");

      await fromServer(msg("warning", { code: "tooManyWindows", message: "m", replyTo: 0 }));

      expect(field.value).toBe("salut");
    });

    it("never overwrites a draft typed since", async () => {
      const user = await setup();
      await signedIn();
      await joinRoom("r1", [member(true)]);
      connection.send.mockReturnValue(9);
      const { field } = await openAndSend(user, "salut");
      await user.type(field, "encore");

      await fromServer(msg("error", { code: "invalid", message: "m", replyTo: 9 }));

      expect(field.value).toBe("encore");
    });
  });

  it("closes the menu with Escape and does not show it on my own pseudo", async () => {
    const user = await setup();
    await signedIn();
    await joinRoom("r1", [member(true), man("me", "ana")]);

    await openMenu(user);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("button", { name: STRINGS.pseudoButton("ana") })).toBeNull();
  });

  it("greys message privé for a chatter without account, and opens the account panel when I have none", async () => {
    const user = await setup();
    await goOnline();
    await enterChat();
    await joinRoom("r1", [member(false)]);

    await openMenu(user);
    expect(screen.getByRole("menuitem", { name: STRINGS.privateMessage })).toHaveProperty("disabled", true);
    await user.keyboard("{Escape}");

    await fromServer(msg("roomJoined", { roomId: "r1", members: [member(true)] }));
    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: STRINGS.privateMessage }));
    expect(screen.queryByRole("dialog", { name: STRINGS.privateWith("bob") })).toBeNull();
    expect(screen.getByRole("heading", { name: STRINGS.accountTitle })).toBeTruthy();
    await user.click(within(screen.getByRole("dialog", { name: STRINGS.accountTitle })).getByRole("button", { name: STRINGS.close }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: STRINGS.pseudoButton("bob") }));
  });

  it("ignores and unignores from the menu, and hides the ignored chatter's lines", async () => {
    const user = await setup();
    await signedIn();
    await joinRoom("r1", [member(true)]);
    await fromServer(msg("roomMessage", { roomId: "r1", authorSessionId: "s2", pseudo: "bob", gender: "man", text: "spam", sentAt: "2026-10-24T10:00:00.000Z" }));

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: STRINGS.ignore }));
    expect(sent()).toContainEqual({ type: "ignore", payload: { targetSessionId: "s2" } });
    await fromServer(msg("ignoreUpdated", { ignored: ["s2"] }));

    expect(screen.queryByText("spam")).toBeNull();
    expect(screen.getByText(STRINGS.ignoredMark)).toBeTruthy();
    expect(screen.getByText(STRINGS.ignoredMark).previousSibling?.textContent).toBe(" ");
    expectLabelInName();
    await user.click(screen.getByRole("button", { name: "bob (ignoré), actions" }));
    await user.click(screen.getByRole("menuitem", { name: STRINGS.unignore }));
    expect(sent()).toContainEqual({ type: "unignore", payload: { targetSessionId: "s2" } });
  });

  it("gives the private window minimise and close buttons a 24 px target (#105)", async () => {
    await setup();
    await signedIn();
    await fromServer(msg("privateWindow", { conversationId: "c1", other: { sessionId: "s2", pseudo: "bob", hasAccount: true, away: false, gender: "man" } }));

    const dialog = within(screen.getByRole("dialog"));
    for (const name of [STRINGS.minimise, STRINGS.close]) {
      expect(dialog.getByRole("button", { name }).classList).toContain("icon-button");
    }
  });

  it("shows incoming messages, minimises with an unread count and closes with closePrivate", async () => {
    const user = await setup();
    await signedIn();
    await fromServer(msg("privateWindow", { conversationId: "c1", other: { sessionId: "s2", pseudo: "bob", hasAccount: true, away: false, gender: "man" } }));
    await fromServer(msg("privateMessage", { conversationId: "c1", authorSessionId: "s2", text: "coucou", sentAt: "2026-10-24T10:00:00.000Z" }));
    expect(within(screen.getByRole("dialog")).getByText(/coucou/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: STRINGS.minimise }));
    await fromServer(msg("privateMessage", { conversationId: "c1", authorSessionId: "s2", text: "re", sentAt: "2026-10-24T10:00:01.000Z" }));
    expect(screen.getByText(STRINGS.unread(1))).toBeTruthy();
    await user.click(screen.getByRole("button", { name: new RegExp(STRINGS.restore("bob")) }));

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: STRINGS.close }));
    expect(sent()).toContainEqual({ type: "closePrivate", payload: { conversationId: "c1" } });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hides the private lines of a chatter ignored since", async () => {
    await setup();
    await signedIn();
    await fromServer(msg("privateWindow", { conversationId: "c1", other: { sessionId: "s2", pseudo: "bob", hasAccount: true, away: false, gender: "man" } }));
    await fromServer(msg("privateMessage", { conversationId: "c1", authorSessionId: "s2", text: "coucou", sentAt: "2026-10-24T10:00:00.000Z" }));

    await fromServer(msg("ignoreUpdated", { ignored: ["s2"] }));

    expect(within(screen.getByRole("dialog")).queryByText(/coucou/)).toBeNull();
  });

  it("keeps an established window open when closePrivate cannot be sent", async () => {
    const user = await setup();
    await signedIn();
    await fromServer(msg("privateWindow", { conversationId: "c1", other: { sessionId: "s2", pseudo: "bob", hasAccount: true, away: false, gender: "man" } }));
    connection.send.mockReturnValue(undefined);

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: STRINGS.close }));

    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("disables the composer once the partner left, and closes without telling the server", async () => {
    const user = await setup();
    await signedIn();
    await fromServer(msg("privateWindow", { conversationId: "c1", other: { sessionId: "s2", pseudo: "bob", hasAccount: true, away: false, gender: "man" } }));

    await fromServer(msg("memberLeft", { sessionId: "s2", pseudo: "bob" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(STRINGS.otherGone)).toBeTruthy();
    expect(within(dialog).getByLabelText(STRINGS.message)).toHaveProperty("disabled", true);
    expect(within(dialog).getByRole("button", { name: "bob (absent), actions" })).toBeTruthy();
    expectLabelInName();
    await user.click(within(dialog).getByRole("button", { name: STRINGS.close }));
    expect(sent().filter((command) => command.type === "closePrivate")).toEqual([]);
  });

  describe("focus after close or minimise (#131)", () => {
    const open = (conversationId: string, sessionId: string, pseudo: string) =>
      fromServer(msg("privateWindow", { conversationId, other: { sessionId, pseudo, hasAccount: true, away: false, gender: "man" } }));
    const closeOf = (pseudo: string) =>
      within(screen.getByRole("dialog", { name: STRINGS.privateWith(pseudo) })).getByRole("button", { name: STRINGS.close });
    const titleOf = (pseudo: string) =>
      within(screen.getByRole("dialog", { name: STRINGS.privateWith(pseudo) })).getByRole("button", { name: STRINGS.pseudoButton(pseudo) });
    const threeWindows = async () => {
      await open("c1", "s2", "bob");
      await open("c2", "s3", "cid");
      await open("c3", "s4", "dan");
    };

    it("moves the focus to the next window's title when one in the middle closes", async () => {
      const user = await setup();
      await signedIn();
      await threeWindows();

      await user.click(closeOf("cid"));

      expect(document.activeElement).toBe(titleOf("dan"));
    });

    it("moves the focus to the previous window when the last one closes, from the keyboard", async () => {
      const user = await setup();
      await signedIn();
      await threeWindows();

      closeOf("dan").focus();
      await user.keyboard("{Enter}");

      expect(document.activeElement).toBe(titleOf("cid"));
    });

    it("moves the focus to the second window when the first one closes", async () => {
      const user = await setup();
      await signedIn();
      await threeWindows();

      await user.click(closeOf("bob"));

      expect(document.activeElement).toBe(titleOf("cid"));
    });

    it("moves the focus to a minimised previous window's tab", async () => {
      const user = await setup();
      await signedIn();
      await open("c1", "s2", "bob");
      await open("c2", "s3", "cid");
      await user.click(within(screen.getByRole("dialog", { name: STRINGS.privateWith("bob") })).getByRole("button", { name: STRINGS.minimise }));

      await user.click(closeOf("cid"));

      expect(document.activeElement).toBe(screen.getByRole("button", { name: new RegExp(STRINGS.restore("bob")) }));
    });

    it("moves the focus on when a gone partner's window closes, with nothing sent", async () => {
      const user = await setup();
      await signedIn();
      await open("c1", "s2", "bob");
      await open("c2", "s3", "cid");
      await fromServer(msg("memberLeft", { sessionId: "s2", pseudo: "bob" }));

      await user.click(closeOf("bob"));

      expect(sent().filter((command) => command.type === "closePrivate")).toEqual([]);
      expect(document.activeElement).toBe(titleOf("cid"));
    });

    it("moves the focus to a minimised next window's tab", async () => {
      const user = await setup();
      await signedIn();
      await open("c1", "s2", "bob");
      await open("c2", "s3", "cid");
      await user.click(within(screen.getByRole("dialog", { name: STRINGS.privateWith("cid") })).getByRole("button", { name: STRINGS.minimise }));

      await user.click(closeOf("bob"));

      expect(document.activeElement).toBe(screen.getByRole("button", { name: new RegExp(STRINGS.restore("cid")) }));
    });

    it("moves the focus to the room message field when the only window closes", async () => {
      const user = await setup();
      await signedIn();
      await joinRoom("r1", [member(true)]);
      await open("c1", "s2", "bob");

      await user.click(closeOf("bob"));

      expect(document.activeElement).toBe(screen.getByLabelText(STRINGS.message));
    });

    it("leaves the focus on the document with no window and no room screen", async () => {
      const user = await setup();
      await signedIn();
      await open("c1", "s2", "bob");

      await user.click(closeOf("bob"));

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(document.body);
    });

    it("keeps the window and the focus when the close cannot be sent", async () => {
      const user = await setup();
      await signedIn();
      await open("c1", "s2", "bob");
      await open("c2", "s3", "cid");
      connection.send.mockReturnValue(undefined);

      await user.click(closeOf("bob"));
      // Any later render (here a message for cid) must not apply a stale refocus.
      await fromServer(msg("privateMessage", { conversationId: "c2", authorSessionId: "s3", text: "re", sentAt: "2026-10-24T10:00:00.000Z" }));

      expect(screen.getByRole("dialog", { name: STRINGS.privateWith("bob") })).toBeTruthy();
      expect(document.activeElement).toBe(closeOf("bob"));
    });

    it("moves the focus to the new tab when a window is minimised", async () => {
      const user = await setup();
      await signedIn();
      await open("c1", "s2", "bob");

      await user.click(screen.getByRole("button", { name: STRINGS.minimise }));

      expect(document.activeElement).toBe(screen.getByRole("button", { name: new RegExp(STRINGS.restore("bob")) }));
    });
  });

  it("searches from 2 characters and lists the results with their rooms", async () => {
    const user = await setup();
    await signedIn();
    const field = screen.getByLabelText(STRINGS.searchLabel);

    await user.type(field, "b{Enter}");
    expect(screen.getByText(STRINGS.searchShort)).toBeTruthy();
    await user.type(field, "o{Enter}");
    expect(sent()).toContainEqual({ type: "search", payload: { query: "bo" } });

    await fromServer(msg("searchResults", { results: [{ sessionId: "s2", pseudo: "bob", hasAccount: true, away: false, gender: "man", age: 30, city: "Lyon", rooms: ["r1"] }] }));
    expect(screen.getByRole("button", { name: STRINGS.pseudoButton("bob") })).toBeTruthy();
    expect(screen.getByText(`— ${STRINGS.inRooms("Paris")}`)).toBeTruthy();

    await fromServer(msg("searchResults", { results: [] }));
    expect(screen.getByText(STRINGS.noResult)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: STRINGS.cancel }));
    expect(screen.queryByText(STRINGS.noResult)).toBeNull();
  });

  const openSearch = async (enter: () => Promise<void> = signedIn) => {
    const user = await setup();
    await enter();
    await joinRoom("r1");
    const opener = screen.getByRole("button", { name: STRINGS.search });
    await user.click(opener);
    return { user, opener, dialog: () => screen.getByRole("dialog", { name: STRINGS.searchTitle }) };
  };
  const searchClosed = () => screen.queryByRole("dialog", { name: STRINGS.searchTitle }) === null;

  it("opens the search of a room as a modal dialog (#111)", async () => {
    const { dialog } = await openSearch();

    expect(showModal.mock.contexts.at(-1)).toBe(dialog());
    expect(within(dialog()).getByLabelText(STRINGS.searchLabel)).toBeTruthy();
  });

  it("closes the search dialog with its button and gives the focus back (#111)", async () => {
    const { user, opener, dialog } = await openSearch();

    await user.click(within(dialog()).getByRole("button", { name: STRINGS.close }));

    expect(searchClosed()).toBe(true);
    expect(closeDialog).toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
  });

  it("gives the focus back to \"rechercher\" when the click did not focus it (#111, #130)", async () => {
    await setup();
    await signedIn();
    await joinRoom("r1");
    const opener = screen.getByRole("button", { name: STRINGS.search });

    fireEvent.click(opener);
    fireEvent.keyDown(screen.getByRole("dialog", { name: STRINGS.searchTitle }), { key: "Escape" });

    expect(document.activeElement).toBe(opener);
  });

  it("raises the dialogs on a short screen and draws one frame around the search (#111)", () => {
    // jsdom computes no layout: check the rules, after the base `.overlay` rule so they win.
    const css = readFileSync("src/web/styles.css", "utf8");
    const short = /^@media \(max-height: 500px\) \{ \.overlay \{ top: var\(--gap\); max-height: calc\(100dvh - 2 \* var\(--gap\)\); \} \}/m;

    expect(css).toMatch(short);
    expect(css.search(short)).toBeGreaterThan(css.search(/^\.overlay \{/m));
    expect(css.match(/^\.overlay > \.search \{[^}]*\}/m)?.[0]).toContain("border: 0;");
  });

  it("closes only the pseudo menu on Escape inside the search dialog (#111)", async () => {
    const { user, dialog } = await openSearch();
    await user.type(within(dialog()).getByLabelText(STRINGS.searchLabel), "zo{Enter}");
    await fromServer(msg("searchResults", { results: [{ sessionId: "s3", pseudo: "zoe", hasAccount: true, away: false, gender: "woman", age: 30, city: "Lyon", rooms: [] }] }));
    const pseudo = within(dialog()).getByRole("button", { name: STRINGS.pseudoButton("zoe") });
    await user.click(pseudo);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(searchClosed()).toBe(false);
    expect(document.activeElement).toBe(pseudo);
  });

  it.each([["Escape", (dialog: HTMLElement) => fireEvent.keyDown(dialog, { key: "Escape" })], ["a close request", (dialog: HTMLElement) => fireEvent(dialog, new Event("cancel", { cancelable: true }))]])(
    "closes the open menu first, then the search dialog, on %s with the focus on the pseudo (#111)",
    async (_name, press) => {
      const { user, dialog } = await openSearch();
      await user.type(within(dialog()).getByLabelText(STRINGS.searchLabel), "zo{Enter}");
      await fromServer(msg("searchResults", { results: [{ sessionId: "s3", pseudo: "zoe", hasAccount: false, away: false, gender: "woman", age: 30, city: "Lyon", rooms: [] }] }));
      await user.click(within(dialog()).getByRole("button", { name: STRINGS.pseudoButton("zoe") }));

      press(dialog());

      expect(screen.queryByRole("menu")).toBeNull();
      expect(searchClosed()).toBe(false);
      expect(document.activeElement).toBe(within(dialog()).getByRole("button", { name: STRINGS.pseudoButton("zoe") }));
      press(dialog());
      expect(searchClosed()).toBe(true);
    },
  );

  it("opens the account dialog over the search dialog when \"message privé\" needs an account (#111)", async () => {
    const { user, dialog } = await openSearch(async () => { await enterChat(); });
    await user.type(within(dialog()).getByLabelText(STRINGS.searchLabel), "zo{Enter}");
    await fromServer(msg("searchResults", { results: [{ sessionId: "s3", pseudo: "zoe", hasAccount: true, away: false, gender: "woman", age: 30, city: "Lyon", rooms: [] }] }));
    const pseudo = within(dialog()).getByRole("button", { name: STRINGS.pseudoButton("zoe") });
    await user.click(pseudo);

    await user.click(screen.getByRole("menuitem", { name: STRINGS.privateMessage }));
    const account = screen.getByRole("dialog", { name: STRINGS.accountTitle });
    fireEvent.keyDown(account, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: STRINGS.accountTitle })).toBeNull();
    expect(searchClosed()).toBe(false);
    expect(document.activeElement).toBe(pseudo);
  });

  it("shows a notice raised meanwhile inside the search dialog (#111)", async () => {
    const { dialog } = await openSearch();

    await fromServer(msg("error", { code: "invalid", message: "m" }));

    expect(within(dialog()).getByRole("alert")).toBeTruthy();
  });

  it("closes the search dialog on Escape and on a close request (#111)", async () => {
    const { user, opener, dialog } = await openSearch();

    expect(fireEvent.keyDown(dialog(), { key: "Escape" })).toBe(false);
    expect(searchClosed()).toBe(true);

    await user.click(opener);
    expect(fireEvent(dialog(), new Event("cancel", { cancelable: true }))).toBe(false);
    expect(searchClosed()).toBe(true);
  });

  it("keeps the search dialog open on other keys (#111)", async () => {
    const { dialog } = await openSearch();

    expect(fireEvent.keyDown(dialog(), { key: "Enter" })).toBe(true);

    expect(searchClosed()).toBe(false);
  });

  it("keeps the query and results when the search dialog reopens (#111)", async () => {
    const { user, opener, dialog } = await openSearch();
    await user.type(within(dialog()).getByLabelText(STRINGS.searchLabel), "bo{Enter}");
    await fromServer(msg("searchResults", { results: [{ sessionId: "s3", pseudo: "zoe", hasAccount: true, away: false, gender: "woman", age: 30, city: "Lyon", rooms: [] }] }));

    await user.click(within(dialog()).getByRole("button", { name: STRINGS.close }));
    await user.click(opener);

    expect((within(dialog()).getByLabelText(STRINGS.searchLabel) as HTMLInputElement).value).toBe("bo");
    expect(within(dialog()).getByRole("button", { name: STRINGS.pseudoButton("zoe") })).toBeTruthy();
  });

  it("closes the search dialog when \"message privé\" opens a window from a result (#111)", async () => {
    const { user, dialog } = await openSearch();
    await user.type(within(dialog()).getByLabelText(STRINGS.searchLabel), "zo{Enter}");
    await fromServer(msg("searchResults", { results: [{ sessionId: "s3", pseudo: "zoe", hasAccount: true, away: false, gender: "woman", age: 30, city: "Lyon", rooms: [] }] }));

    await user.click(within(dialog()).getByRole("button", { name: STRINGS.pseudoButton("zoe") }));
    await user.click(screen.getByRole("menuitem", { name: STRINGS.privateMessage }));

    expect(searchClosed()).toBe(true);
    expect(screen.getByRole("dialog", { name: STRINGS.privateWith("zoe") })).toBeTruthy();
  });
});
