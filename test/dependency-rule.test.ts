import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/** Lints one fixture (fixtures are ignored by `pnpm lint`) and returns the restriction messages. */
const restrictions = async (file: string): Promise<string[]> => {
  const [result] = await new ESLint({ ignore: false }).lintFiles([file]);
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === "no-restricted-imports" || m.ruleId === "no-restricted-globals")
    .map((m) => m.message);
};

describe("dependency rule (platform/03-component)", () => {
  it("refuses runtime libraries, node: imports and other folders in src/domain", async () => {
    expect(await restrictions("test/fixtures/lint/domain/forbidden.ts")).toEqual([
      expect.stringContaining("no runtime library"),
      expect.stringContaining("no Node import"),
      expect.stringContaining("nothing from other folders"),
    ]);
  });

  it("refuses bare Node built-ins and Node globals in src/domain", async () => {
    expect(await restrictions("test/fixtures/lint/domain/bare-builtin.ts")).toEqual([
      expect.stringContaining("no Node import"),
      expect.stringContaining("'process'"),
    ]);
  });

  it("refuses a transport import in src/server", async () => {
    expect(await restrictions("test/fixtures/lint/server/forbidden.ts")).toEqual([
      expect.stringContaining("src/server never imports a transport"),
    ]);
  });

  it("refuses anything but zod/mini and siblings in src/shared/protocol (ADR-0015)", async () => {
    expect(await restrictions("test/fixtures/lint/protocol/forbidden.ts")).toEqual([
      expect.stringContaining("imports only zod/mini"),
      expect.stringContaining("imports only zod/mini"),
    ]);
  });
});
