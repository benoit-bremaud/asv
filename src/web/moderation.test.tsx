import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Member, ServerMessage } from "../shared/protocol";
import { App } from "./App";
import type { ConnectionFactory } from "./chat-context";
import type { Connection } from "./connection";
import type { Action } from "./store";
import { STRINGS } from "./strings";

// The WebAuthn ceremony and its `/mod` calls are the boundary (`web-ui/09`).
const passkey = vi.hoisted(() => ({
  moderationAccess: vi.fn(async (): Promise<"off" | "noPasskey" | "on"> => "on"),
  signInModerator: vi.fn(),
  enrolModerator: vi.fn(),
  takeEnrolToken: vi.fn((): string | undefined => undefined),
}));
vi.mock("./moderator-passkey", () => passkey);

let dispatch: (action: Action) => void;
let connection: { [K in keyof Connection]: ReturnType<typeof vi.fn<Connection[K]>> };
let connect: ConnectionFactory;

const fire = (action: Action) => act(() => dispatch(action));
const msg = <T extends ServerMessage["type"]>(type: T, payload: Extract<ServerMessage, { type: T }>["payload"]) =>
  fire({ type: "server", message: { type, seq: 0, payload } as ServerMessage });
const bob: Member = { sessionId: "s2", pseudo: "bob", hasAccount: true, away: false, gender: "man", age: 30 };
const queued = (id: string, extra: object = {}) => ({
  id, reason: "harassment" as const, targetKind: "message" as const, targetPseudo: "bob", excerpt: "insulte", context: ["bob: insulte"],
  authorPseudo: "ana", createdAt: "2026-11-13T10:00:00.000Z", hasAccount: true, connected: true, activeStrikes: 1, struck: false, ...extra,
});

const setup = async () => {
  const user = userEvent.setup();
  render(<App connect={connect} />);
  await act(async () => {});
  return user;
};
const enterChat = async (isModerator = false, canReport = true) => {
  await fire({ type: "entering", pseudo: "ana" });
  await msg("entered", { sessionId: "me", resumeToken: "t", roomList: [{ id: "r1", name: "Paris", kind: "regional", count: 2 }], isModerator, canReport });
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

describe("moderator sign-in on the entry screen (UC16, BR-095, BR-097)", () => {
  const fillGuest = async (user: ReturnType<typeof userEvent.setup>) => {
    await fire({ type: "link", link: "online" });
    await user.type(screen.getByLabelText(STRINGS.pseudo), "owner");
    await user.type(screen.getByLabelText(STRINGS.age), "40");
    await user.click(screen.getByLabelText(STRINGS.adult));
    await user.click(screen.getByLabelText(STRINGS.terms));
  };

  it("sends the grant from an accepted passkey with the entry", async () => {
    passkey.signInModerator.mockResolvedValueOnce({ grant: "g.mac", name: "Marc" });
    const user = await setup();
    await fillGuest(user);

    await user.click(screen.getByRole("button", { name: STRINGS.moderatorSignIn }));
    expect(screen.getByText(STRINGS.moderatorAccepted("Marc")).tagName).toBe("OUTPUT");
    await user.click(screen.getByRole("button", { name: STRINGS.enter }));

    expect(connection.enter).toHaveBeenCalledWith(expect.objectContaining({ pseudo: "owner", moderatorGrant: "g.mac" }), undefined);
  });

  it("drops the grant when cancelled", async () => {
    passkey.signInModerator.mockResolvedValueOnce({ grant: "g.mac", name: "Marc" });
    const user = await setup();
    await fillGuest(user);
    await user.click(screen.getByRole("button", { name: STRINGS.moderatorSignIn }));

    await user.click(screen.getByRole("button", { name: STRINGS.moderatorCancel }));
    await user.click(screen.getByRole("button", { name: STRINGS.enter }));

    expect(connection.enter.mock.calls[0]?.[0]).not.toHaveProperty("moderatorGrant");
  });

  it("forgets the grant after 60 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      passkey.signInModerator.mockResolvedValueOnce({ grant: "g.mac", name: "Marc" });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<App connect={connect} />);
      await act(async () => {});
      await user.click(screen.getByRole("button", { name: STRINGS.moderatorSignIn }));
      await screen.findByText(STRINGS.moderatorAccepted("Marc"));
      await act(async () => {});

      await act(() => vi.advanceTimersByTimeAsync(60_000));

      expect((await screen.findByRole("alert")).textContent).toBe(STRINGS.moderatorExpired);
      expect(screen.getByRole("button", { name: STRINGS.moderatorSignIn })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["refused", "cancelled"] as const)("says the key was refused when %s (web-ui/09 Asking → Plain)", async (result) => {
    passkey.signInModerator.mockResolvedValueOnce(result);
    const user = await setup();

    await user.click(screen.getByRole("button", { name: STRINGS.moderatorSignIn }));

    expect(screen.getByRole("alert").textContent).toBe(STRINGS.moderatorRefused);
  });

  it("shows a disabled link on a browser without passkeys", async () => {
    passkey.moderationAccess.mockResolvedValueOnce("noPasskey");
    await setup();

    const link = screen.getByRole("button", { name: `${STRINGS.moderatorSignIn} (${STRINGS.noPasskey})` });
    expect((link as HTMLButtonElement).disabled).toBe(true);
  });

  it("drops a grant the server refused, so the next entry goes without it", async () => {
    passkey.signInModerator.mockResolvedValueOnce({ grant: "g.mac", name: "Marc" });
    const user = await setup();
    await fillGuest(user);
    await user.click(screen.getByRole("button", { name: STRINGS.moderatorSignIn }));

    await msg("entryRefused", { reason: "notModerator" });
    await user.click(screen.getByRole("button", { name: STRINGS.enter }));

    expect(screen.getByRole("button", { name: STRINGS.moderatorSignIn })).toBeTruthy();
    expect(connection.enter.mock.calls.at(-1)?.[0]).not.toHaveProperty("moderatorGrant");
  });

  it("hides the link where moderation is off (tunnel)", async () => {
    passkey.moderationAccess.mockResolvedValueOnce("off");
    await setup();

    expect(screen.queryByRole("button", { name: STRINGS.moderatorSignIn })).toBeNull();
  });

  it("names a refused grant", async () => {
    await setup();

    await msg("entryRefused", { reason: "notModerator" });

    expect(screen.getByRole("alert").textContent).toBe(STRINGS.entryRefused.notModerator);
  });
});

describe("moderator name in the queue title (BR-055, BR-095)", () => {
  it.each([
    ["entered", "Marc", STRINGS.queueTitleOf("Marc")],
    ["resumed", "Marc", STRINGS.queueTitleOf("Marc")],
    ["entered", undefined, STRINGS.queueTitle],
  ] as const)("titles the queue after %s with name %s", async (type, moderatorName, title) => {
    const user = await setup();
    await fire({ type: "entering", pseudo: "ana" });
    const named = { isModerator: true, canReport: true, ...(moderatorName ? { moderatorName } : {}) };
    if (type === "entered") {
      await msg("entered", { sessionId: "me", resumeToken: "t", roomList: [{ id: "r1", name: "Paris", kind: "regional", count: 2 }], ...named });
      await msg("roomJoined", { roomId: "r1", members: [bob] });
    } else {
      await msg("resumed", { sessionId: "me", pseudo: "ana", resumeToken: "t2", rooms: [{ roomId: "r1", members: [bob] }], windows: [], buffered: [], ...named });
    }

    await user.click(screen.getByRole("button", { name: STRINGS.queue }));

    expect(screen.getByRole("dialog", { name: title })).toBeTruthy();
  });
});

describe("enrolment page (UC15, BR-099)", () => {
  it("creates the passkey and confirms the name", async () => {
    passkey.takeEnrolToken.mockReturnValueOnce("tok");
    passkey.enrolModerator.mockResolvedValueOnce({ name: "Marc" });
    const user = await setup();

    await user.click(screen.getByRole("button", { name: STRINGS.enrolCreate }));

    expect(passkey.enrolModerator).toHaveBeenCalledWith("tok");
    expect(screen.getByText(STRINGS.enrolDone("Marc")).tagName).toBe("OUTPUT");
    expect(screen.queryByRole("button", { name: STRINGS.enrolCreate })).toBeNull();
  });

  it.each([
    ["gone", STRINGS.enrolRefused, false],
    ["failed", STRINGS.enrolFailed, true],
    ["cancelled", STRINGS.enrolCancelled, true],
  ] as const)("shows %s and lets retry only when it can work", async (result, text, retry) => {
    passkey.takeEnrolToken.mockReturnValueOnce("tok");
    passkey.enrolModerator.mockResolvedValueOnce(result);
    const user = await setup();

    await user.click(screen.getByRole("button", { name: STRINGS.enrolCreate }));

    expect(screen.getByRole("alert").textContent).toBe(text);
    expect(screen.queryByRole("button", { name: STRINGS.enrolCreate }) !== null).toBe(retry);
  });

  it("refuses a malformed link without a ceremony, and goes back to the entry", async () => {
    passkey.takeEnrolToken.mockReturnValueOnce("");
    const user = await setup();

    expect(screen.getByRole("alert").textContent).toBe(STRINGS.enrolRefused);
    await user.click(screen.getByRole("button", { name: STRINGS.enrolBack }));

    expect(passkey.enrolModerator).not.toHaveBeenCalled();
    expect(screen.getByLabelText(STRINGS.pseudo)).toBeTruthy();
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

  it("offers no report at all when the server turned reporting off (tester tunnel)", async () => {
    const user = await setup();
    await enterChat(false, false);
    await msg("roomMessage", { roomId: "r1", authorSessionId: "s2", pseudo: "bob", gender: "man", text: "salut", sentAt: "2026-11-13T10:00:00.000Z" });

    await user.click(screen.getByRole("button", { name: STRINGS.pseudoButton("bob") }));

    expect(screen.queryByRole("button", { name: STRINGS.reportMessage("bob") })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: STRINGS.report })).toBeNull();
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
    await msg("openReports", { reports: [queued("a")], total: 1 });
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

  it("shows the urgency, the AI triage as text with its legend, and asks the next report once one closes (BR-100, BR-102)", async () => {
    const user = await setup();
    await enterChat(true);
    await user.click(screen.getByRole("button", { name: STRINGS.queue }));
    const dialog = screen.getByRole("dialog", { name: STRINGS.queueTitle });
    const triage = { category: "threat", urgency: "high", summary: "<b>[A]</b> menace [B]", labels: [{ label: "[A]", pseudo: "bob" }, { label: "[B]", pseudo: "ana" }] };

    await msg("openReports", { reports: [queued("a", { triage }), queued("b")], total: 3 });

    expect(within(dialog).getByText(STRINGS.urgency(STRINGS.urgencies.high))).toBeTruthy();
    expect(within(dialog).getByText(STRINGS.urgency(STRINGS.urgencies.unknown))).toBeTruthy();
    expect(within(dialog).getByText(`: ${STRINGS.categories.threat} — <b>[A]</b> menace [B]`, { exact: false })).toBeTruthy();
    expect(within(dialog).getByText("[A] = bob, [B] = ana")).toBeTruthy();
    expect(within(dialog).getByText(STRINGS.queueCount(2, 3))).toBeTruthy();
    expect(dialog.querySelector("b")).toBeNull();
    connection.send.mockClear();

    await msg("reportClosed", { reportId: "a" });

    expect(connection.send).toHaveBeenCalledWith({ type: "listOpenReports", payload: {} });
  });

  it("asks the next page once per close when more than 50 are open, never on open", async () => {
    const user = await setup();
    await enterChat(true);
    await user.click(screen.getByRole("button", { name: STRINGS.queue }));
    const page = Array.from({ length: 50 }, (_, n) => queued(`r${n}`));
    connection.send.mockClear();

    await msg("openReports", { reports: page, total: 60 });
    expect(connection.send).not.toHaveBeenCalled();
    await msg("reportClosed", { reportId: "r0" });
    await msg("reportClosed", { reportId: "r1" });

    const lists = connection.send.mock.calls.filter(([command]) => (command as { type: string }).type === "listOpenReports");
    expect(lists).toHaveLength(2);
  });

  it("asks for the suspension at the third strike, both ways", async () => {
    const user = await setup();
    await enterChat(true);
    await user.click(screen.getByRole("button", { name: STRINGS.queue }));
    await msg("openReports", { reports: [queued("a")], total: 1 });

    await msg("suspensionProposed", { accountId: "acc", reportId: "a", activeStrikes: 3 });
    await user.click(screen.getByRole("button", { name: STRINGS.suspend }));
    await user.click(screen.getByRole("button", { name: STRINGS.noSuspend }));

    expect(screen.getByText(STRINGS.proposal(3))).toBeTruthy();
    expect(connection.send).toHaveBeenCalledWith({ type: "confirmSuspension", payload: { accountId: "acc", reportId: "a" } });
    expect(connection.send).toHaveBeenCalledWith({ type: "declineSuspension", payload: { accountId: "acc", reportId: "a" } });
  });

  it("asks for the suspension again instead of a second warning on a struck report", async () => {
    const user = await setup();
    await enterChat(true);
    await user.click(screen.getByRole("button", { name: STRINGS.queue }));
    await msg("openReports", { reports: [queued("a", { struck: true, activeStrikes: 3 })], total: 1 });
    const dialog = screen.getByRole("dialog", { name: STRINGS.queueTitle });

    await user.click(within(dialog).getByRole("button", { name: STRINGS.askSuspension }));

    expect(within(dialog).queryByRole("button", { name: STRINGS.warn })).toBeNull();
    expect(connection.send).toHaveBeenCalledWith({ type: "closeReport", payload: { reportId: "a", outcome: "warned" } });
  });

  it("keeps the queue closed when the request could not leave", async () => {
    connection.send.mockReturnValue(undefined);
    const user = await setup();
    await enterChat(true);

    await user.click(screen.getByRole("button", { name: STRINGS.queue }));

    expect(screen.queryByRole("dialog", { name: STRINGS.queueTitle })).toBeNull();
  });
});

describe("brick 8c-2 in the web client (web-ui/08, BR-103 to BR-106)", () => {
  const userRoom = { id: "u1", name: "Apéro", kind: "user" as const, count: 2 };
  const alert = { offenceCategory: "threatToLife" as const, raisedBy: "Marc", raisedAt: "2026-11-13T10:00:00.000Z", status: "pending" as const };
  const openQueue = async (user: ReturnType<typeof userEvent.setup>, reports: object[]) => {
    await enterChat(true);
    await user.click(screen.getByRole("button", { name: STRINGS.queue }));
    await msg("openReports", { reports: reports as Extract<ServerMessage, { type: "openReports" }>["payload"]["reports"], total: reports.length });
    return screen.getByRole("dialog", { name: STRINGS.queueTitle });
  };

  it("reports a user room from its header with the last lines, never an official room", async () => {
    const user = await setup();
    await enterChat();
    expect(screen.queryByRole("button", { name: STRINGS.reportRoom })).toBeNull();
    await msg("roomList", { rooms: [{ id: "r1", name: "Paris", kind: "regional", count: 2 }, userRoom] });
    await msg("roomJoined", { roomId: "u1", members: [bob] });
    await msg("roomMessage", { roomId: "u1", authorSessionId: "s2", pseudo: "bob", gender: "man", text: "pub", sentAt: "2026-11-13T10:00:00.000Z" });

    await user.click(screen.getByRole("button", { name: STRINGS.reportRoom }));
    const dialog = screen.getByRole("dialog", { name: STRINGS.reportRoomTitle("Apéro") });
    await user.click(within(dialog).getByLabelText(STRINGS.reasons.spam));
    await user.click(within(dialog).getByRole("button", { name: STRINGS.send }));

    expect(connection.send).toHaveBeenCalledWith({ type: "report", payload: { targetKind: "room", targetRoomId: "u1", excerpt: "", context: ["bob: pub"], reason: "spam" } });
  });

  it("closes the tab of a room a moderator removed, with a notice", async () => {
    await setup();
    await enterChat();
    await msg("roomList", { rooms: [{ id: "r1", name: "Paris", kind: "regional", count: 2 }, userRoom] });
    await msg("roomJoined", { roomId: "u1", members: [bob] });

    await msg("roomClosed", { roomId: "u1" });

    expect(screen.queryByRole("heading", { name: "# Apéro" })).toBeNull();
    expect(screen.queryByRole("button", { name: STRINGS.reportRoom })).toBeNull();
    expect(screen.getByRole("heading", { name: /# Paris/ })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(STRINGS.notices.roomClosed);
  });

  it("offers only no action and room removal on a room report, with the alert picked", async () => {
    const user = await setup();
    const dialog = await openQueue(user, [queued("a", { targetKind: "room", targetPseudo: undefined, targetRoomId: "u1", targetRoomName: "Apéro", hasAccount: false })]);

    expect(within(dialog).getByText("# Apéro")).toBeTruthy();

    expect(within(dialog).queryByRole("button", { name: STRINGS.warn })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: STRINGS.severe })).toBeNull();
    await user.selectOptions(within(dialog).getByLabelText(STRINGS.alertSelect), "hateOrViolence");
    await user.click(within(dialog).getByRole("button", { name: STRINGS.removeRoom }));

    expect(connection.send).toHaveBeenCalledWith({ type: "removeRoom", payload: { reportId: "a", alertAuthorities: "hateOrViolence" } });
  });

  it("sends a closing action with no alert while the select stays on aucune", async () => {
    const user = await setup();
    const dialog = await openQueue(user, [queued("a")]);

    expect(within(dialog).getByLabelText<HTMLSelectElement>(STRINGS.alertSelect).value).toBe("none");
    await user.click(within(dialog).getByRole("button", { name: STRINGS.noAction }));

    expect(connection.send.mock.calls.at(-1)?.[0]).toEqual({ type: "closeReport", payload: { reportId: "a", outcome: "noAction", alertAuthorities: undefined } });
  });

  it.each([
    [true, STRINGS.severeEffects(true)],
    [false, STRINGS.severeEffects(false)],
  ])("confirms a severe expel naming its effects (account %s), only once an alert choice is made", async (hasAccount, effects) => {
    const user = await setup();
    const dialog = await openQueue(user, [queued("a", { hasAccount })]);

    await user.click(within(dialog).getByRole("button", { name: STRINGS.severe }));
    expect(within(dialog).getByText(effects)).toBeTruthy();
    const confirm = within(dialog).getByRole("button", { name: STRINGS.confirmSevere });
    expect(confirm).toHaveProperty("disabled", true);
    await user.selectOptions(within(dialog).getByLabelText(STRINGS.alertSelect), "childAbuse");
    await user.click(confirm);

    expect(connection.send).toHaveBeenCalledWith({ type: "expel", payload: { reportId: "a", duration: "7d", severe: true, alertAuthorities: "childAbuse" } });
  });

  it("cancels a severe expel back to the actions, and confirms with aucune", async () => {
    const user = await setup();
    const dialog = await openQueue(user, [queued("a")]);

    await user.click(within(dialog).getByRole("button", { name: STRINGS.severe }));
    await user.click(within(dialog).getByRole("button", { name: STRINGS.cancel }));
    expect(within(dialog).getByRole("button", { name: STRINGS.noAction })).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: STRINGS.severe }));
    await user.selectOptions(within(dialog).getByLabelText(STRINGS.alertSelect), "none");
    await user.click(within(dialog).getByRole("button", { name: STRINGS.confirmSevere }));

    expect(connection.send.mock.calls.at(-1)?.[0]).toEqual({ type: "expel", payload: { reportId: "a", duration: "7d", severe: true, alertAuthorities: undefined } });
  });

  it("shows the alert just raised with the warning read-only, the queue not yet refreshed", async () => {
    const user = await setup();
    const dialog = await openQueue(user, [queued("a", { struck: true, activeStrikes: 3 })]);
    await user.selectOptions(within(dialog).getByLabelText(STRINGS.alertSelect), "harassment");
    await user.click(within(dialog).getByRole("button", { name: STRINGS.askSuspension }));

    await msg("suspensionProposed", { accountId: "acc", reportId: "a", activeStrikes: 3, alert: "harassment" });

    const proposal = screen.getByText(STRINGS.proposal(3)).parentElement as HTMLElement;
    expect(within(proposal).queryByLabelText(STRINGS.alertSelect)).toBeNull();
    expect(within(proposal).getByText(STRINGS.alertRaisedAlready(STRINGS.offences.harassment))).toBeTruthy();
  });

  it("sends the alert picked in the proposal with a declined suspension too", async () => {
    const user = await setup();
    await openQueue(user, [queued("a")]);
    await msg("suspensionProposed", { accountId: "acc", reportId: "a", activeStrikes: 3 });

    const proposal = screen.getByText(STRINGS.proposal(3)).parentElement as HTMLElement;
    await user.selectOptions(within(proposal).getByLabelText(STRINGS.alertSelect), "terrorism");
    await user.click(within(proposal).getByRole("button", { name: STRINGS.noSuspend }));

    expect(connection.send).toHaveBeenCalledWith({ type: "declineSuspension", payload: { accountId: "acc", reportId: "a", alertAuthorities: "terrorism" } });
  });

  it("shows an alert already raised on the report read-only in the proposal, and sends none", async () => {
    const user = await setup();
    await openQueue(user, [queued("a", { alert: { ...alert, offenceCategory: "harassment" } })]);
    await msg("suspensionProposed", { accountId: "acc", reportId: "a", activeStrikes: 3 });

    const proposal = screen.getByText(STRINGS.proposal(3)).parentElement as HTMLElement;
    expect(within(proposal).queryByLabelText(STRINGS.alertSelect)).toBeNull();
    expect(within(proposal).getByText(STRINGS.alertRaisedAlready(STRINGS.offences.harassment))).toBeTruthy();
    await user.click(within(proposal).getByRole("button", { name: STRINGS.suspend }));
    await user.click(within(proposal).getByRole("button", { name: STRINGS.noSuspend }));

    expect(connection.send.mock.calls.slice(-2).map(([command]) => command)).toEqual([
      { type: "confirmSuspension", payload: { accountId: "acc", reportId: "a", alertAuthorities: undefined } },
      { type: "declineSuspension", payload: { accountId: "acc", reportId: "a", alertAuthorities: undefined } },
    ]);
  });

  it("sends the alert with a confirmed suspension", async () => {
    const user = await setup();
    await openQueue(user, [queued("a")]);
    await msg("suspensionProposed", { accountId: "acc", reportId: "a", activeStrikes: 3 });

    const proposal = screen.getByText(STRINGS.proposal(3)).parentElement as HTMLElement;
    await user.selectOptions(within(proposal).getByLabelText(STRINGS.alertSelect), "harassment");
    await user.click(within(proposal).getByRole("button", { name: STRINGS.suspend }));

    expect(connection.send).toHaveBeenCalledWith({ type: "confirmSuspension", payload: { accountId: "acc", reportId: "a", alertAuthorities: "harassment" } });
  });

  it("shows the alert status of an open row, pending or filed", async () => {
    const user = await setup();
    const dialog = await openQueue(user, [
      queued("a", { alert }),
      queued("b", { alert: { ...alert, status: "filed", channel: "PHAROS", reference: "PV-1", filedAt: "2026-11-13T12:00:00.000Z" } }),
    ]);

    expect(within(dialog).getByText(STRINGS.alertStatus(STRINGS.alertPending))).toBeTruthy();
    expect(within(dialog).getByText(STRINGS.alertStatus(STRINGS.alertFiled("PHAROS", "PV-1")))).toBeTruthy();
  });

  it("lists the alerted reports in the alertes tab, as text, and goes back to the open ones", async () => {
    const user = await setup();
    const dialog = await openQueue(user, [queued("a")]);

    await user.click(within(dialog).getByRole("button", { name: STRINGS.tabAlerts }));
    expect(connection.send).toHaveBeenCalledWith({ type: "listAlertedReports", payload: {} });
    expect(within(dialog).getByText(STRINGS.queueLoading)).toBeTruthy();
    const row = { ...queued("z", { excerpt: "<b>menace</b>" }), closedAt: "2026-11-13T11:00:00.000Z" };
    await msg("alertedReports", { reports: [{ ...row, alert: { ...alert, status: "filed", channel: "police17", reference: "PV-9", filedAt: "2026-11-13T12:00:00.000Z" } }] });

    expect(within(dialog).getByText("<b>menace</b>")).toBeTruthy();
    expect(dialog.querySelector("blockquote b")).toBeNull();
    expect(within(dialog).getByText(STRINGS.alertFiled("17", "PV-9"), { exact: false })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: STRINGS.noAction })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: STRINGS.tabOpen }));
    expect(within(dialog).getByRole("button", { name: STRINGS.noAction })).toBeTruthy();
  });

  it("says when there is no alert", async () => {
    const user = await setup();
    const dialog = await openQueue(user, []);

    await user.click(within(dialog).getByRole("button", { name: STRINGS.tabAlerts }));
    await msg("alertedReports", { reports: [] });

    expect(within(dialog).getByText(STRINGS.alertsEmpty)).toBeTruthy();
  });
});
