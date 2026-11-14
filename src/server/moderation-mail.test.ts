import { describe, expect, it, vi } from "vitest";
import type { Mailer } from "../domain";
import type { AccountIo } from "./account-io";
import type { ModerationIo } from "./moderation-io";
import { createModerationMail, STATEMENT_RETRY_MS } from "./moderation-mail";

const T0 = new Date("2026-11-13T10:00:00Z");

describe("createModerationMail in-flight guard", () => {
  it("never sends the same owner alert twice while the first send is on its way", async () => {
    let release: (accepted: boolean) => void = () => undefined;
    const sendAuthorityAlert = vi.fn(() => new Promise<boolean>((resolve) => (release = resolve)));
    const mailer = { sendAuthorityAlert } as unknown as Mailer;
    const moderation = {
      pendingAlerts: async () => ({ alerts: [{ reportId: "r1", category: "terrorism" as const }], failures: [] }),
      pendingDecisionMails: async () => [],
      markAlertNotified: vi.fn(async () => undefined),
    } as unknown as ModerationIo;
    const mail = createModerationMail({ mailer, moderation, accounts: {} as AccountIo, random: { id: () => "x", token: () => ({ value: "t", hash: "h" }) }, onStoreError: vi.fn() });

    void mail.alert("r1", "terrorism", T0);
    await mail.retry(new Date(T0.getTime() + STATEMENT_RETRY_MS));

    expect(sendAuthorityAlert).toHaveBeenCalledTimes(1);
    release(true);
  });
});

describe("createModerationMail statements (BR-076, BR-109)", () => {
  const setup = (overrides: Partial<Record<"savePendingStatement" | "deletePendingStatement" | "pendingStatements", () => Promise<unknown>>> = {}, accepted = true) => {
    const sendStatementOfReasons = vi.fn(async () => accepted);
    const onStoreError = vi.fn();
    const moderation = {
      savePendingStatement: vi.fn(async () => undefined),
      deletePendingStatement: vi.fn(async () => undefined),
      pendingStatements: vi.fn(async () => []),
      pendingAlerts: async () => ({ alerts: [], failures: [] }),
      pendingDecisionMails: async () => [],
      ...overrides,
    };
    const mail = createModerationMail({
      mailer: { sendStatementOfReasons } as unknown as Mailer,
      moderation: moderation as unknown as ModerationIo,
      accounts: {} as AccountIo,
      random: { id: () => "st1", token: () => ({ value: "t", hash: "h" }) },
      onStoreError,
    });
    return { mail, moderation, sendStatementOfReasons, onStoreError };
  };

  it("stores the statement encrypted before sending, and deletes it once accepted", async () => {
    const { mail, moderation, sendStatementOfReasons } = setup();
    await mail.statement("a@b.fr", "text", T0);

    expect(moderation.savePendingStatement).toHaveBeenCalledWith({ id: "st1", email: "a@b.fr", text: "text", giveUpAt: new Date(T0.getTime() + 7 * 86_400_000) });
    expect(sendStatementOfReasons).toHaveBeenCalledWith("a@b.fr", "text");
    expect(moderation.deletePendingStatement).toHaveBeenCalledWith("st1");
  });

  it("still sends once when the store refuses the statement, and reports the error", async () => {
    const failure = new Error("disk");
    const { mail, sendStatementOfReasons, onStoreError } = setup({ savePendingStatement: () => Promise.reject(failure) });
    await mail.statement("a@b.fr", "text", T0);

    expect(sendStatementOfReasons).toHaveBeenCalledTimes(1);
    expect(onStoreError).toHaveBeenCalledWith(failure);
  });

  it("keeps a refused statement, and reports a failed delete", async () => {
    const kept = setup({}, false);
    await kept.mail.statement("a@b.fr", "text", T0);
    expect(kept.moderation.deletePendingStatement).not.toHaveBeenCalled();

    const failure = new Error("disk");
    const broken = setup({ deletePendingStatement: () => Promise.reject(failure) });
    await broken.mail.statement("a@b.fr", "text", T0);
    expect(broken.onStoreError).toHaveBeenCalledWith(failure);
  });

  it("retries younger statements, deletes expired ones, and reports a failed read", async () => {
    const statements = [
      { id: "old", email: "o@b.fr", text: "o", giveUpAt: T0 },
      { id: "new", email: "n@b.fr", text: "n", giveUpAt: new Date(T0.getTime() + 1) },
    ];
    const { mail, moderation, sendStatementOfReasons } = setup({ pendingStatements: async () => statements });
    await mail.retry(T0);

    expect(moderation.deletePendingStatement).toHaveBeenCalledWith("old");
    expect(sendStatementOfReasons).toHaveBeenCalledExactlyOnceWith("n@b.fr", "n");

    const failure = new Error("disk");
    const broken = setup({ pendingStatements: () => Promise.reject(failure) });
    await broken.mail.retry(T0);
    expect(broken.onStoreError).toHaveBeenCalledWith(failure);
  });
});
