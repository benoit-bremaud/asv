import { describe, expect, it } from "vitest";

import { hasForbiddenChar } from "./text";

describe("hasForbiddenChar (BR-090)", () => {
  it.each([
    ["NUL", "a\u0000b"],
    ["a tab", "a\tb"],
    ["a line feed", "a\nb"],
    ["DEL", "a\u007Fb"],
    ["a C1 control", "a\u0085b"],
    ["the Arabic letter mark", "a\u061Cb"],
    ["a zero-width space", "a\u200Bb"],
    ["a left-to-right mark", "a\u200Eb"],
    ["a right-to-left mark", "a\u200Fb"],
    ["a paragraph separator", "a\u2029b"],
    ["a left-to-right embedding", "a\u202Ab"],
    ["a right-to-left override", "gpj.\u202Eexe"],
    ["a word joiner", "a\u2060b"],
    ["an invisible plus", "a\u2064b"],
    ["a left-to-right isolate", "a\u2066b"],
    ["a pop directional isolate", "a\u2069b"],
    ["a byte order mark", "\uFEFFab"],
  ])("finds %s", (_label, text) => {
    expect(hasForbiddenChar(text)).toBe(true);
  });

  it.each([
    ["plain French text", "Salut Hélène, ça va ? :)"],
    ["an emoji sequence with joiners", "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}"],
    ["a zero-width non-joiner", "می\u200Cخواهم"],
    ["Arabic text", "مرحبا"],
    ["the characters around the ranges", "\u200D\u2027\u2065\u206A\uFEFE"],
  ])("accepts %s", (_label, text) => {
    expect(hasForbiddenChar(text)).toBe(false);
  });
});
