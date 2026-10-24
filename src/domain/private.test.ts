import { describe, expect, it } from "vitest";
import { unlinkSessions } from "./accounts";
import { search } from "./directory";
import { enter, socketLost, type EnterCommand, type Random } from "./entry";
import { expireAway, leave, resume, unlinkSessions as unlinkOnHub } from "./hub";
import { blocks } from "./ignore";
import { closePrivate, forgetIgnores, ignore, openPartners, PRIVATE_LIMITS, sendPrivate, unignore, windowsOf, type PrivateEffect } from "./private";
import { emptyHubState, joinRoom, postRoom, ROOM_LIMITS, type HubState } from "./rooms";

const T0 = new Date("2026-10-24T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

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

interface Chatter {
  readonly pseudo: string;
  readonly account?: boolean;
  readonly city?: string;
}

/** A hub with connected sessions; members have an account unless `account: false`. */
const hubWith = (...chatters: Chatter[]) => {
  const random = fakeRandom();
  let state: HubState = emptyHubState([{ id: "lyon", name: "Lyon", kind: "regional" }]);
  const ids = chatters.map((chatter, i) => {
    const command: EnterCommand = {
      pseudo: chatter.pseudo,
      age: 30,
      city: chatter.city,
      adultConfirmed: true,
      termsAccepted: true,
      ip: `203.0.113.${i}`,
      accountId: chatter.account === false ? undefined : `acc-${chatter.pseudo}`,
    };
    const entered = enter(state, command, T0, random);
    const effect = entered.effects[0];
    if (effect?.type !== "entered") throw new Error("entry refused in fixture");
    state = entered.state;
    return effect.sessionId;
  });
  const id = (i: number): string => {
    const found = ids[i];
    if (found === undefined) throw new Error(`no session ${i}`);
    return found;
  };
  return { state, id, random };
};

const typed = <T extends PrivateEffect["type"]>(effects: readonly PrivateEffect[], type: T) =>
  effects.filter((effect): effect is Extract<PrivateEffect, { type: T }> => effect.type === type);

describe("sendPrivate (UC6)", () => {
  it("opens both sides on the first message and sends it to both", () => {
    const { state, id, random } = hubWith({ pseudo: "Lola" }, { pseudo: "Max" });

    const sent = sendPrivate(state, { sessionId: id(0), targetPseudo: " max ", text: " salut " }, T0, random);

    const [conversation] = sent.state.conversations.values();
    expect(conversation).toMatchObject({ first: id(0), second: id(1), openFor: [id(0), id(1)] });
    expect(typed(sent.effects, "privateWindowOpened").map((effect) => [effect.sessionId, effect.otherSessionId]))
      .toEqual([[id(0), id(1)], [id(1), id(0)]]);
    expect(typed(sent.effects, "privateMessage")).toEqual([
      { type: "privateMessage", conversationId: conversation?.id, authorSessionId: id(0), text: "salut", sentAt: T0, recipients: [id(0), id(1)] },
    ]);
  });

  it("reuses the conversation and opens no window the second time", () => {
    const { state, id, random } = hubWith({ pseudo: "Lola" }, { pseudo: "Max" });
    const first = sendPrivate(state, { sessionId: id(0), targetPseudo: "Max", text: "a" }, T0, random);

    const reply = sendPrivate(first.state, { sessionId: id(1), targetPseudo: "Lola", text: "b" }, at(1), random);

    expect(reply.state.conversations.size).toBe(1);
    expect(typed(reply.effects, "privateWindowOpened")).toEqual([]);
    expect(typed(reply.effects, "privateMessage")[0]?.recipients).toEqual([id(1), id(0)]);
  });

  it.each([
    ["the sender has no account", [{ pseudo: "Lola", account: false }, { pseudo: "Max" }], "Max", "hi", "accountRequired"],
    ["the target is gone", [{ pseudo: "Lola" }], "Max", "hi", "offline"],
    ["the target is the sender", [{ pseudo: "Lola" }], "lola", "hi", "self"],
    ["the target has no account", [{ pseudo: "Lola" }, { pseudo: "Max", account: false }], "Max", "hi", "accountRequired"],
    ["the text is blank", [{ pseudo: "Lola" }, { pseudo: "Max" }], "Max", "   ", "empty"],
    ["the text is too long", [{ pseudo: "Lola" }, { pseudo: "Max" }], "Max", "é".repeat(ROOM_LIMITS.maxTextLength + 1), "tooLong"],
  ] as const)("refuses when %s", (_label, chatters, target, text, reason) => {
    const { state, id, random } = hubWith(...chatters);

    const sent = sendPrivate(state, { sessionId: id(0), targetPseudo: target, text }, T0, random);

    expect(sent.state).toBe(state);
    expect(sent.effects).toEqual([{ type: "privateRefused", sessionId: id(0), reason }]);
  });

  it("accepts exactly the maximum length in code points", () => {
    const { state, id, random } = hubWith({ pseudo: "Lola" }, { pseudo: "Max" });

    const sent = sendPrivate(state, { sessionId: id(0), targetPseudo: "Max", text: "😀".repeat(ROOM_LIMITS.maxTextLength) }, T0, random);

    expect(typed(sent.effects, "privateMessage")).toHaveLength(1);
  });

  it("shares the flood counter with the rooms (BR-021)", () => {
    const { state: start, id, random } = hubWith({ pseudo: "Lola" }, { pseudo: "Max" });
    let state = joinRoom(start, id(0), "lyon").state;
    for (let i = 0; i < ROOM_LIMITS.floodMessages; i++) {
      state = postRoom(state, { sessionId: id(0), roomId: "lyon", text: `m${i}` }, T0).state;
    }

    const sent = sendPrivate(state, { sessionId: id(0), targetPseudo: "Max", text: "hi" }, T0, random);

    expect(sent.effects).toEqual([{ type: "privateRefused", sessionId: id(0), reason: "flood" }]);
  });

  it("refuses an eleventh window on either side, but not a message in an open one (BR-043)", () => {
    const names = Array.from({ length: PRIVATE_LIMITS.maxWindows + 2 }, (_, i) => ({ pseudo: `Chat${i}` }));
    const { state: start, id, random } = hubWith({ pseudo: "Lola" }, ...names);
    let state = start;
    for (let i = 1; i <= PRIVATE_LIMITS.maxWindows; i++) {
      // Spaced out to stay under the flood limit.
      state = sendPrivate(state, { sessionId: id(0), targetPseudo: `Chat${i - 1}`, text: "hi" }, at(i * 60_000), random).state;
    }
    const now = at(3_600_000);

    expect(sendPrivate(state, { sessionId: id(0), targetPseudo: `Chat${PRIVATE_LIMITS.maxWindows}`, text: "hi" }, now, random).effects)
      .toEqual([{ type: "privateRefused", sessionId: id(0), reason: "tooManyWindows" }]);
    expect(typed(sendPrivate(state, { sessionId: id(0), targetPseudo: "Chat0", text: "again" }, now, random).effects, "privateMessage"))
      .toHaveLength(1);
    // BR-043, owner choice C: a newcomer cannot force an eleventh window open on Lola.
    expect(sendPrivate(state, { sessionId: id(PRIVATE_LIMITS.maxWindows + 1), targetPseudo: "Lola", text: "hey" }, now, random).effects)
      .toEqual([{ type: "privateRefused", sessionId: id(PRIVATE_LIMITS.maxWindows + 1), reason: "targetBusy" }]);
    // A partner whose conversation is open still gets through.
    expect(typed(sendPrivate(state, { sessionId: id(1), targetPseudo: "Lola", text: "re" }, now, random).effects, "privateMessage")).toHaveLength(1);
  });

  it("buffers for an away target and opens its side silently (BR-013)", () => {
    const { state: start, id, random } = hubWith({ pseudo: "Lola" }, { pseudo: "Max" });
    const state = socketLost(start, id(1), T0).state;

    const sent = sendPrivate(state, { sessionId: id(0), targetPseudo: "Max", text: "tu es là ?" }, T0, random);

    const max = sent.state.sessions.get(id(1));
    expect(max?.status === "away" ? max.buffered.map((message) => message.text) : []).toEqual(["tu es là ?"]);
    expect(typed(sent.effects, "privateWindowOpened").map((effect) => effect.sessionId)).toEqual([id(0)]);
    expect(typed(sent.effects, "privateMessage")[0]?.recipients).toEqual([id(0)]);
    expect(windowsOf(sent.state, id(1))).toHaveLength(1);
  });

  it.each([0, 1])("echoes only to the sender when side %i ignores the other (BR-041, BR-042)", (ignorer) => {
    const { state: start, id, random } = hubWith({ pseudo: "Lola" }, { pseudo: "Max" });
    const state = ignore(start, id(ignorer), id(1 - ignorer)).state;

    const sent = sendPrivate(state, { sessionId: id(0), targetPseudo: "Max", text: "hi" }, T0, random);

    expect(typed(sent.effects, "privateMessage")[0]?.recipients).toEqual([id(0)]);
    expect(windowsOf(sent.state, id(1))).toEqual([]);
  });

  it("buffers nothing for an away target that ignores the sender", () => {
    const { state: start, id, random } = hubWith({ pseudo: "Lola" }, { pseudo: "Max" });
    const state = socketLost(ignore(start, id(1), id(0)).state, id(1), T0).state;

    const sent = sendPrivate(state, { sessionId: id(0), targetPseudo: "Max", text: "hi" }, T0, random);

    const max = sent.state.sessions.get(id(1));
    expect(max?.status === "away" ? max.buffered : undefined).toEqual([]);
    expect(windowsOf(sent.state, id(1))).toEqual([]);
  });

  it("does nothing for an unknown or away sender", () => {
    const { state: start, id, random } = hubWith({ pseudo: "Lola" }, { pseudo: "Max" });
    const away = socketLost(start, id(0), T0).state;

    expect(sendPrivate(away, { sessionId: id(0), targetPseudo: "Max", text: "hi" }, T0, random)).toEqual({ state: away, effects: [] });
    expect(sendPrivate(start, { sessionId: "nobody", targetPseudo: "Max", text: "hi" }, T0, random).effects).toEqual([]);
  });
});

describe("closePrivate (D1)", () => {
  it("closes one side, then deletes the conversation when both are closed", () => {
    const { state, id, random } = hubWith({ pseudo: "Lola" }, { pseudo: "Max" });
    const sent = sendPrivate(state, { sessionId: id(0), targetPseudo: "Max", text: "hi" }, T0, random);
    const [conversation] = sent.state.conversations.values();
    const conversationId = conversation?.id ?? "";

    const one = closePrivate(sent.state, id(0), conversationId);
    expect(one.state.conversations.get(conversationId)?.openFor).toEqual([id(1)]);
    expect(one.effects).toEqual([]);

    const both = closePrivate(one.state, id(1), conversationId);
    expect(both.state.conversations.size).toBe(0);
  });

  it("ignores an unknown conversation or a side already closed", () => {
    const { state, id } = hubWith({ pseudo: "Lola" });

    expect(closePrivate(state, id(0), "nope").state).toBe(state);
  });
});

describe("ignore and unignore (UC8)", () => {
  it("adds once, answers the full list, and removes", () => {
    const { state, id } = hubWith({ pseudo: "Lola" }, { pseudo: "Max" });

    const ignored = ignore(state, id(0), id(1));
    expect(ignored.effects).toEqual([{ type: "ignoreUpdated", sessionId: id(0), ignored: [id(1)] }]);
    expect(blocks(ignored.state.ignores, id(1), id(0))).toBe(true);
    expect(ignore(ignored.state, id(0), id(1)).effects).toEqual([{ type: "ignoreUpdated", sessionId: id(0), ignored: [id(1)] }]);

    const back = unignore(ignored.state, id(0), id(1));
    expect(back.effects).toEqual([{ type: "ignoreUpdated", sessionId: id(0), ignored: [] }]);
    expect(blocks(back.state.ignores, id(0), id(1))).toBe(false);
  });

  it("refuses self, an unknown target and an unknown caller", () => {
    const { state, id } = hubWith({ pseudo: "Lola" });

    expect(ignore(state, id(0), id(0)).state).toBe(state);
    expect(ignore(state, id(0), "nobody").state).toBe(state);
    expect(unignore(state, "nobody", id(0)).effects).toEqual([]);
  });

  it("caps the list at 100 (BR-044)", () => {
    const names = Array.from({ length: PRIVATE_LIMITS.maxIgnored + 1 }, (_, i) => ({ pseudo: `Chat${i}`, account: false }));
    const { state: start, id } = hubWith({ pseudo: "Lola" }, ...names);
    let state = start;
    for (let i = 1; i <= PRIVATE_LIMITS.maxIgnored; i++) state = ignore(state, id(0), id(i)).state;

    const full = ignore(state, id(0), id(PRIVATE_LIMITS.maxIgnored + 1));

    expect(full).toEqual({ state, effects: [] });
  });

  it("hides room messages of an ignored chatter from the ignorer, keeps the author's echo", () => {
    const { state: start, id } = hubWith({ pseudo: "Lola" }, { pseudo: "Max" }, { pseudo: "Zoe" });
    let state = start;
    for (const i of [0, 1, 2]) state = joinRoom(state, id(i), "lyon").state;
    state = ignore(state, id(0), id(1)).state;

    const posted = postRoom(state, { sessionId: id(1), roomId: "lyon", text: "coucou" }, T0);

    const message = posted.effects.find((effect) => effect.type === "roomMessage");
    expect(message?.type === "roomMessage" ? [...message.recipients].sort() : []).toEqual([id(1), id(2)].sort());
  });
});

describe("session close and unlink", () => {
  it("tells the open partner on leave, and forgets the ignores", () => {
    const { state: start, id, random } = hubWith({ pseudo: "Lola" }, { pseudo: "Max" }, { pseudo: "Zoe" });
    let state = sendPrivate(start, { sessionId: id(0), targetPseudo: "Max", text: "hi" }, T0, random).state;
    state = ignore(state, id(2), id(0)).state;
    state = ignore(state, id(0), id(2)).state;

    const left = leave(state, id(0));

    expect(left.state.conversations.size).toBe(0);
    expect(left.state.ignores.get(id(2))).toEqual([]);
    expect(left.state.ignores.has(id(0))).toBe(false);
    expect(left.effects).toContainEqual({ type: "partnerLeft", sessionId: id(0), pseudo: "Lola", recipients: [id(1)] });
  });

  it("tells nothing to a partner either side ignores, and hides presence from it (BR-042)", () => {
    const { state: start, id, random } = hubWith({ pseudo: "Lola" }, { pseudo: "Max" });
    let state = sendPrivate(start, { sessionId: id(0), targetPseudo: "Max", text: "hi" }, T0, random).state;
    state = ignore(state, id(0), id(1)).state;

    expect(openPartners(state, id(0))).toEqual([]);
    expect(openPartners(unignore(state, id(0), id(1)).state, id(0))).toHaveLength(1);
    expect(leave(state, id(0)).effects.filter((effect) => effect.type === "partnerLeft")).toEqual([]);
  });

  it("drops a closed session from the other ignore lists only", () => {
    const { state: start, id } = hubWith({ pseudo: "Lola" }, { pseudo: "Max" }, { pseudo: "Zoe" });
    let state = ignore(start, id(2), id(0)).state;
    state = ignore(state, id(2), id(1)).state;

    expect(forgetIgnores(state, new Set([id(0)])).ignores.get(id(2))).toEqual([id(1)]);
  });

  it("tells nobody when the partner closed its side or is away", () => {
    const { state: start, id, random } = hubWith({ pseudo: "Lola" }, { pseudo: "Max" }, { pseudo: "Zoe" });
    let state = sendPrivate(start, { sessionId: id(0), targetPseudo: "Max", text: "hi" }, T0, random).state;
    state = sendPrivate(state, { sessionId: id(0), targetPseudo: "Zoe", text: "hi" }, T0, random).state;
    const [withMax] = state.conversations.values();
    state = closePrivate(state, id(1), withMax?.id ?? "").state;
    state = socketLost(state, id(2), T0).state;

    expect(leave(state, id(0)).effects.filter((effect) => effect.type === "partnerLeft")).toEqual([]);
  });

  it("closes conversations of expired away sessions", () => {
    const { state: start, id, random } = hubWith({ pseudo: "Lola" }, { pseudo: "Max" });
    let state = sendPrivate(start, { sessionId: id(0), targetPseudo: "Max", text: "hi" }, T0, random).state;
    state = socketLost(state, id(0), T0).state;

    const expired = expireAway(state, at(10 * 60_000));

    expect(expired.state.conversations.size).toBe(0);
    expect(expired.effects).toContainEqual({ type: "partnerLeft", sessionId: id(0), pseudo: "Lola", recipients: [id(1)] });
  });

  it("closes the conversations of unlinked sessions silently", () => {
    const { state: start, id, random } = hubWith({ pseudo: "Lola" }, { pseudo: "Max" });
    const state = sendPrivate(start, { sessionId: id(0), targetPseudo: "Max", text: "hi" }, T0, random).state;

    const unlinked = unlinkOnHub(state, { by: "account", accountId: "acc-Lola" });

    expect(unlinked.unlinked).toEqual([id(0)]);
    expect(unlinked.state.conversations.size).toBe(0);
    expect(unlinkSessions(state, { by: "account", accountId: "acc-Lola" }).state.conversations.size).toBe(1);
  });

  it("closes the conversations of a resume whose account is gone, and keeps them otherwise", () => {
    const { state: start, id, random } = hubWith({ pseudo: "Lola" }, { pseudo: "Max" });
    let state = sendPrivate(start, { sessionId: id(0), targetPseudo: "Max", text: "hi" }, T0, random).state;
    state = socketLost(state, id(0), T0).state;
    const away = state.sessions.get(id(0));
    const resumeTokenHash = away?.resumeTokenHash ?? "";
    const command = { resumeTokenHash, ip: "203.0.113.9", age: 30 };

    expect(resume(state, { ...command, accountStillExists: false }, at(1), random).state.conversations.size).toBe(0);
    expect(resume(state, { ...command, accountStillExists: true }, at(1), random).state.conversations.size).toBe(1);
  });
});

describe("search (UC7)", () => {
  const people = () =>
    hubWith(
      { pseudo: "Lola", city: "Lyon" },
      { pseudo: "Maxime", city: "Paris" },
      { pseudo: "Max", city: "Lyon" },
      { pseudo: "Élodie", city: "lyon " },
    );

  it("matches pseudo contains or city equals, folded, sorted, without the searcher", () => {
    const { state, id } = people();

    expect(search(state, id(0), " MAX ").map((session) => session.pseudo)).toEqual(["Max", "Maxime"]);
    expect(search(state, id(0), "lyon").map((session) => session.pseudo)).toEqual(["Élodie", "Max"]);
    expect(search(state, id(0), "elo").map((session) => session.pseudo)).toEqual(["Élodie"]);
  });

  it("needs 2 characters, excludes blocked sessions, and matches away sessions by pseudo only", () => {
    const { state: start, id } = people();
    const state = socketLost(ignore(start, id(1), id(0)).state, id(2), T0).state;

    expect(search(state, id(0), " m ")).toEqual([]);
    expect(search(state, id(0), "max").map((session) => session.pseudo)).toEqual(["Max"]);
    expect(search(state, id(0), "lyon").map((session) => session.pseudo)).toEqual(["Élodie"]);
  });
});
