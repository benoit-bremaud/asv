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

      await act(async () => { vi.advanceTimersByTime(60_000); });

      expect(screen.getByRole("alert").textContent).toBe(STRINGS.moderatorExpired);
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
