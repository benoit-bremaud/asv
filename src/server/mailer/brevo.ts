/**
 * Brevo mailer (ADR-0013 amendment, `platform/04d`): the brasse-bouillon `MailerService` reduced to asv's
 * messages. Global `fetch` only, so it runs on Node and Workers. Sending a code never throws: the chatter
 * can ask for a new one, and the answer to `requestCode` must not depend on the provider.
 */
import type { Mailer } from "../../domain";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
const TIMEOUT_MS = 8000;
const SENDER_NAME = "asv";
/** Allow-listed event name of every failed send, never with the address. */
export const MAIL_SEND_FAILED = "mailer.send_failed";

/** Structured log line; the adapter never puts an address or a raw provider body in it. */
export type MailLog = (level: "info" | "error", fields: Readonly<Record<string, string | number>>) => void;

/** Settings of the Brevo adapter; `log` receives scrubbed fields only, and each send times out after 8 s. */
export interface BrevoOptions {
  /** Unset in development and tests: messages are logged instead of sent. */
  readonly apiKey?: string;
  readonly from: string;
  readonly production: boolean;
  readonly log: MailLog;
  /** Injected in tests; the global `fetch` otherwise. */
  readonly fetch?: typeof fetch;
}

interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  /** The code, printed only by the development fallback. */
  readonly secret?: string;
}

/** Brevo's error body cut to `{ code, message }`, the message stripped of anything address-like. */
export const parseBrevoFailure = (rawBody: string): { providerCode: string; providerMessage: string } => {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    const body = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    return {
      providerCode: typeof body.code === "string" ? body.code.slice(0, 64) : "",
      providerMessage: typeof body.message === "string" ? scrub(body.message) : "",
    };
  } catch {
    return { providerCode: "", providerMessage: "" };
  }
};

/** Removes e-mail addresses and caps the length of a provider or error message. */
export const scrub = (text: string): string =>
  text
    .split(/(\s+)/)
    .map((word) => (word.includes("@") ? "[address]" : word))
    .join("")
    .slice(0, 200);

const escapeHtml = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

/**
 * Builds the Brevo adapter of the `Mailer` port. It never throws: a failed send logs `MAIL_SEND_FAILED`
 * with the HTTP status and the scrubbed provider code and message.
 */
export const createBrevoMailer = (options: BrevoOptions): Mailer => {
  const doFetch = options.fetch ?? fetch;

  const send = async (message: MailMessage): Promise<boolean> => {
    if (!options.apiKey) {
      if (options.production) {
        options.log("error", { event: MAIL_SEND_FAILED, provider: "brevo", subject: message.subject, providerCode: "missing_api_key" });
        return false;
      }
      options.log("info", { event: "mailer.dev_only", subject: message.subject, devOnlySecret: message.secret ?? "" });
      return true;
    }
    try {
      const response = await doFetch(BREVO_SEND_URL, {
        method: "POST",
        headers: { "api-key": options.apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { name: SENDER_NAME, email: options.from },
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.text,
          htmlContent: message.html,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) return true;
      options.log("error", {
        event: MAIL_SEND_FAILED,
        provider: "brevo",
        httpStatus: response.status,
        subject: message.subject,
        ...parseBrevoFailure(await response.text()),
      });
    } catch (error) {
      options.log("error", {
        event: MAIL_SEND_FAILED,
        provider: "brevo",
        subject: message.subject,
        providerMessage: scrub(error instanceof Error ? error.message : "unknown error"),
      });
    }
    return false;
  };

  return {
    async sendCode(email, code) {
      await send({
        to: email,
        subject: "Ton code asv",
        text: `Ton code asv : ${code}\n\nIl est valable 10 minutes. Tape-le dans le chat.\n\nSi tu n'as rien demandé, ignore ce message.`,
        html: `<p>Ton code asv :</p><p style="font-size:24px;letter-spacing:4px"><strong>${code}</strong></p><p>Il est valable 10 minutes. Tape-le dans le chat.</p><p>Si tu n'as rien demandé, ignore ce message.</p>`,
        secret: code,
      });
    },

    sendStatementOfReasons: (email, statement) =>
      send({
        to: email,
        subject: "Décision de modération sur ton compte asv",
        text: statement,
        html: `<p>${escapeHtml(statement).replaceAll("\n", "<br>")}</p>`,
      }),
  };
};
