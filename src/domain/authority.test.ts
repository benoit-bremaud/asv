import { describe, expect, it } from "vitest";
import { alertDue, AUTHORITY_LIMITS, isFilingReference, parseFilingChannel, sortAlerted } from "./authority";

const T0 = new Date("2026-11-13T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

describe("parseFilingChannel (BR-104)", () => {
  it.each([
    ["PHAROS", "PHAROS"],
    ["17", "police17"],
    ["112", "emergency112"],
    ["PointDeContact", "PointDeContact"],
  ])("maps %s to %s", (typed, channel) => {
    expect(parseFilingChannel(typed)).toBe(channel);
  });

  it.each(["pharos", "police17", "18", "", "toString", "__proto__"])("refuses %j", (typed) => {
    expect(parseFilingChannel(typed)).toBeUndefined();
  });
});

describe("isFilingReference (BR-104, BR-090)", () => {
  it("accepts 1 to 100 characters, counted in code points", () => {
    expect(isFilingReference("A")).toBe(true);
    expect(isFilingReference("x".repeat(AUTHORITY_LIMITS.maxReferenceLength))).toBe(true);
    expect(isFilingReference("é".repeat(AUTHORITY_LIMITS.maxReferenceLength))).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["101 characters", "x".repeat(AUTHORITY_LIMITS.maxReferenceLength + 1)],
    ["a control character", "PV\u0007123"],
  ])("refuses %s", (_label, reference) => {
    expect(isFilingReference(reference)).toBe(false);
  });
});

describe("sortAlerted (`web-ui/08`)", () => {
  it("lists pending alerts first, oldest raised first, then the most recently filed", () => {
    const row = (id: string, status: "pending" | "filed", raised: number, filed?: number) => ({
      id,
      alert: { status, raisedAt: at(raised), filedAt: filed === undefined ? undefined : at(filed) },
    });
    const rows = [row("f-old", "filed", 0, 10), row("p-new", "pending", 5), row("f-new", "filed", 1, 20), row("p-old", "pending", 2)];

    expect(sortAlerted(rows).map((one) => one.id)).toEqual(["p-old", "p-new", "f-new", "f-old"]);
  });

  it("keeps an empty list empty", () => {
    expect(sortAlerted([])).toEqual([]);
  });
});

describe("alertDue (BR-104)", () => {
  it("is due while not accepted and younger than 7 days", () => {
    expect(alertDue({ raisedAt: T0 }, at(AUTHORITY_LIMITS.alertRetryMs - 1))).toBe(true);
  });

  it("is no longer due once accepted or 7 days old", () => {
    expect(alertDue({ raisedAt: T0, notifiedAt: at(1) }, at(2))).toBe(false);
    expect(alertDue({ raisedAt: T0 }, at(AUTHORITY_LIMITS.alertRetryMs))).toBe(false);
  });
});
