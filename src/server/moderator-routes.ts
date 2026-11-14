/**
 * The `/mod/*` and `/owner/*` routes of brick 8b (`moderation/02f`): owner invitation and revocation (BR-093, under `/owner` since brick 9), passkey
 * enrolment and sign-in with SimpleWebAuthn (BR-094 to BR-098), all 404 behind the tester tunnel (BR-097).
 */
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Context, Hono } from "hono";
import { isFilingReference, isModeratorName, parseFilingChannel, type AlertChannel, type FilingResult } from "../domain";
import { fromBase64, toBase64Url } from "./crypto/keys";
import type { ModeratorOps } from "./hub-moderators";
import { signGrant } from "./moderator-grant";
import { quotaKey } from "../domain/ip-key";
import { createTokenBucket, type TokenBucket } from "./token-bucket";

/** BR-093: shorter owner secrets stop the server at start. */
export const MIN_OWNER_SECRET_LENGTH = 32;
/** BR-096. */
export const OWNER_FAILURES_MAX = 5;
export const OWNER_WINDOW_MS = 10 * 60_000;
const CEREMONY_BUCKET = { capacity: 10, perSecond: 1 / 6 } as const;
const LOOPBACK = new Set(["127.0.0.1", "::1"]);
/** An IPv4 peer on a dual-stack socket reads `::ffff:127.0.0.1`. */
const unmapped = (peer: string) => peer.replace(/^::ffff:/, "");
const isLoopback = (peer: string) => LOOPBACK.has(unmapped(peer));
const NO_STORE = { "Cache-Control": "no-store" };
const MAX_TOKEN = 64;
const FILING_STATUS = { filed: 204, alreadyFiled: 409, noAlert: 404 } as const;

export interface ModeratorRouteDeps {
  readonly ops: ModeratorOps;
  readonly grantKey: CryptoKey;
  /** BR-098: origin of the web client, its host name being the RP ID; never read from a request. */
  readonly publicOrigin: string;
  /** Exact `Origin` values allowed for the browser routes. */
  readonly allowedOrigins: readonly string[];
  /** Unset: invitation and revocation answer 404 (BR-093). */
  readonly ownerSecret?: string;
  readonly behindTunnel: boolean;
  /** UC20: records the owner's filing of an authority alert (BR-104). */
  readonly recordFiling: (reportId: string, channel: AlertChannel, reference: string, at: Date) => Promise<FilingResult>;
  /** Socket address of the HTTP peer, for the loopback check and the rate limits. */
  readonly peerAddress: (c: Context) => string | undefined;
  readonly now: () => Date;
  readonly onError: (error: unknown) => void;
}

/** Throws at start on a short owner secret (BR-093). */
export const checkOwnerSecret = (secret: string | undefined): string | undefined => {
  if (secret === undefined || secret === "") return undefined;
  if (secret.length < MIN_OWNER_SECRET_LENGTH) throw new Error(`ASV_OWNER_SECRET needs at least ${MIN_OWNER_SECRET_LENGTH} characters (BR-093)`);
  return secret;
};

const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));

/** Constant-time comparison of fixed-length digests. */
const sameSecret = async (expected: string, given: string): Promise<boolean> => {
  const [a, b] = await Promise.all([digest(expected), digest(given)]);
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
};

const readBody = async (c: Context): Promise<Record<string, unknown> | undefined> => {
  try {
    const body: unknown = await c.req.json();
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};

const readToken = (body: Record<string, unknown> | undefined): string | undefined => {
  const token = body?.token;
  return typeof token === "string" && token.length > 0 && token.length <= MAX_TOKEN ? token : undefined;
};

/** A response object as `@simplewebauthn/browser` sends it; SimpleWebAuthn validates the rest. */
const readResponse = <T extends RegistrationResponseJSON | AuthenticationResponseJSON>(body: Record<string, unknown> | undefined): T | undefined => {
  const response = body?.response;
  if (typeof response !== "object" || response === null || !("id" in response) || typeof response.id !== "string") return undefined;
  if (!("response" in response) || typeof response.response !== "object" || response.response === null) return undefined;
  return response as T;
};

/** The base64url challenge the browser signed, read from `clientDataJSON`. */
const signedChallenge = (response: RegistrationResponseJSON | AuthenticationResponseJSON): string | undefined => {
  try {
    const client: unknown = JSON.parse(new TextDecoder().decode(fromBase64(response.response.clientDataJSON)));
    return typeof client === "object" && client !== null && "challenge" in client && typeof client.challenge === "string" ? client.challenge : undefined;
  } catch {
    return undefined;
  }
};

/** Adds the routes to `app`; the transport calls it after `createApp`. */
export const addModeratorRoutes = (app: Hono, deps: ModeratorRouteDeps): void => {
  if (deps.behindTunnel) {
    app.all("/mod/*", (c) => c.body(null, 404, NO_STORE));
    app.all("/owner/*", (c) => c.body(null, 404, NO_STORE));
    return;
  }
  const { ops, now } = deps;
  const rpID = new URL(deps.publicOrigin).hostname;
  const ownerFailures = new Map<string, number[]>();
  const buckets = new Map<string, TokenBucket>();

  const ceremonyAllowed = (c: Context): boolean => {
    const ip = quotaKey(deps.peerAddress(c) ?? "unknown");
    const nowMs = now().getTime();
    for (const [key, bucket] of buckets) if (bucket.isFull(nowMs)) buckets.delete(key);
    const bucket = buckets.get(ip) ?? createTokenBucket(CEREMONY_BUCKET.capacity, CEREMONY_BUCKET.perSecond, nowMs);
    buckets.set(ip, bucket);
    return bucket.take(nowMs);
  };

  /** BR-093, BR-096: the owner guard; `undefined` when the request may go on. */
  const ownerRefusal = async (c: Context): Promise<Response | undefined> => {
    const peer = deps.peerAddress(c);
    if (deps.ownerSecret === undefined || peer === undefined || !isLoopback(peer)) return c.body(null, 404, NO_STORE);
    const nowMs = now().getTime();
    const key = unmapped(peer);
    const failures = (ownerFailures.get(key) ?? []).filter((at) => nowMs - at < OWNER_WINDOW_MS);
    if (failures.length >= OWNER_FAILURES_MAX) return c.body(null, 429, { ...NO_STORE, "Retry-After": "600" });
    const header = c.req.header("authorization") ?? "";
    const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (!(await sameSecret(deps.ownerSecret, given))) {
      ownerFailures.set(key, [...failures, nowMs]);
      return c.body(null, 401, NO_STORE);
    }
    return undefined;
  };

  /** Browser routes: allowed Origin and the per-IP ceremony bucket (BR-096). */
  const browserRefusal = (c: Context): Response | undefined => {
    const origin = c.req.header("origin");
    if (origin === undefined || !deps.allowedOrigins.includes(origin)) return c.body(null, 403, NO_STORE);
    if (!ceremonyAllowed(c)) return c.body(null, 429, { ...NO_STORE, "Retry-After": "10" });
    return undefined;
  };

  const guarded = (handler: (c: Context) => Promise<Response>) => async (c: Context) => {
    try {
      return await handler(c);
    } catch (error) {
      deps.onError(error);
      return c.body(null, 503, { ...NO_STORE, "Retry-After": "10" });
    }
  };

  app.get("/mod/status", (c) => c.json({ enabled: true }, 200, NO_STORE));

  app.post("/owner/invitations", guarded(async (c) => {
    const refused = await ownerRefusal(c);
    if (refused) return refused;
    const name = (await readBody(c))?.name;
    if (typeof name !== "string" || !isModeratorName(name)) return c.body(null, 400, NO_STORE);
    const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    await ops.createInvitation(name, token, now());
    return c.json({ link: `${deps.publicOrigin}/#mod/enroll/${token}` }, 201, NO_STORE);
  }));

  app.delete("/owner/moderators/:name", guarded(async (c) => {
    const refused = await ownerRefusal(c);
    if (refused) return refused;
    const name = c.req.param("name") ?? "";
    if (!isModeratorName(name)) return c.body(null, 400, NO_STORE);
    return c.body(null, (await ops.io.revoke(name)) ? 204 : 404, NO_STORE);
  }));

  /** UC20 (`moderation/02h`): 204 filed, 409 already filed, 404 unknown report or no alert, 400 bad input. */
  app.post("/owner/authority-filings", guarded(async (c) => {
    const refused = await ownerRefusal(c);
    if (refused) return refused;
    const body = await readBody(c);
    const { reportId, channel, reference } = body ?? {};
    const parsed = typeof channel === "string" ? parseFilingChannel(channel) : undefined;
    if (typeof reportId !== "string" || reportId.length === 0 || reportId.length > MAX_TOKEN) return c.body(null, 400, NO_STORE);
    if (parsed === undefined || typeof reference !== "string" || !isFilingReference(reference)) return c.body(null, 400, NO_STORE);
    const result = await deps.recordFiling(reportId, parsed, reference.trim(), now());
    return c.body(null, FILING_STATUS[result], NO_STORE);
  }));

  app.post("/mod/enroll/options", guarded(async (c) => {
    const refused = browserRefusal(c);
    if (refused) return refused;
    const token = readToken(await readBody(c));
    const name = token === undefined ? undefined : await ops.io.invitedName(token, now());
    if (token === undefined || name === undefined) return c.body(null, 410, NO_STORE);
    const options = await generateRegistrationOptions({
      rpName: "asv",
      rpID,
      userName: name,
      userID: crypto.getRandomValues(new Uint8Array(16)),
      attestationType: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    });
    if (!ops.keepChallenge(options.challenge, { kind: "register", token }, now())) return c.body(null, 503, { ...NO_STORE, "Retry-After": "10" });
    return c.json(options, 200, NO_STORE);
  }));

  app.post("/mod/enroll", guarded(async (c) => {
    const refused = browserRefusal(c);
    if (refused) return refused;
    const body = await readBody(c);
    const token = readToken(body);
    const response = readResponse<RegistrationResponseJSON>(body);
    const challenge = response && signedChallenge(response);
    if (token === undefined || response === undefined || challenge === undefined) return c.body(null, 400, NO_STORE);
    if (!ops.takeChallenge(challenge, { kind: "register", token }, now())) return c.body(null, 401, NO_STORE);
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: deps.publicOrigin,
      expectedRPID: rpID,
      requireUserVerification: true,
    }).catch(() => undefined);
    if (!verification?.verified) return c.body(null, 401, NO_STORE);
    const { credential } = verification.registrationInfo;
    const name = await ops.io.enroll(token, credential.id, toBase64Url(credential.publicKey), credential.counter, now());
    return name === undefined ? c.body(null, 410, NO_STORE) : c.json({ name }, 200, NO_STORE);
  }));

  app.post("/mod/sign-in/options", guarded(async (c) => {
    const refused = browserRefusal(c);
    if (refused) return refused;
    const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
    if (!ops.keepChallenge(options.challenge, { kind: "authenticate" }, now())) return c.body(null, 503, { ...NO_STORE, "Retry-After": "10" });
    return c.json(options, 200, NO_STORE);
  }));

  /** Credentials whose sign-in is being verified. */
  const signingIn = new Set<string>();
  const signIn = async (c: Context, response: AuthenticationResponseJSON, challenge: string) => {
    const moderator = await ops.io.byCredential(response.id);
    if (!moderator) return c.body(null, 401, NO_STORE);
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: deps.publicOrigin,
      expectedRPID: rpID,
      credential: { id: moderator.credentialId, publicKey: fromBase64(moderator.publicKey), counter: moderator.signCount },
      requireUserVerification: true,
    }).catch(() => undefined);
    if (!verification?.verified) return c.body(null, 401, NO_STORE);
    await ops.io.updateSignCount(moderator.credentialId, verification.authenticationInfo.newCounter);
    return c.json({ grant: await signGrant(deps.grantKey, moderator.name, now()), name: moderator.name }, 200, NO_STORE);
  };

  app.post("/mod/sign-in", guarded(async (c) => {
    const refused = browserRefusal(c);
    if (refused) return refused;
    const response = readResponse<AuthenticationResponseJSON>(await readBody(c));
    const challenge = response && signedChallenge(response);
    if (response === undefined || challenge === undefined) return c.body(null, 400, NO_STORE);
    if (!ops.takeChallenge(challenge, { kind: "authenticate" }, now())) return c.body(null, 401, NO_STORE);
    // One sign-in per credential at a time: read, verify and counter update form one step, or two parallel
    // assertions could both pass on the same stored counter (signCount clone detection, `moderation/04-class`).
    if (signingIn.has(response.id)) return c.body(null, 409, NO_STORE);
    signingIn.add(response.id);
    try {
      return await signIn(c, response, challenge);
    } finally {
      signingIn.delete(response.id);
    }
  }));
};
