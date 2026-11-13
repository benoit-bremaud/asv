/** Moderator stores of the Node transport (BR-099): memory semantics, then the file store on a real temp dir. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModeratorStore, StoredInvitation, StoredModerator } from "../../domain";
import { createFileModeratorStore, createMemoryModeratorStore } from "./moderator-stores";

const T0 = new Date("2026-11-13T10:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);

const invitation = (tokenHash: string, nameKeyedHash: string, expiresAt: Date): StoredInvitation => ({ tokenHash, nameKeyedHash, name: `enc-${tokenHash}`, expiresAt });
const moderator = (nameKeyedHash: string, credentialKeyedHash: string): StoredModerator => ({
  nameKeyedHash,
  credentialKeyedHash,
  name: "enc-name",
  credentialId: "enc-id",
  publicKey: "enc-pk",
  signCount: 0,
});

/** Enrols `moderator` through a fresh invitation, as `moderator-io` does. */
const enrol = async (store: ModeratorStore, saved: StoredModerator) => {
  await store.saveInvitation(invitation(`t-${saved.credentialKeyedHash}`, saved.nameKeyedHash, later(1000)));
  return store.enrollModerator(`t-${saved.credentialKeyedHash}`, saved, T0);
};

describe("memory moderator store", () => {
  it("finds an unexpired invitation only", async () => {
    const store = createMemoryModeratorStore();
    await store.saveInvitation(invitation("t1", "n1", later(1000)));

    expect(await store.findInvitation("t1", T0)).toMatchObject({ tokenHash: "t1" });
    expect(await store.findInvitation("t1", later(1000))).toBeUndefined();
    expect(await store.findInvitation("zz", T0)).toBeUndefined();
  });

  it("enrols once per invitation, and not on an expired one", async () => {
    const store = createMemoryModeratorStore();
    await store.saveInvitation(invitation("t1", "n1", later(1000)));
    await store.saveInvitation(invitation("t2", "n2", later(10)));

    expect(await store.enrollModerator("t1", moderator("n1", "c1"), T0)).toBe(true);
    expect(await store.enrollModerator("t1", moderator("n1", "c9"), T0)).toBe(false);
    expect(await store.enrollModerator("t2", moderator("n2", "c2"), later(10))).toBe(false);
    expect(store.dump().moderators.map((m) => m.credentialKeyedHash)).toEqual(["c1"]);
    expect(store.dump().invitations.map((i) => i.tokenHash)).toEqual(["t2"]);
  });

  it("keeps memory unchanged when the write fails, so the invitation still works", async () => {
    let failing = true;
    const store = createMemoryModeratorStore(undefined, () => { if (failing) throw new Error("ENOSPC"); });
    failing = false;
    await store.saveInvitation(invitation("t1", "n1", later(1000)));
    failing = true;

    await expect(store.enrollModerator("t1", moderator("n1", "c1"), T0)).rejects.toThrow("ENOSPC");

    expect(store.dump()).toEqual({ moderators: [], invitations: [invitation("t1", "n1", later(1000))] });
    failing = false;
    expect(await store.enrollModerator("t1", moderator("n1", "c1"), T0)).toBe(true);
  });

  it("saves, finds by credential and updates the sign count", async () => {
    const store = createMemoryModeratorStore();
    await enrol(store, moderator("n1", "c1"));

    await store.updateSignCount("c1", 5);
    await store.updateSignCount("missing", 8);

    expect((await store.findByCredential("c1"))?.signCount).toBe(5);
    expect(await store.findByCredential("missing")).toBeUndefined();
    expect(store.dump().moderators).toHaveLength(1);
  });

  it("deletes a moderator and the pending invitations of its name", async () => {
    const store = createMemoryModeratorStore();
    await enrol(store, moderator("n1", "c1"));
    await store.saveInvitation(invitation("t1", "n1", later(1000)));
    await store.saveInvitation(invitation("t2", "n2", later(1000)));

    expect(await store.deleteModerator("n1")).toBe(true);
    expect(store.dump().invitations.map((i) => i.tokenHash)).toEqual(["t2"]);
    expect(await store.deleteModerator("n1")).toBe(false);
  });

  it("deletes a name that only has an invitation", async () => {
    const store = createMemoryModeratorStore();
    await store.saveInvitation(invitation("t1", "n1", later(1000)));

    expect(await store.deleteModerator("n1")).toBe(true);
  });

  it("purges expired invitations and announces changes only when something changed", async () => {
    const onChange = vi.fn();
    const store = createMemoryModeratorStore(undefined, onChange);
    await store.saveInvitation(invitation("t1", "n1", later(10)));
    onChange.mockClear();

    await store.purgeExpiredInvitations(T0);
    expect(onChange).not.toHaveBeenCalled();
    await store.purgeExpiredInvitations(later(10));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(store.dump().invitations).toEqual([]);
  });

  it("starts from an initial snapshot", async () => {
    const store = createMemoryModeratorStore({ moderators: [moderator("n1", "c1")], invitations: [] });

    expect(await store.findByCredential("c1")).toBeDefined();
  });
});

describe("file moderator store", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "asv-mod-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("starts empty when the file does not exist, creating the folder", () => {
    const path = join(dir, "sub", "moderators.json");

    const store = createFileModeratorStore(path);

    expect(store.dump()).toEqual({ moderators: [], invitations: [] });
    expect(existsSync(join(dir, "sub"))).toBe(true);
  });

  it("persists moderators and invitations (dates restored) across a reload", async () => {
    const path = join(dir, "moderators.json");
    const first = createFileModeratorStore(path);
    await enrol(first, moderator("n1", "c1"));
    await first.saveInvitation(invitation("t1", "n2", later(1000)));

    const second = createFileModeratorStore(path);

    expect(await second.findByCredential("c1")).toMatchObject({ nameKeyedHash: "n1" });
    expect(await second.findInvitation("t1", T0)).toMatchObject({ expiresAt: later(1000) });
    expect(await second.findInvitation("t1", later(1000))).toBeUndefined();
  });

  it("persists a sign count and a revocation", async () => {
    const path = join(dir, "moderators.json");
    const first = createFileModeratorStore(path);
    await enrol(first, moderator("n1", "c1"));
    await first.updateSignCount("c1", 4);
    expect((await createFileModeratorStore(path).findByCredential("c1"))?.signCount).toBe(4);

    await first.deleteModerator("n1");

    expect(createFileModeratorStore(path).dump().moderators).toEqual([]);
  });

  it("writes the file with mode 0600 and leaves no temporary file", async () => {
    const path = join(dir, "moderators.json");
    const store = createFileModeratorStore(path);

    await enrol(store, moderator("n1", "c1"));

    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it("tightens a loose existing file to 0600 on load", () => {
    const path = join(dir, "moderators.json");
    writeFileSync(path, JSON.stringify({ moderators: [], invitations: [] }), { mode: 0o644 });

    createFileModeratorStore(path);

    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("loads a file with missing sections as empty", () => {
    const path = join(dir, "moderators.json");
    writeFileSync(path, "{}");

    expect(createFileModeratorStore(path).dump()).toEqual({ moderators: [], invitations: [] });
  });

  it("stops the start on an unreadable file instead of losing moderators", () => {
    const path = join(dir, "moderators.json");
    writeFileSync(path, "{not json");

    expect(() => createFileModeratorStore(path)).toThrow();
    expect(readFileSync(path, "utf8")).toBe("{not json");
  });

  it("keeps an existing folder's mode", () => {
    const sub = join(dir, "shared");
    mkdirSync(sub, { mode: 0o755 });
    // mkdir mode is masked by umask; read back what we got, then check it is unchanged.
    const before = statSync(sub).mode & 0o777;

    createFileModeratorStore(join(sub, "moderators.json"));

    expect(statSync(sub).mode & 0o777).toBe(before);
  });
});
