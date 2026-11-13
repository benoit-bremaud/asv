import { describe, expect, it } from "vitest";
import type { Report } from "./moderation";
import { applyFloor, emptyTriageQuota, pseudonymise, queueUrgency, sortForQueue, takeTriageSlot, TRIAGE_LIMITS, type Triage, type TriageQuota } from "./triage";

const T0 = new Date("2026-11-13T10:00:00Z");
const report = (overrides: Partial<Report> = {}): Report => ({
  id: "r1",
  reason: "harassment",
  targetKind: "chatter",
  targetPseudo: "Max",
  excerpt: "",
  context: [],
  authorPseudo: "Lola",
  createdAt: T0,
  ...overrides,
});

describe("pseudonymise (BR-100)", () => {
  it("labels the target first, then authors and mentions in order, ignoring case and accents", () => {
    const { input, labels } = pseudonymise(
      report({ context: ["Hélène: salut MAX et zoé", "Zoé: helene."] }),
      ["Max", "Hélène", "Zoé"],
    );

    expect(input).toEqual({ reason: "harassment", targetKind: "chatter", lines: ["[B]: salut [A] et [C]", "[C]: [B]."] });
    expect(labels).toEqual([
      { label: "[A]", pseudo: "Max" },
      { label: "[B]", pseudo: "Hélène" },
      { label: "[C]", pseudo: "Zoé" },
    ]);
  });

  it("keeps words that only contain a pseudo, and lines without an author", () => {
    const { input } = pseudonymise(report({ context: ["Maxime dit: bonjour", "--"] }), ["Max"]);

    expect(input.lines).toEqual(["Maxime dit: bonjour", "--"]);
  });

  it("masks e-mails and phone numbers, even when they hold a pseudo", () => {
    const { input } = pseudonymise(report({ context: ["Lola: écris à max@example.org ou au 06 12 34 56 78 ou +33612345678"] }), ["Max"]);

    expect(input.lines).toEqual(["[B]: écris à [e-mail] ou au [téléphone] ou [téléphone]"]);
  });

  it("adds the excerpt as the target's line on a message report, and as plain text otherwise", () => {
    expect(pseudonymise(report({ targetKind: "message", excerpt: "lola !" }), ["Lola"]).input.lines).toEqual(["[A]: [B] !"]);
    expect(pseudonymise(report({ targetKind: "room", targetPseudo: undefined, targetRoomId: "lyon", excerpt: "texte" }), []).input.lines).toEqual(["texte"]);
  });

  it("names labels past Z with two letters", () => {
    const pseudos = Array.from({ length: 28 }, (_, n) => `p${String(n).padStart(2, "0")}`);
    const { labels } = pseudonymise(report({ targetPseudo: undefined, context: [pseudos.join(" ")] }), pseudos);

    expect(labels.map(({ label }) => label).slice(24)).toEqual(["[Y]", "[Z]", "[AA]", "[AB]"]);
  });
});

describe("applyFloor and queueUrgency (BR-101, BR-102)", () => {
  const low: Triage = { category: "none", urgency: "low", summary: "rien" };

  it.each(["seemsMinor", "illegalContent"] as const)("raises low to medium on %s", (reason) => {
    expect(applyFloor(reason, low).urgency).toBe("medium");
    expect(queueUrgency({ reason })).toBe("medium");
  });

  it("keeps the AI urgency on other reasons and above the floor", () => {
    expect(applyFloor("spam", low)).toBe(low);
    expect(applyFloor("seemsMinor", { ...low, urgency: "high" }).urgency).toBe("high");
    expect(queueUrgency({ reason: "spam" })).toBe("unknown");
    expect(queueUrgency({ reason: "spam", triage: { urgency: "low" } })).toBe("low");
  });
});

describe("sortForQueue (BR-102)", () => {
  it("sorts high, medium, unknown, low, then oldest first, without changing its input", () => {
    const at = (ms: number) => new Date(T0.getTime() + ms);
    const input = [
      { id: "low", reason: "spam" as const, createdAt: at(0), triage: { urgency: "low" as const } },
      { id: "unknown", reason: "other" as const, createdAt: at(1) },
      { id: "floor", reason: "seemsMinor" as const, createdAt: at(3) },
      { id: "medium", reason: "spam" as const, createdAt: at(2), triage: { urgency: "medium" as const } },
      { id: "high", reason: "spam" as const, createdAt: at(4), triage: { urgency: "high" as const } },
    ];

    expect(sortForQueue(input).map(({ id }) => id)).toEqual(["high", "medium", "floor", "unknown", "low"]);
    expect(input[0]?.id).toBe("low");
  });
});

describe("takeTriageSlot (BR-101)", () => {
  const fill = (quota: TriageQuota, keys: readonly string[], times: number): TriageQuota => {
    let current = quota;
    for (let n = 0; n < times; n++) current = takeTriageSlot(current, keys, T0) ?? current;
    return current;
  };

  it("counts every key and refuses once one key reaches 20 calls in the UTC day", () => {
    const full = fill(emptyTriageQuota, ["ip:a", "account:x"], TRIAGE_LIMITS.callsPerReporterPerDay);

    expect(takeTriageSlot(full, ["ip:a"], T0)).toBeUndefined();
    expect(takeTriageSlot(full, ["ip:b", "account:x"], T0)).toBeUndefined();
    expect(takeTriageSlot(full, ["ip:b"], T0)?.total).toBe(21);
  });

  it("refuses the 201st call of the day in all, and starts again the next UTC day", () => {
    const keys = Array.from({ length: TRIAGE_LIMITS.callsPerDay }, (_, n) => `ip:${n}`);
    const full = keys.reduce<TriageQuota>((quota, key) => takeTriageSlot(quota, [key], T0) ?? quota, emptyTriageQuota);

    expect(full.total).toBe(200);
    expect(takeTriageSlot(full, ["ip:new"], T0)).toBeUndefined();
    expect(takeTriageSlot(full, ["ip:new"], new Date("2026-11-14T00:00:00Z"))).toMatchObject({ day: "2026-11-14", total: 1 });
  });
});
