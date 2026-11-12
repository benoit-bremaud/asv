import { describe, expect, it } from "vitest";
import { STRINGS } from "./strings";

describe("STRINGS.pseudoButton", () => {
  it.each([
    ["a present member", false, false, "bob, actions"],
    ["an away member", true, false, "bob (absent), actions"],
    ["an ignored member", false, true, "bob (ignoré), actions"],
    ["an away and ignored member", true, true, "bob (absent) (ignoré), actions"],
  ])("starts with the visible text for %s (#153)", (_case, away, ignored, name) => {
    expect(STRINGS.pseudoButton("bob", away, ignored)).toBe(name);
  });
});
