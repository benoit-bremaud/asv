/** Challenges and invitations of brick 8b (BR-096); the clock is a parameter, the store the memory one. */
import { describe, expect, it } from "vitest";
import { createMemoryModeratorStore } from "./moderator-stores";
import { createCrypto } from "../../server/crypto/cipher";
import { cryptoKeysFromEnv } from "../../server/crypto/keys";
import { createModeratorOps } from "../../server/hub-moderators";
import { createModeratorIo } from "../../server/moderator-io";

const T0 = new Date("2026-11-13T10:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60_000;
const authenticate = { kind: "authenticate" } as const;
const register = (token: string) => ({ kind: "register", token }) as const;

const setup = async () => {
  const store = createMemoryModeratorStore();
  const crypto = createCrypto(await cryptoKeysFromEnv({}, false, () => undefined));
  const io = createModeratorIo({ store, crypto });
  return { store, io, ops: createModeratorOps(io) };
};

describe("challenges", () => {
  it("are single use", async () => {
    const { ops } = await setup();
    ops.keepChallenge("c1", authenticate, T0);

    expect(ops.takeChallenge("c1", authenticate, T0)).toBe(true);
    expect(ops.takeChallenge("c1", authenticate, T0)).toBe(false);
  });

  it("refuse an unknown challenge", async () => {
    const { ops } = await setup();

    expect(ops.takeChallenge("nope", authenticate, T0)).toBe(false);
  });

  it.each([
    ["just before 5 minutes", 5 * MIN - 1, true],
    ["at 5 minutes", 5 * MIN, false],
    ["after 5 minutes", 6 * MIN, false],
  ])("expire: %s gives %s", async (_label, elapsed, taken) => {
    const { ops } = await setup();
    ops.keepChallenge("c1", authenticate, T0);

    expect(ops.takeChallenge("c1", authenticate, later(elapsed))).toBe(taken);
  });

  it("are spent by a failed take, so a wrong purpose cannot be retried", async () => {
    const { ops } = await setup();
    ops.keepChallenge("c1", register("tok"), T0);

    expect(ops.takeChallenge("c1", authenticate, T0)).toBe(false);
    expect(ops.takeChallenge("c1", register("tok"), T0)).toBe(false);
  });

  it.each([
    ["authenticate kept, register asked", authenticate, register("tok")],
    ["register kept, authenticate asked", register("tok"), authenticate],
    ["register kept for another token", register("tok"), register("other")],
  ])("refuse a purpose mismatch: %s", async (_label, kept, asked) => {
    const { ops } = await setup();
    ops.keepChallenge("c1", kept, T0);

    expect(ops.takeChallenge("c1", asked, T0)).toBe(false);
  });

  it("accept a registration for the same token", async () => {
    const { ops } = await setup();
    ops.keepChallenge("c1", register("tok"), T0);

    expect(ops.takeChallenge("c1", register("tok"), T0)).toBe(true);
  });

  it("are capped at 200 pending, and room comes back once some expire", async () => {
    const { ops } = await setup();
    for (let index = 0; index < 200; index += 1) expect(ops.keepChallenge(`c${index}`, authenticate, T0)).toBe(true);

    expect(ops.keepChallenge("extra", authenticate, T0)).toBe(false);
    expect(ops.keepChallenge("extra", authenticate, later(5 * MIN))).toBe(true);
  });
});

describe("invitations and purge", () => {
  it("creates an invitation valid for 24 hours", async () => {
    const { ops, io } = await setup();

    await ops.createInvitation("Marc", "tok", T0);

    expect(await io.invitedName("tok", later(24 * 60 * MIN - 1))).toBe("Marc");
    expect(await io.invitedName("tok", later(24 * 60 * MIN))).toBeUndefined();
  });

  it("purges expired challenges and invitations on the tick", async () => {
    const { ops, store } = await setup();
    await ops.createInvitation("Marc", "tok", T0);
    ops.keepChallenge("c1", authenticate, T0);

    await ops.purge(later(24 * 60 * MIN));

    expect(store.dump().invitations).toEqual([]);
    expect(ops.takeChallenge("c1", authenticate, T0)).toBe(false);
  });
});
