import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Member, ServerMessage } from "../shared/protocol";
import { App } from "./App";
import type { ConnectionFactory } from "./chat-context";
import type { Connection } from "./connection";
import type { Action } from "./store";
import { STRINGS } from "./strings";

let dispatch: (action: Action) => void;
let connection: { [K in keyof Connection]: ReturnType<typeof vi.fn<Connection[K]>> };
let connect: ConnectionFactory;

const fire = (action: Action) => act(() => dispatch(action));
const msg = <T extends ServerMessage["type"]>(type: T, payload: Extract<ServerMessage, { type: T }>["payload"]) =>
  fire({ type: "server", message: { type, seq: 0, payload } as ServerMessage });
const bob: Member = { sessionId: "s2", pseudo: "bob", hasAccount: true, away: false, gender: "man", age: 30 };
const queued = (id: string, extra: object = {}) => ({
  id, reason: "harassment" as const, targetKind: "message" as const, targetPseudo: "bob", excerpt: "insulte", context: ["bob: insulte"],
  authorPseudo: "ana", createdAt: "2026-11-13T10:00:00.000Z", hasAccount: true, connected: true, activeStrikes: 1, ...extra,
});

const setup = async () => {
  const user = userEvent.setup();
  render(<App connect={connect} />);
  await act(async () => {});
  return user;
};
const enterChat = async (isModerator = false) => {
  await fire({ type: "entering", pseudo: "ana" });
  await msg("entered", { sessionId: "me", resumeToken: "t", roomList: [{ id: "r1", name: "Paris", kind: "regional", count: 2 }], isModerator });
  await msg("roomJoined", { roomId: "r1", members: [bob] });
};

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
  connection = { enter: vi.fn(), signOutDevice: vi.fn(async () => undefined), send: vi.fn(() => 7), forgetCode: vi.fn(), leave: vi.fn(), close: vi.fn() };
  connect = (d) => {
    dispatch = d;
    return connection;
  };
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("moderator access on the entry screen (UC16i, BR-091)", () => {
  const fillGuest = async (user: ReturnType<typeof userEvent.setup>) => {
    await fire({ type: "link", link: "online" });
    await user.type(screen.getByLabelText(STRINGS.pseudo), "owner");
    await user.type(screen.getByLabelText(STRINGS.age), "40");
    await user.click(screen.getByLabelText(STRINGS.adult));
    await user.click(screen.getByLabelText(STRINGS.terms));
  };

  it("sends the token typed in the hidden field with the entry", async () => {
    const user = await setup();
    await fillGuest(user);
    expect(screen.queryByLabelText(STRINGS.moderatorToken)).toBeNull();

    await user.click(screen.getByRole("button", { name: STRINGS.moderatorSignIn }));
    await user.type(screen.getByLabelText(STRINGS.moderatorToken), "secret-token");
    await user.click(screen.getByRole("button", { name: STRINGS.enter }));

    expect(connection.enter).toHaveBeenCalledWith(expect.objectContaining({ pseudo: "owner", moderatorGrant: "secret-token" }), undefined);
  });

  it("drops the token once the field is hidden again", async () => {
    const user = await setup();
    await fillGuest(user);
    const toggle = screen.getByRole("button", { name: STRINGS.moderatorSignIn });
    await user.click(toggle);
    await user.type(screen.getByLabelText(STRINGS.moderatorToken), "secret-token");
    await user.click(toggle);

    await user.click(screen.getByRole("button", { name: STRINGS.enter }));

    expect(connection.enter).toHaveBeenCalledTimes(1);
    expect(connection.enter.mock.calls[0]?.[0]).not.toHaveProperty("moderatorGrant");
  });

  it("names a refused token", async () => {
    await setup();

    await msg("entryRefused", { reason: "notModerator" });

    expect(screen.getByRole("alert").textContent).toBe(STRINGS.entryRefused.notModerator);
  });
});

describe("expulsion (UC11, BR-008)", () => {
  it("shows the entry screen with the end of the expulsion", async () => {
    await setup();
    await enterChat();

    await msg("expelled", { until: "2026-11-13T11:00:00.000Z" });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(`${STRINGS.entryRefused.expelled}${STRINGS.until("2026-11-13T11:00:00.000Z")}`);
    expect(screen.getByLabelText<HTMLInputElement>(STRINGS.pseudo).value).toBe("ana");
  });

  it("names the end of a ban on a refused entry", async () => {
    await setup();

    await msg("entryRefused", { reason: "banned", bannedUntil: "2026-11-14T10:00:00.000Z" });

    expect(screen.getByRole("alert").textContent).toContain(STRINGS.until("2026-11-14T10:00:00.000Z"));
  });
});

describe("report dialog (UC9, web-ui/08)", () => {
  it("reports a message line with the lines up to it, then closes on reportSent", async () => {
    const user = await setup();
    await enterChat();
    await msg("roomMessage", { roomId: "r1", authorSessionId: "s2", pseudo: "bob", gender: "man", text: "insulte", sentAt: "2026-11-13T10:00:00.000Z" });
    await msg("roomMessage", { roomId: "r1", authorSessionId: "s2", pseudo: "bob", gender: "man", text: "après", sentAt: "2026-11-13T10:00:01.000Z" });

    await user.click(screen.getAllByRole("button", { name: STRINGS.reportMessage("bob") })[0] as HTMLElement);
    const dialog = screen.getByRole("dialog", { name: STRINGS.reportTitle("bob") });
    const send = within(dialog).getByRole("button", { name: STRINGS.send });
    expect(send).toHaveProperty("disabled", true);
    await user.click(within(dialog).getByLabelText(STRINGS.reasons.harassment));
    await user.click(send);

    expect(connection.send).toHaveBeenCalledWith({
      type: "report",
      payload: { targetKind: "message", targetPseudo: "bob", excerpt: "insulte", context: ["bob: insulte"], reason: "harassment" },
    });
    await msg("reportSent", { reportId: "rep1" });
    expect(screen.queryByRole("dialog", { name: STRINGS.reportTitle("bob") })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain(STRINGS.notices.reportSent);
  });

  it("offers no report flag on the chatter's own lines", async () => {
    await setup();
    await enterChat();

    await msg("roomMessage", { roomId: "r1", authorSessionId: "me", pseudo: "ana", gender: "woman", text: "moi", sentAt: "2026-11-13T10:00:00.000Z" });

    expect(screen.queryByRole("button", { name: STRINGS.reportMessage("ana") })).toBeNull();
  });

  it("reports a chatter from the pseudo menu, and shows a refusal in the dialog", async () => {
    const user = await setup();
    await enterChat();
    await user.click(screen.getByRole("button", { name: STRINGS.pseudoButton("bob") }));

    await user.click(screen.getByRole("menuitem", { name: STRINGS.report }));
    const dialog = screen.getByRole("dialog", { name: STRINGS.reportTitle("bob") });
    await user.click(within(dialog).getByLabelText(STRINGS.reasons.spam));
    await user.click(within(dialog).getByRole("button", { name: STRINGS.send }));
    await msg("warning", { code: "reportRate", message: "" });

    expect(connection.send).toHaveBeenCalledWith({ type: "report", payload: { targetKind: "chatter", targetPseudo: "bob", excerpt: "", context: [], reason: "spam" } });
    expect(within(dialog).getByRole("alert").textContent).toContain(STRINGS.notices.reportRate);
    await user.click(within(dialog).getAllByRole("button", { name: STRINGS.close }).at(-1) as HTMLElement);
    expect(screen.queryByRole("dialog", { name: STRINGS.reportTitle("bob") })).toBeNull();
  });

  it("names a warning and the active strikes", async () => {
    await setup();
    await enterChat();

    await msg("warned", { rule: "harassment", text: "", activeStrikes: 2 });

    expect(screen.getByRole("alert").textContent).toContain(STRINGS.warned(2));
  });
});

describe("queue dialog (UC12, web-ui/08)", () => {
  it("shows the queue button to moderators only", async () => {
    await setup();
    await enterChat(false);

    expect(screen.queryByRole("button", { name: STRINGS.queue })).toBeNull();
  });

  it("lists the open reports and sends each action", async () => {
    const user = await setup();
    await enterChat(true);

    await user.click(screen.getByRole("button", { name: STRINGS.queue }));
    expect(connection.send).toHaveBeenCalledWith({ type: "listOpenReports", payload: {} });
    const dialog = screen.getByRole("dialog", { name: STRINGS.queueTitle });
    expect(within(dialog).getByText(STRINGS.queueLoading)).toBeTruthy();
    await msg("openReports", { reports: [queued("a")] });
    expect(within(dialog).getByText(STRINGS.queueTarget(true, true, 1))).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: STRINGS.noAction }));
    await user.click(within(dialog).getByRole("button", { name: STRINGS.warn }));
    await user.click(within(dialog).getByRole("button", { name: STRINGS.expel(STRINGS.durations["24h"]) }));

    expect(connection.send).toHaveBeenCalledWith({ type: "closeReport", payload: { reportId: "a", outcome: "noAction" } });
    expect(connection.send).toHaveBeenCalledWith({ type: "closeReport", payload: { reportId: "a", outcome: "warned" } });
    expect(connection.send).toHaveBeenCalledWith({ type: "expel", payload: { reportId: "a", duration: "24h" } });
    await msg("reportClosed", { reportId: "a" });
    expect(within(dialog).getByText(STRINGS.queueEmpty)).toBeTruthy();
  });

  it("asks for the suspension at the third strike, both ways", async () => {
    const user = await setup();
    await enterChat(true);
    await user.click(screen.getByRole("button", { name: STRINGS.queue }));
    await msg("openReports", { reports: [queued("a")] });

    await msg("suspensionProposed", { accountId: "acc", reportId: "a", activeStrikes: 3 });
    await user.click(screen.getByRole("button", { name: STRINGS.suspend }));
    await user.click(screen.getByRole("button", { name: STRINGS.noSuspend }));

    expect(screen.getByText(STRINGS.proposal(3))).toBeTruthy();
    expect(connection.send).toHaveBeenCalledWith({ type: "confirmSuspension", payload: { accountId: "acc", reportId: "a" } });
    expect(connection.send).toHaveBeenCalledWith({ type: "declineSuspension", payload: { accountId: "acc", reportId: "a" } });
  });

  it("keeps the queue closed when the request could not leave", async () => {
    connection.send.mockReturnValue(undefined);
    const user = await setup();
    await enterChat(true);

    await user.click(screen.getByRole("button", { name: STRINGS.queue }));

    expect(screen.queryByRole("dialog", { name: STRINGS.queueTitle })).toBeNull();
  });
});
