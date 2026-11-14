/** BR-112: two addresses of one IPv6 /64 share every per-IP quota and every ban key. */
import { describe, expect, it } from "vitest";
import { createCrypto } from "../../server/crypto/cipher";
import { cryptoKeysFromEnv } from "../../server/crypto/keys";
import { createAccountIo } from "../../server/account-io";
import { createModerationIo } from "../../server/moderation-io";
import { createMemoryAccountStore, createMemoryVault } from "./memory-accounts";
import { createMemoryModerationStore } from "./memory-moderation";

const SAME_A = "2001:db8:0:1::1";
const SAME_B = "2001:db8:0:1:ffff::2";
const OTHER = "2001:db8:0:2::1";

const crypto = async () => createCrypto(await cryptoKeysFromEnv({}, false, () => undefined));

describe("one /64 is one key (BR-112)", () => {
  it("hashes the ban and triage IP key by the /64 prefix", async () => {
    const io = createModerationIo({ store: createMemoryModerationStore(), crypto: await crypto() });

    expect(await io.ipKeyedHash(SAME_A)).toBe(await io.ipKeyedHash(SAME_B));
    expect(await io.ipKeyedHash(SAME_A)).not.toBe(await io.ipKeyedHash(OTHER));
    expect(await io.ipKeyedHash("::ffff:203.0.113.7")).toBe(await io.ipKeyedHash("203.0.113.7"));
  });

  it("applies a ban written for one address to the other addresses of its /64", async () => {
    const io = createModerationIo({ store: createMemoryModerationStore(), crypto: await crypto() });
    const until = new Date("2026-11-14T10:00:00Z");
    await io.saveBan({ ip: SAME_A, pseudo: "Max", until, decidedBy: "Marc" }, "r1", "b1", new Date("2026-11-13T10:00:00Z"));

    expect(await io.activeBan(SAME_B, "Autre", new Date("2026-11-13T11:00:00Z"))).toEqual({ until });
    expect(await io.activeBan(OTHER, "Autre", new Date("2026-11-13T11:00:00Z"))).toBeUndefined();
  });

  it("counts the sign-in codes of one /64 together (BR-072)", async () => {
    const keys = await crypto();
    const store = createMemoryAccountStore();
    const accounts = createAccountIo({ store, vault: createMemoryVault(), crypto: keys });
    const now = new Date("2026-11-13T10:00:00Z");
    const first = await accounts.codeFacts("a@example.org", SAME_A, now);
    await store.recordCodeIssued(first.emailKeyedHash, first.ipKeyedHash, now);

    expect((await accounts.codeFacts("b@example.org", SAME_B, now)).facts.ipCodesLastHour).toBe(1);
    expect((await accounts.codeFacts("b@example.org", OTHER, now)).facts.ipCodesLastHour).toBe(0);
  });
});
