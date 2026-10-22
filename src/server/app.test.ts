import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("createApp", () => {
  it("builds an app with no route yet", async () => {
    const response = await createApp().request("/");

    expect(response.status).toBe(404);
  });
});
