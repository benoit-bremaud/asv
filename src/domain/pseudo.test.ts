import { describe, expect, it } from "vitest";
import { containsReservedWord, foldPseudo, hasValidPseudoFormat } from "./pseudo";

describe("BR-001 pseudo format", () => {
  it.each(["abc", "nath_lune", "a.b-c_9", "Hélène", "François", "x".repeat(20)])("accepts %s", (pseudo) => {
    expect(hasValidPseudoFormat(pseudo)).toBe(true);
  });

  it.each(["ab", "x".repeat(21), "with space", "émoji😀", "Неlene", "ñandu", "a/b", ""])("refuses %s", (pseudo) => {
    expect(hasValidPseudoFormat(pseudo)).toBe(false);
  });

  it("counts a decomposed accent as one character", () => {
    expect(hasValidPseudoFormat("e\u0301te")).toBe(true);
  });
});

describe("BR-002 folding", () => {
  it("ignores case and accents", () => {
    expect(foldPseudo("Hélène")).toBe(foldPseudo("HELENE"));
  });
});

describe("BR-003 reserved words", () => {
  it.each(["admin", "MonModo", "Modérateur", "super_ASV", "xAdMiNx"])("refuses %s", (pseudo) => {
    expect(containsReservedWord(pseudo)).toBe(true);
  });

  it("accepts an ordinary pseudo", () => {
    expect(containsReservedWord("nath_lune")).toBe(false);
  });
});
