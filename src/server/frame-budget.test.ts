import { describe, expect, it } from "vitest";
import { createFrameBudget, FRAME_LIMITS } from "./frame-budget";

const takeMany = (take: () => boolean, count: number) => Array.from({ length: count }, take);

describe("frame budget (BR-088)", () => {
  it("lets a full burst through, then refuses the next frame", () => {
    const budget = createFrameBudget(0);

    const burst = takeMany(() => budget.take(0), FRAME_LIMITS.burst);

    expect(burst.every(Boolean)).toBe(true);
    expect(budget.take(0)).toBe(false);
  });

  it("refills perSecond tokens a second, never above the burst", () => {
    const budget = createFrameBudget(0);
    takeMany(() => budget.take(0), FRAME_LIMITS.burst);

    const afterOneSecond = takeMany(() => budget.take(1000), FRAME_LIMITS.perSecond + 1);
    const afterAnHour = takeMany(() => budget.take(3_601_000), FRAME_LIMITS.burst + 1);

    expect(afterOneSecond.filter(Boolean)).toHaveLength(FRAME_LIMITS.perSecond);
    expect(afterAnHour.filter(Boolean)).toHaveLength(FRAME_LIMITS.burst);
  });

  it("never refuses a steady pace at the refill rate", () => {
    const budget = createFrameBudget(0);
    const step = 1000 / FRAME_LIMITS.perSecond;

    const steady = Array.from({ length: 1000 }, (_, i) => budget.take(i * step));

    expect(steady.every(Boolean)).toBe(true);
  });
});
