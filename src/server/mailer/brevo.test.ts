import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrevoMailer, MAIL_SEND_FAILED, parseBrevoFailure, scrub, type BrevoOptions } from "./brevo";

afterEach(() => vi.restoreAllMocks());

const setup = (overrides: Partial<BrevoOptions> = {}) => {
  const log = vi.fn<BrevoOptions["log"]>();
  const fetchStub = vi.fn<typeof fetch>(() => Promise.resolve(new Response("{}", { status: 201 })));
  const mailer = createBrevoMailer({ apiKey: "key", from: "contact@asvchat.fr", production: true, log, fetch: fetchStub, ...overrides });
  return { mailer, log, fetchStub };
};

const loggedText = (log: ReturnType<typeof setup>["log"]) => JSON.stringify(log.mock.calls);

describe("createBrevoMailer", () => {
  it("posts the code mail to Brevo with the sender, recipient, text and HTML", async () => {
    const { mailer, fetchStub, log } = setup();

    await mailer.sendCode("nath@example.org", "123456");

    const [url, init] = fetchStub.mock.calls[0] ?? [];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "api-key": "key", "content-type": "application/json" });
    const body: unknown = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      sender: { name: "asv", email: "contact@asvchat.fr" },
      to: [{ email: "nath@example.org" }],
      subject: "Ton code asv",
    });
    expect(body).toMatchObject({ textContent: expect.stringContaining("123456"), htmlContent: expect.stringContaining("123456") });
    expect(log).not.toHaveBeenCalled();
  });

  it("logs a rejected send without the address or the raw body, and does not throw", async () => {
    const { mailer, fetchStub, log } = setup();
    fetchStub.mockResolvedValueOnce(new Response(JSON.stringify({ code: "invalid_parameter", message: "bad nath@example.org" }), { status: 400 }));

    await expect(mailer.sendCode("nath@example.org", "123456")).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith("error", expect.objectContaining({ event: MAIL_SEND_FAILED, httpStatus: 400, providerCode: "invalid_parameter" }));
    expect(loggedText(log)).not.toContain("nath@example.org");
    expect(loggedText(log)).not.toContain("123456");
  });

  it("logs a network error, scrubbed, and does not throw", async () => {
    const { mailer, fetchStub, log } = setup();
    fetchStub.mockRejectedValueOnce(new Error("connect failed for nath@example.org"));

    await mailer.sendCode("nath@example.org", "123456");

    expect(log).toHaveBeenCalledWith("error", expect.objectContaining({ event: MAIL_SEND_FAILED, providerMessage: "connect failed for [address]" }));
    fetchStub.mockRejectedValueOnce("odd");
    await mailer.sendCode("nath@example.org", "123456");
    expect(log).toHaveBeenLastCalledWith("error", expect.objectContaining({ providerMessage: "unknown error" }));
  });

  it("logs the code instead of sending when no key is set outside production", async () => {
    const { mailer, fetchStub, log } = setup({ apiKey: undefined, production: false });

    await mailer.sendCode("nath@example.org", "123456");

    expect(fetchStub).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("info", expect.objectContaining({ devOnlySecret: "123456" }));
    expect(loggedText(log)).not.toContain("nath@example.org");
  });

  it("logs a send failure when no key is set in production", async () => {
    const { mailer, fetchStub, log } = setup({ apiKey: undefined });

    expect(await mailer.sendStatementOfReasons("nath@example.org", "text")).toBe(false);

    expect(fetchStub).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("error", expect.objectContaining({ providerCode: "missing_api_key" }));
  });

  it("reports whether Brevo accepted a statement of reasons, escaped in HTML", async () => {
    const { mailer, fetchStub } = setup();

    expect(await mailer.sendStatementOfReasons("nath@example.org", "Rule <3>\nbreached")).toBe(true);
    expect(String(fetchStub.mock.calls[0]?.[1]?.body)).toContain("Rule &lt;3&gt;<br>breached");
    fetchStub.mockResolvedValueOnce(new Response("", { status: 500 }));
    expect(await mailer.sendStatementOfReasons("nath@example.org", "text")).toBe(false);
  });

  it("uses the global fetch when none is injected", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 201 }));
    const mailer = createBrevoMailer({ apiKey: "key", from: "a@b.fr", production: true, log: vi.fn() });

    await mailer.sendCode("nath@example.org", "123456");

    expect(globalFetch).toHaveBeenCalledOnce();
    globalFetch.mockRestore();
  });
});

describe("parseBrevoFailure", () => {
  it.each([
    ["not JSON", "<html>", { providerCode: "", providerMessage: "" }],
    ["a non-object", "42", { providerCode: "", providerMessage: "" }],
    ["wrong field types", '{"code":1,"message":2}', { providerCode: "", providerMessage: "" }],
  ])("yields empty fields for %s", (_, body, expected) => {
    expect(parseBrevoFailure(body)).toEqual(expected);
  });
});

describe("scrub", () => {
  it("masks addresses and caps the length", () => {
    expect(scrub("to a.b@c.org now")).toBe("to [address] now");
    expect(scrub("x".repeat(300))).toHaveLength(200);
  });
});
