import { describe, expect, it, vi } from "vitest";
import { runOwnerCommand } from "./owner-cli";

const SECRET = "s".repeat(32);
const answer = (status: number, body?: object) =>
  vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(body ? JSON.stringify(body) : null, { status }));

describe("runOwnerCommand (moderation/02f)", () => {
  it("posts the invitation on loopback with the owner secret and prints the link", async () => {
    const fetchFn = answer(201, { link: "http://localhost:5173/#mod/enroll/tok" });

    const line = await runOwnerCommand(["invite", "Marc"], { ASV_OWNER_SECRET: SECRET, ASV_PORT: "9000" }, fetchFn);

    expect(line).toContain("http://localhost:5173/#mod/enroll/tok");
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe("http://127.0.0.1:9000/mod/invitations");
    expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ name: "Marc" }), headers: { Authorization: `Bearer ${SECRET}` } });
  });

  it("deletes the moderator on the default port", async () => {
    const fetchFn = answer(204);

    expect(await runOwnerCommand(["revoke", "Marc"], { ASV_OWNER_SECRET: SECRET }, fetchFn)).toBe("Moderator Marc revoked");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8787/mod/moderators/Marc");
  });

  it.each([
    [["invite", "Marc"], 401, "invitation refused (HTTP 401)"],
    [["revoke", "Marc"], 404, "no moderator named Marc"],
    [["revoke", "Marc"], 429, "revocation refused (HTTP 429)"],
  ])("reports %j answered %i", async (argv, status, message) => {
    await expect(runOwnerCommand(argv, { ASV_OWNER_SECRET: SECRET }, answer(status))).rejects.toThrow(message);
  });

  it.each([[["list", "Marc"]], [["invite"]], [[]]])("refuses usage %j without calling the server", async (argv) => {
    const fetchFn = answer(201);

    await expect(runOwnerCommand(argv, { ASV_OWNER_SECRET: SECRET }, fetchFn)).rejects.toThrow("usage");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses when the secret is unset", async () => {
    await expect(runOwnerCommand(["invite", "Marc"], {}, answer(201))).rejects.toThrow("ASV_OWNER_SECRET is not set");
  });
});
