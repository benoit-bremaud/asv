import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const lint = async (file: string): Promise<string[]> => {
  const [result] = await new ESLint({ ignore: false }).lintFiles([file]);
  return (result?.messages ?? []).filter((m) => m.ruleId === "no-restricted-imports").map((m) => m.message);
};

describe("dependency rule (platform/03-component)", () => {
  it("refuses Node, runtime libraries and other folders in src/domain", async () => {
    const messages = await lint("test/fixtures/lint/domain/forbidden.ts");

    expect(messages).toHaveLength(3);
    expect(messages.join(" ")).toMatch(/no Node import/);
    expect(messages.join(" ")).toMatch(/no runtime library/);
    expect(messages.join(" ")).toMatch(/nothing from other folders/);
  });

  it("refuses a transport import in src/server", async () => {
    const messages = await lint("test/fixtures/lint/server/forbidden.ts");

    expect(messages).toEqual(["'../../../../src/transports/node' import is restricted from being used by a pattern. src/server never imports a transport."]);
  });

  it("accepts the real source tree", async () => {
    const results = await new ESLint().lintFiles(["src"]);

    expect(results.flatMap((r) => r.messages)).toEqual([]);
  });
});
