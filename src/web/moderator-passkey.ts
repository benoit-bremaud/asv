/**
 * Browser side of the passkey ceremonies (`moderation/02f`, `web-ui/09`): plain `fetch` to the `/mod`
 * routes and `@simplewebauthn/browser`, run only from a user's click.
 */
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";

const JSON_POST = { method: "POST", headers: { "Content-Type": "application/json" } } as const;

export type ModerationAccess = "off" | "noPasskey" | "on";

/**
 * BR-097: the routes answer 404 behind the tester tunnel, so the link stays hidden there; only the JSON
 * `{enabled: true}` counts, never an HTML fallback. Without WebAuthn the link shows disabled (`web-ui/09`).
 */
export const moderationAccess = async (): Promise<ModerationAccess> => {
  try {
    const response = await fetch("/mod/status");
    const body: unknown = response.ok ? await response.json() : undefined;
    if (typeof body !== "object" || body === null || !("enabled" in body) || body.enabled !== true) return "off";
    return browserSupportsWebAuthn() ? "on" : "noPasskey";
  } catch {
    return "off";
  }
};

/** The device cancelled or refused the ceremony (WebAuthn `NotAllowedError`). */
const cancelled = (error: unknown) => error instanceof Error && error.name === "NotAllowedError";

export type SignInResult = { readonly grant: string; readonly name: string } | "refused" | "cancelled";

/** UC16 steps 2 to 4: options, signature on the device, grant. */
export const signInModerator = async (): Promise<SignInResult> => {
  try {
    const options = await fetch("/mod/sign-in/options", JSON_POST);
    if (!options.ok) return "refused";
    const response = await startAuthentication({ optionsJSON: await options.json() });
    const result = await fetch("/mod/sign-in", { ...JSON_POST, body: JSON.stringify({ response }) });
    if (!result.ok) return "refused";
    const body: unknown = await result.json();
    return typeof body === "object" && body !== null && "grant" in body && typeof body.grant === "string" && "name" in body && typeof body.name === "string"
      ? { grant: body.grant, name: body.name }
      : "refused";
  } catch (error) {
    return cancelled(error) ? "cancelled" : "refused";
  }
};

export type EnrolResult = { readonly name: string } | "gone" | "cancelled" | "failed";

/** UC15: options for this invitation, passkey creation, registration. */
export const enrolModerator = async (token: string): Promise<EnrolResult> => {
  try {
    const options = await fetch("/mod/enroll/options", { ...JSON_POST, body: JSON.stringify({ token }) });
    if (options.status === 410) return "gone";
    if (!options.ok) return "failed";
    const response = await startRegistration({ optionsJSON: await options.json() });
    const result = await fetch("/mod/enroll", { ...JSON_POST, body: JSON.stringify({ token, response }) });
    if (result.status === 410) return "gone";
    if (!result.ok) return "failed";
    const body: unknown = await result.json();
    return typeof body === "object" && body !== null && "name" in body && typeof body.name === "string" ? { name: body.name } : "failed";
  } catch (error) {
    return cancelled(error) ? "cancelled" : "failed";
  }
};

const ENROL_PREFIX = "#mod/enroll/";

/** BR-097: the invitation token of the fragment, removed from the address bar before any request. */
export const takeEnrolToken = (): string | undefined => {
  const { hash, pathname, search } = window.location;
  if (!hash.startsWith(ENROL_PREFIX)) return undefined;
  window.history.replaceState(null, "", `${pathname}${search}`);
  const token = hash.slice(ENROL_PREFIX.length);
  return /^[A-Za-z0-9_-]{1,64}$/.test(token) ? token : "";
};
