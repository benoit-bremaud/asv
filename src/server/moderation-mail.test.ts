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
