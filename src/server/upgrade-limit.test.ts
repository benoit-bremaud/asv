import { describe, expect, it } from "vitest";
import { createUpgradeLimiter, UPGRADE_LIMITS } from "./upgrade-limit";

const admitMany = (admit: () => string, count: number) => Array.from({ length: count }, admit);

describe("upgrade limiter (BR-089)", () => {
  it("admits perIp sockets of one IP, then refuses the next with perIp once tokens are back", () => {
    const limiter = createUpgradeLimiter();
    const first = admitMany(() => limiter.admit("a", 0), UPGRADE_LIMITS.perIp);

    expect(first.every((verdict) => verdict === "ok")).toBe(true);
    expect(limiter.admit("a", 60_000)).toBe("perIp");
    expect(limiter.admit("b", 60_000)).toBe("ok");
  });

  it("refuses with rate once the burst is spent, and refills perSecond tokens a second", () => {
    const limiter = createUpgradeLimiter();
    admitMany(() => limiter.admit("a", 0), UPGRADE_LIMITS.burst);
    for (let i = 0; i < UPGRADE_LIMITS.burst; i += 1) limiter.release("a");

    expect(limiter.admit("a", 0)).toBe("rate");
    expect(limiter.admit("a", 1000)).toBe("ok");
    expect(limiter.admit("a", 1000)).toBe("rate");
  });

  it("charges refused upgrades too, so a client hammering a full cap drains its budget", () => {
    const limiter = createUpgradeLimiter();
    admitMany(() => limiter.admit("a", 0), UPGRADE_LIMITS.perIp);
    limiter.release("a");

    expect(limiter.admit("a", 0)).toBe("rate");
  });

  it("refuses with total when every IP together holds the total cap", () => {
    const limiter = createUpgradeLimiter();
    const ips = Math.ceil(UPGRADE_LIMITS.total / UPGRADE_LIMITS.perIp);
    for (let ip = 0; ip < ips; ip += 1) admitMany(() => limiter.admit(`ip${ip}`, 0), UPGRADE_LIMITS.perIp);

    expect(limiter.admit("late", 0)).toBe("total");
    limiter.release("ip0");
    expect(limiter.admit("late", 0)).toBe("ok");
  });

  it("gives a released place back once, and ignores releases it never admitted", () => {
    const limiter = createUpgradeLimiter();
    admitMany(() => limiter.admit("a", 0), UPGRADE_LIMITS.perIp);
    limiter.release("a");
    limiter.release("unknown");

    expect(limiter.admit("a", 60_000)).toBe("ok");
    expect(limiter.admit("a", 60_000)).toBe("perIp");
  });

  it("prunes an idle full bucket only, so an IP keeps its spent budget until it refills", () => {
    const limiter = createUpgradeLimiter();
    admitMany(() => limiter.admit("a", 0), UPGRADE_LIMITS.burst);
    for (let i = 0; i < UPGRADE_LIMITS.burst; i += 1) limiter.release("a");

    limiter.prune(1000);
    expect(limiter.admit("a", 1000)).toBe("ok");
    limiter.release("a");
    limiter.prune(1000);
    expect(limiter.admit("a", 1000)).toBe("rate");

    limiter.prune(60_000);
    expect(admitMany(() => limiter.admit("a", 60_000), UPGRADE_LIMITS.burst).every((v) => v === "ok")).toBe(true);
  });
});
