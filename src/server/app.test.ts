import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("createApp", () => {
  const app = createApp({ stats: () => ({ connected: 3 }) });

  it("serves the connected count, uncached", async () => {
    const response = await app.request("/api/stats");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ connected: 3 });
  });

  it("has no other route", async () => {
    expect((await app.request("/")).status).toBe(404);
  });
});
