/** Moderator storage over the real crypto (ADR-0017) and the memory store; nothing is mocked. */
import { describe, expect, it } from "vitest";
import { createMemoryModeratorStore } from "./moderator-stores";
import { createCrypto } from "../../server/crypto/cipher";
import { cryptoKeysFromEnv } from "../../server/crypto/keys";
import { createModeratorIo, invitationTokenHash } from "../../server/moderator-io";

const T0 = new Date("2026-11-13T10:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);
const DAY = 24 * 60 * 60_000;

const setup = async () => {
  const store = createMemoryModeratorStore();
  const crypto = createCrypto(await cryptoKeysFromEnv({}, false, () => undefined));
  return { store, io: createModeratorIo({ store, crypto }) };
};

describe("invitations", () => {
  it("saves an invitation and finds the invited name until it expires", async () => {
    const { io } = await setup();
    await io.saveInvitation("tok", "Marc", later(DAY));

    expect(await io.invitedName("tok", T0)).toBe("Marc");
    expect(await io.invitedName("tok", later(DAY - 1))).toBe("Marc");
    expect(await io.invitedName("tok", later(DAY))).toBeUndefined();
  });

  it("does not know another token", async () => {
    const { io } = await setup();
    await io.saveInvitation("tok", "Marc", later(DAY));

    expect(await io.invitedName("other", T0)).toBeUndefined();
  });

  it("hashes a token deterministically, without the token in the hash", async () => {
    expect(await invitationTokenHash("tok")).toBe(await invitationTokenHash("tok"));
    expect(await invitationTokenHash("tok")).not.toBe(await invitationTokenHash("tok2"));
    expect(await invitationTokenHash("tok")).toMatch(/^[\w-]{43}$/);
  });

  it("purges expired invitations only", async () => {
    const { io, store } = await setup();
    await io.saveInvitation("old", "Marc", later(1000));
    await io.saveInvitation("new", "Lola", later(DAY));

    await io.purgeExpiredInvitations(later(1000));

    expect(store.dump().invitations).toHaveLength(1);
    expect(await io.invitedName("new", later(1000))).toBe("Lola");
  });
});

describe("enroll", () => {
  it("consumes the invitation once and returns the name", async () => {
    const { io } = await setup();
    await io.saveInvitation("tok", "Marc", later(DAY));

    expect(await io.enroll("tok", "cred1", "pk1", 0, T0)).toBe("Marc");
    expect(await io.enroll("tok", "cred2", "pk2", 0, T0)).toBeUndefined();
    expect(await io.invitedName("tok", T0)).toBeUndefined();
    expect(await io.byCredential("cred2")).toBeUndefined();
  });

  it("refuses an expired or unknown invitation", async () => {
    const { io } = await setup();
    await io.saveInvitation("tok", "Marc", later(1000));

    expect(await io.enroll("tok", "c", "pk", 0, later(1000))).toBeUndefined();
    expect(await io.enroll("none", "c", "pk", 0, T0)).toBeUndefined();
  });

  it("finds the moderator by credential with the name, key and counter in clear", async () => {
    const { io } = await setup();
    await io.saveInvitation("tok", "Marc", later(DAY));
    await io.enroll("tok", "cred1", "pk1", 7, T0);

    expect(await io.byCredential("cred1")).toEqual({ name: "Marc", credentialId: "cred1", publicKey: "pk1", signCount: 7 });
    expect(await io.byCredential("unknown")).toBeUndefined();
  });

  it("stores no clear name, credential id or public key", async () => {
    const { io, store } = await setup();
    await io.saveInvitation("tok-secret", "Marc", later(DAY));
    expect(JSON.stringify(store.dump())).not.toMatch(/Marc|tok-secret/);

    await io.enroll("tok-secret", "cred-secret", "pk-secret", 0, T0);

    expect(JSON.stringify(store.dump())).not.toMatch(/Marc|cred-secret|pk-secret|tok-secret/);
  });
});

describe("sign count and revocation", () => {
  const enrolled = async () => {
    const context = await setup();
    await context.io.saveInvitation("tok", "Marc", later(DAY));
    await context.io.enroll("tok", "cred1", "pk1", 1, T0);
    return context;
  };

  it("updates the sign count", async () => {
    const { io } = await enrolled();

    await io.updateSignCount("cred1", 9);

    expect((await io.byCredential("cred1"))?.signCount).toBe(9);
  });

  it("ignores a sign count for an unknown credential", async () => {
    const { io, store } = await enrolled();
    const before = JSON.stringify(store.dump());

    await io.updateSignCount("unknown", 9);

    expect(JSON.stringify(store.dump())).toBe(before);
  });

  it("revokes by name, whatever its case, and says false the second time", async () => {
    const { io } = await enrolled();

    expect(await io.revoke("MARC")).toBe(true);
    expect(await io.byCredential("cred1")).toBeUndefined();
    expect(await io.revoke("Marc")).toBe(false);
  });

  it("removes the pending invitations of the revoked name", async () => {
    const { io } = await setup();
    await io.saveInvitation("tok", "Marc", later(DAY));

    expect(await io.revoke("Marc")).toBe(true);
    expect(await io.invitedName("tok", T0)).toBeUndefined();
  });

  it("revokes an unknown name as false", async () => {
    const { io } = await setup();

    expect(await io.revoke("Nobody")).toBe(false);
  });
});
