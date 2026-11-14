import { describe, expect, it } from "vitest";
import { STATEMENT_RETRY_MS } from "../../server/moderation-mail";
import { nextAlarmAt, PURGE_EVERY_MS, purgeDue } from "./alarm";

const NOW = 1_000_000_000;

describe("Hub alarm (BR-110)", () => {
  it("purges on first run and once a day", () => {
    expect(purgeDue(NOW, undefined)).toBe(true);
    expect(purgeDue(NOW, NOW - PURGE_EVERY_MS + 1)).toBe(false);
    expect(purgeDue(NOW, NOW - PURGE_EVERY_MS)).toBe(true);
  });

  it("wakes for the next purge when nothing is pending", () => {
    expect(nextAlarmAt(NOW, NOW, false)).toBe(NOW + PURGE_EVERY_MS);
  });

  it("wakes for the next retry round while a mail is pending, the purge if sooner", () => {
    expect(nextAlarmAt(NOW, NOW, true)).toBe(NOW + STATEMENT_RETRY_MS);
    expect(nextAlarmAt(NOW, NOW - PURGE_EVERY_MS + 5000, true)).toBe(NOW + 5000);
  });

  it("never schedules in the past", () => {
    expect(nextAlarmAt(NOW, NOW - 3 * PURGE_EVERY_MS, false)).toBe(NOW + 1000);
  });
});
