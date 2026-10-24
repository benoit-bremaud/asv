/**
 * Hub account flow (UC17 to UC19, `accounts/02`) over the real crypto and the in-memory stores of the
 * Node transport. Only the mailer, the boundary, is a fake.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mailer } from "../../domain";
import type { ServerMessage } from "../../shared/protocol";
import { createAccountIo } from "../../server/account-io";
import { createCrypto } from "../../server/crypto/cipher";
import { cryptoKeysFromEnv } from "../../server/crypto/keys";
import { createHub, type Outgoing } from "../../server/hub";
import { createMemoryAccountStore, createMemoryVault } from "./memory-accounts";
import { createMemoryLog } from "./memory-log";
import { createNodeRandom } from "./random";

afterEach(() => vi.restoreAllMocks());

const T0 = new Date("2026-10-23T10:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);
const EMAIL = "nath@example.org";

const setup = async () => {
  const random = createNodeRandom();
  const store = createMemoryAccountStore();
  const vault = createMemoryVault();
  const crypto = createCrypto(await cryptoKeysFromEnv({}, false, () => undefined));
  const sent: { email: string; code: string }[] = [];
  const mailer: Mailer = {
    sendCode: async (email, code) => void sent.push({ email, code }),
    sendStatementOfReasons: async () => true,
  };
  const onStoreError = vi.fn();
  const hub = createHub({
    officialRooms: [],
    random,
    hashToken: random.hashToken,
    log: createMemoryLog(),
    protocols: "HTTP/1.1 WebSocket",
    onLogError: vi.fn(),
    closeSocket: vi.fn(),
    accounts: createAccountIo({ store, vault, crypto }),
    mailer,
    onStoreError,
  });
  let seq = 0;
  const send = (key: string, type: string, payload: object, now = T0) =>
    hub.receive(key, JSON.stringify({ type, seq: ++seq, payload }), now);
  const enterAs = async (key: string, pseudo: string, device?: string, ip = `10.0.0.${key}`) => {
    hub.open(key, ip, 4000, device && random.hashToken(device));
    const out = await send(key, "enter", { pseudo, age: 30, adultConfirmed: true, termsAccepted: true });
    return only(out, "entered").payload;
  };
  /** Requests and verifies a code; returns the `accountLinked` payload. */
  const signIn = async (key: string, remember = true, email = EMAIL, now = T0) => {
    only(await send(key, "requestCode", { email, remember }, now), "codeSent");
    const code = sent.at(-1)?.code ?? "";
    return only(await send(key, "verifyCode", { code }, now), "accountLinked").payload;
  };
  return { hub, store, vault, crypto, sent, send, enterAs, signIn, onStoreError, random };
};

const find = <T extends ServerMessage["type"]>(out: Outgoing[], type: T) =>
  out.filter((o): o is Outgoing & { message: Extract<ServerMessage, { type: T }> } => o.message.type === type);
const only = <T extends ServerMessage["type"]>(out: Outgoing[], type: T) => {
  const [first, ...rest] = find(out, type);
  if (!first || rest.length > 0) throw new Error(`expected one ${type}, got ${JSON.stringify(out.map((o) => o.message))}`);
  return first.message;
};
const warningOf = (out: Outgoing[]) => only(out, "warning").payload;

describe("request a code (UC17 steps 1–3)", () => {
  it("mails a six-digit code and stores only ciphertext and hashes", async () => {
    const { enterAs, send, sent, store } = await setup();
    await enterAs("1", "Lola");

    const out = await send("1", "requestCode", { email: "  Nath@Example.org ", remember: false });

    only(out, "codeSent");
    expect(sent).toEqual([{ email: EMAIL, code: expect.stringMatching(/^\d{6}$/) }]);
    const [code] = store.dump().codes;
    expect(JSON.stringify(code)).not.toContain("nath");
    expect(Object.values(code ?? {})).not.toContain(sent[0]?.code);
  });

  it.each([
    ["an invalid address", "nath", "emailInvalid"],
    ["a disposable domain", "x@yopmail.com", "disposable"],
  ])("refuses %s with a reason and sends nothing", async (_, email, reason) => {
    const { enterAs, send, sent } = await setup();
    await enterAs("1", "Lola");

    expect(warningOf(await send("1", "requestCode", { email, remember: false }))).toMatchObject({ code: reason });
    expect(sent).toEqual([]);
  });

  it("refuses the eleventh code from one IP within an hour", async () => {
    const { enterAs, send } = await setup();
    await enterAs("1", "Lola");
    for (let index = 0; index < 10; index += 1) {
      only(await send("1", "requestCode", { email: `n${index}@example.org`, remember: false }), "codeSent");
    }

    expect(warningOf(await send("1", "requestCode", { email: "n10@example.org", remember: false }))).toMatchObject({ code: "rate" });
  });

  it("answers codeSent but sends nothing during the cooldown, over the e-mail quota or for a blocked e-mail", async () => {
    const { enterAs, send, sent, store, crypto } = await setup();
    await enterAs("1", "Lola");
    const ask = (now: Date, email = EMAIL) => send("1", "requestCode", { email, remember: false }, now);

    only(await ask(T0), "codeSent");
    only(await ask(later(59_000)), "codeSent");
    expect(sent).toHaveLength(1);
    only(await ask(later(60_000)), "codeSent");
    only(await ask(later(120_000)), "codeSent");
    only(await ask(later(180_000)), "codeSent");
    expect(sent).toHaveLength(3);

    store.block(await crypto.keyedHash("blocked@example.org"), later(10_000_000));
    only(await ask(T0, "blocked@example.org"), "codeSent");
    expect(sent).toHaveLength(3);
  });

  it("requires a session", async () => {
    const { hub, send } = await setup();
    hub.open("1", "ip");
    expect(only(await send("1", "requestCode", { email: EMAIL, remember: false }), "error").payload.code).toBe("forbidden");
  });

  it.each([
    ["verifyCode", { code: "123456" }],
    ["signOutEverywhere", {}],
    ["deleteAccount", {}],
  ] as const)("answers unavailable when %s hits a failing store", async (type, payload) => {
    const { enterAs, signIn, send, store, onStoreError } = await setup();
    await enterAs("1", "Lola");
    if (type !== "verifyCode") await signIn("1", false);
    vi.spyOn(store, "loadCode").mockRejectedValue(new Error("down"));
    vi.spyOn(store, "deleteAllDevices").mockRejectedValue(new Error("down"));
    vi.spyOn(store, "findAccountById").mockRejectedValue(new Error("down"));

    expect(warningOf(await send("1", type, payload))).toMatchObject({ code: "unavailable" });
    expect(onStoreError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("answers unavailable when a store call fails, and reports it", async () => {
    const { enterAs, send, store, onStoreError } = await setup();
    await enterAs("1", "Lola");
    vi.spyOn(store, "codeCounts").mockRejectedValueOnce(new Error("down"));

    expect(warningOf(await send("1", "requestCode", { email: EMAIL, remember: false }))).toMatchObject({ code: "unavailable" });
    expect(onStoreError).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe("wrong-try cap (BR-072)", () => {
  it("stops sending codes after 20 wrong codes for one e-mail in 24 hours, then resumes", async () => {
    const { enterAs, send, sent } = await setup();
    await enterAs("1", "Lola");
    const wrongCode = (code: string) => (code === "000000" ? "111111" : "000000");
    // Four codes of five wrong tries each, an hour apart to stay under the hourly quota.
    for (let round = 0; round < 4; round += 1) {
      const now = later(round * 60 * 60_000);
      await send("1", "requestCode", { email: EMAIL, remember: false }, now);
      for (let tryIndex = 0; tryIndex < 5; tryIndex += 1) {
        await send("1", "verifyCode", { code: wrongCode(sent.at(-1)?.code ?? "") }, now);
      }
    }
    expect(sent).toHaveLength(4);

    only(await send("1", "requestCode", { email: EMAIL, remember: false }, later(4 * 60 * 60_000)), "codeSent");
    expect(sent).toHaveLength(4);

    only(await send("1", "requestCode", { email: EMAIL, remember: false }, later(24 * 60 * 60_000 + 1)), "codeSent");
    expect(sent).toHaveLength(5);
  });

  it("does not count an expired code as a wrong try", async () => {
    const { enterAs, send, sent, store } = await setup();
    await enterAs("1", "Lola");
    const spy = vi.spyOn(store, "recordWrongTry");
    await send("1", "requestCode", { email: EMAIL, remember: false });

    await send("1", "verifyCode", { code: sent[0]?.code ?? "" }, later(10 * 60_000));

    expect(spy).not.toHaveBeenCalled();
  });
});

describe("verify the code (UC17 steps 4–6)", () => {
  it("creates the account on the first valid code, e-mail encrypted, and links the session", async () => {
    const { enterAs, signIn, store } = await setup();
    await enterAs("1", "Lola");

    const linked = await signIn("1", false);

    expect(linked.deviceClaim).toBeUndefined();
    const [account] = store.dump().accounts;
    expect(account?.id).toBe(linked.accountId);
    expect(account?.email).toMatch(/^v1\./);
    expect(store.dump().codes).toEqual([]);
  });

  it("links the same account again from another session", async () => {
    const { enterAs, signIn, store } = await setup();
    await enterAs("1", "Lola");
    await enterAs("2", "Mia");

    const first = await signIn("1", false);
    const second = await signIn("2", false, EMAIL, later(60_000));

    expect(second.accountId).toBe(first.accountId);
    expect(store.dump().accounts).toHaveLength(1);
  });

  it("counts wrong tries down and invalidates the code on the fifth", async () => {
    const { enterAs, send, sent } = await setup();
    await enterAs("1", "Lola");
    await send("1", "requestCode", { email: EMAIL, remember: false });
    const wrong = sent[0]?.code === "000000" ? "111111" : "000000";

    for (const left of [4, 3, 2, 1]) {
      expect(warningOf(await send("1", "verifyCode", { code: wrong }))).toMatchObject({ code: "codeWrong", triesLeft: left });
    }
    expect(warningOf(await send("1", "verifyCode", { code: wrong }))).toMatchObject({ code: "codeExhausted" });
    expect(warningOf(await send("1", "verifyCode", { code: sent[0]?.code ?? "" }))).toMatchObject({ code: "codeMissing" });
  });

  it("refuses an expired code and forgets it", async () => {
    const { enterAs, send, sent } = await setup();
    await enterAs("1", "Lola");
    await send("1", "requestCode", { email: EMAIL, remember: false });

    const out = await send("1", "verifyCode", { code: sent[0]?.code ?? "" }, later(10 * 60_000));

    expect(warningOf(out)).toMatchObject({ code: "codeExpired" });
  });

  it("does not accept the code of another session", async () => {
    const { enterAs, send, sent } = await setup();
    await enterAs("1", "Lola");
    await enterAs("2", "Mia");
    await send("1", "requestCode", { email: EMAIL, remember: false });
    await send("2", "requestCode", { email: "mia@example.org", remember: false });

    const out = await send("2", "verifyCode", { code: sent[0]?.code ?? "" });

    // Only fails if both codes are equal by chance (one in a million).
    if (sent[0]?.code !== sent[1]?.code) expect(warningOf(out)).toMatchObject({ code: "codeWrong" });
  });

  it("refuses at verify time an e-mail blocked since the code was sent", async () => {
    const { enterAs, send, sent, store, crypto } = await setup();
    await enterAs("1", "Lola");
    await send("1", "requestCode", { email: EMAIL, remember: false });
    store.block(await crypto.keyedHash(EMAIL), later(10_000));

    expect(warningOf(await send("1", "verifyCode", { code: sent[0]?.code ?? "" }))).toMatchObject({ code: "blocked" });
    expect(store.dump().accounts).toEqual([]);
  });

  it("restores the strikes of a self-deleted account (BR-080)", async () => {
    const { enterAs, signIn, store, crypto } = await setup();
    await enterAs("1", "Lola");
    await store.saveCarryOver(await crypto.keyedHash(EMAIL), [later(5000)]);

    await signIn("1", false);

    expect(store.dump().accounts[0]?.strikes).toEqual([{ expiresAt: later(5000) }]);
    expect(await store.loadCarryOver(await crypto.keyedHash(EMAIL))).toBeUndefined();
  });
});

describe("remembered device (BR-073)", () => {
  it("redeems the claim once, then links a new entry with that cookie", async () => {
    const { hub, enterAs, signIn, store } = await setup();
    await enterAs("1", "Lola");
    const { accountId, deviceClaim } = await signIn("1");

    const device = await hub.redeemDeviceClaim(deviceClaim ?? "", later(1000));

    expect(device?.expiresAt).toEqual(later(1000 + 30 * 24 * 60 * 60_000));
    expect(await hub.redeemDeviceClaim(deviceClaim ?? "", later(1000))).toBeUndefined();
    expect(store.dump().devices).toHaveLength(1);
    expect(JSON.stringify(store.dump().devices)).not.toContain(device?.token);
    const entered = await enterAs("2", "Mia", device?.token);
    expect(entered).toMatchObject({ accountId });
    expect(entered.staleDevice).toBeUndefined();
  });

  it("keeps the claim for a retry when the device record cannot be saved", async () => {
    const { hub, enterAs, signIn, store, onStoreError } = await setup();
    await enterAs("1", "Lola");
    const { deviceClaim } = await signIn("1");
    vi.spyOn(store, "saveDevice").mockRejectedValueOnce(new Error("down"));

    expect(await hub.redeemDeviceClaim(deviceClaim ?? "", T0)).toBeUndefined();
    expect(onStoreError).toHaveBeenCalledWith(expect.any(Error));
    expect(await hub.redeemDeviceClaim(deviceClaim ?? "", T0)).toBeDefined();
  });

  it("still unlinks the device sessions when the record cannot be deleted", async () => {
    const { hub, enterAs, signIn, store, random, onStoreError } = await setup();
    await enterAs("1", "Lola");
    const { deviceClaim } = await signIn("1");
    const device = await hub.redeemDeviceClaim(deviceClaim ?? "", T0);
    vi.spyOn(store, "deleteDevice").mockRejectedValueOnce(new Error("down"));

    const out = await hub.signOutDevice(random.hashToken(device?.token ?? ""));

    only(out, "accountUnlinked");
    expect(onStoreError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("refuses an expired claim", async () => {
    const { hub, enterAs, signIn } = await setup();
    await enterAs("1", "Lola");
    const { deviceClaim } = await signIn("1");

    expect(await hub.redeemDeviceClaim(deviceClaim ?? "", later(60_000))).toBeUndefined();
  });

  it("marks an unknown cookie as stale", async () => {
    const { enterAs } = await setup();
    expect(await enterAs("1", "Lola", "forgotten")).toMatchObject({ staleDevice: true });
  });

  it("answers unavailable when the device lookup fails", async () => {
    const { hub, send, store, random } = await setup();
    vi.spyOn(store, "accountForDevice").mockRejectedValueOnce(new Error("down"));
    hub.open("1", "ip", 1, random.hashToken("tok"));

    const out = await send("1", "enter", { pseudo: "Lola", age: 30, adultConfirmed: true, termsAccepted: true });

    expect(warningOf(out)).toMatchObject({ code: "unavailable" });
  });

  it("signs this device out: forgets the record and unlinks the sessions that used it", async () => {
    const { hub, enterAs, signIn, store, random } = await setup();
    await enterAs("1", "Lola");
    const { deviceClaim } = await signIn("1");
    const device = await hub.redeemDeviceClaim(deviceClaim ?? "", T0);
    await enterAs("2", "Mia", device?.token);

    const out = await hub.signOutDevice(random.hashToken(device?.token ?? ""));

    expect(only(out, "accountUnlinked").payload).toEqual({});
    expect(find(out, "accountUnlinked")[0]?.to.toSorted()).toEqual(["1", "2"]);
    expect(store.dump().devices).toEqual([]);
  });
});

describe("sign out everywhere and delete (UC18, UC19)", () => {
  it("signs out everywhere: every device record goes, every linked session is told", async () => {
    const { hub, enterAs, signIn, send, store } = await setup();
    await enterAs("1", "Lola");
    await enterAs("2", "Mia");
    const { deviceClaim } = await signIn("1");
    await hub.redeemDeviceClaim(deviceClaim ?? "", T0);
    await signIn("2", false, EMAIL, later(60_000));

    const out = await send("1", "signOutEverywhere", {});

    expect(find(out, "accountUnlinked")[0]?.to.toSorted()).toEqual(["1", "2"]);
    expect(store.dump().devices).toEqual([]);
    expect(store.dump().accounts).toHaveLength(1);
  });

  it("deletes the account: vault record sealed, account and devices gone (BR-081)", async () => {
    const { hub, enterAs, signIn, send, store, vault } = await setup();
    await enterAs("1", "Lola");
    const { accountId, deviceClaim } = await signIn("1");
    await hub.redeemDeviceClaim(deviceClaim ?? "", T0);

    const out = await send("1", "deleteAccount", {}, later(5000));

    only(out, "accountUnlinked");
    expect(store.dump()).toMatchObject({ accounts: [], devices: [] });
    expect(vault.entries()).toEqual([{ accountId, sealedEmail: expect.stringMatching(/^e1\./), createdAt: T0, closedAt: later(5000) }]);
    expect(vault.entries()[0]?.sealedEmail).not.toContain("nath");
  });

  it("keeps active strikes as a carry-over when the member deletes the account", async () => {
    const { enterAs, signIn, send, store, crypto } = await setup();
    await enterAs("1", "Lola");
    await store.saveCarryOver(await crypto.keyedHash(EMAIL), [later(90_000)]);
    await signIn("1", false);

    await send("1", "deleteAccount", {});

    expect(await store.loadCarryOver(await crypto.keyedHash(EMAIL))).toEqual([later(90_000)]);
  });

  it("deletes nothing when the vault write fails", async () => {
    const { enterAs, signIn, send, store, vault } = await setup();
    await enterAs("1", "Lola");
    await signIn("1", false);
    vi.spyOn(vault, "record").mockRejectedValueOnce(new Error("down"));

    expect(warningOf(await send("1", "deleteAccount", {}))).toMatchObject({ code: "unavailable" });
    expect(store.dump().accounts).toHaveLength(1);
  });

  it.each(["signOutEverywhere", "deleteAccount"])("answers notSignedIn to %s from a guest", async (type) => {
    const { enterAs, send } = await setup();
    await enterAs("1", "Lola");
    expect(warningOf(await send("1", type, {}))).toMatchObject({ code: "notSignedIn" });
  });

  it("unlinks a session whose account was already gone", async () => {
    const { enterAs, signIn, send, store } = await setup();
    await enterAs("1", "Lola");
    const { accountId } = await signIn("1", false);
    await store.deleteAccount(accountId);

    const out = await send("1", "deleteAccount", {});

    expect(only(out, "accountUnlinked").payload).toEqual({});
  });
});

describe("resume and tick", () => {
  it("resumes linked while the account exists, unlinked once it is gone", async () => {
    const { hub, enterAs, signIn, send, store } = await setup();
    const entered = await enterAs("1", "Lola");
    const { accountId } = await signIn("1", false);
    await hub.close("1", T0);
    hub.open("2", "ip");

    const resumed = only(await send("2", "resume", { resumeToken: entered.resumeToken, profile: { age: 30 } }), "resumed");
    expect(resumed.payload.accountId).toBe(accountId);

    await store.deleteAccount(accountId);
    await hub.close("2", T0);
    hub.open("3", "ip");
    const again = only(await send("3", "resume", { resumeToken: resumed.payload.resumeToken, profile: { age: 30 } }), "resumed");
    expect(again.payload.accountId).toBeUndefined();
  });

  it("answers unavailable when the account check of a resume fails", async () => {
    const { hub, enterAs, signIn, send, store } = await setup();
    const entered = await enterAs("1", "Lola");
    await signIn("1", false);
    await hub.close("1", T0);
    vi.spyOn(store, "findAccountById").mockRejectedValueOnce(new Error("down"));
    hub.open("2", "ip");

    const out = await send("2", "resume", { resumeToken: entered.resumeToken, profile: { age: 30 } });

    expect(warningOf(out)).toMatchObject({ code: "unavailable" });
  });

  it("purges expired records on tick and reports a failed purge", async () => {
    const { hub, enterAs, send, store, onStoreError } = await setup();
    await enterAs("1", "Lola");
    await send("1", "requestCode", { email: EMAIL, remember: false });

    await hub.tick(later(10 * 60_000));
    expect(store.dump().codes).toEqual([]);

    vi.spyOn(store, "purgeExpired").mockRejectedValueOnce(new Error("down"));
    await hub.tick(later(11 * 60_000));
    expect(onStoreError).toHaveBeenCalledWith(expect.any(Error));
  });
});
