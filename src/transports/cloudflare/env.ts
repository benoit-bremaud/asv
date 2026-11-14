/**
 * The Worker and Hub environment (ADR-0020 §10): Wrangler secrets and the non-secret variables of
 * `wrangler.jsonc`, and the start checks of BR-111.
 */
import { cryptoKeysFromEnv, type CryptoKeys } from "../../server/crypto/keys";
import { MIN_OWNER_SECRET_LENGTH } from "../../server/moderator-routes";

/** A request target: the static assets binding, or a Durable Object stub. */
export interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

/** The Hub Durable Object namespace, reduced to the calls the Worker makes (D6 A: EU jurisdiction). */
export interface HubNamespace {
  jurisdiction(name: "eu"): HubNamespace;
  idFromName(name: string): unknown;
  get(id: unknown): Fetcher;
}

/** Bindings, secrets and variables; every value may be missing until the owner sets it. */
export interface Env {
  readonly ASSETS: Fetcher;
  readonly HUB: HubNamespace;
  // Secrets (Wrangler secrets per environment, BR-111).
  readonly ASV_DATA_KEYS?: string;
  readonly ASV_HMAC_KEY?: string;
  readonly ASV_VAULT_PUBLIC_KEY?: string;
  readonly ASV_OWNER_SECRET?: string;
  readonly BREVO_API_KEY?: string;
  readonly ASV_MISTRAL_API_KEY?: string;
  readonly ASV_OWNER_NAME?: string;
  readonly ASV_OWNER_ADDRESS?: string;
  readonly ASV_OWNER_PHONE?: string;
  readonly ASV_CONTACT_EMAIL?: string;
  readonly ASV_BREVO_LOCATION?: string;
  // Non-secret variables (`wrangler.jsonc`).
  readonly ASV_ALLOWED_ORIGINS?: string;
  readonly ASV_PUBLIC_ORIGIN?: string;
  readonly ASV_MAIL_FROM?: string;
  readonly ASV_TRIAGE_MODEL?: string;
  readonly ASV_ACCESS_AUD_SITE?: string;
  readonly ASV_ACCESS_AUD_OWNER?: string;
  /** `<team>.cloudflareaccess.com`: issuer and JWKS host of the Access tokens (BR-113). */
  readonly ASV_ACCESS_TEAM_DOMAIN?: string;
  /** `on` in staging, `off` in production until the impact assessment is signed (BR-108). */
  readonly ASV_MODERATION?: string;
}

/** The checked configuration both the Worker and the Hub run on. */
export interface Config {
  readonly keys: CryptoKeys;
  readonly ownerSecret: string;
  readonly brevoApiKey: string;
  readonly publicOrigin: string;
  readonly allowedOrigins: readonly string[];
  readonly accessTeamDomain: string;
  readonly accessAudSite: string;
  readonly accessAudOwner: string;
  readonly moderation: boolean;
}

/** The value `wrangler.jsonc` ships until the owner sets the real one. */
export const PLACEHOLDER = "TBD-by-owner";

const REQUIRED = [
  "ASV_DATA_KEYS",
  "ASV_HMAC_KEY",
  "ASV_VAULT_PUBLIC_KEY",
  "ASV_OWNER_SECRET",
  "BREVO_API_KEY",
  "ASV_PUBLIC_ORIGIN",
  "ASV_ALLOWED_ORIGINS",
  "ASV_ACCESS_AUD_SITE",
  "ASV_ACCESS_AUD_OWNER",
  "ASV_ACCESS_TEAM_DOMAIN",
] as const;

const TEAM_DOMAIN = /^[a-z0-9-]+\.cloudflareaccess\.com$/;

/**
 * BR-111: the configuration, or the reason to answer 503. Never throws; the reason names variables only,
 * never a value.
 */
export const checkConfig = async (env: Env): Promise<Config | { readonly problem: string }> => {
  const missing = REQUIRED.filter((name) => !env[name] || env[name] === PLACEHOLDER);
  if (missing.length > 0) return { problem: `missing: ${missing.join(", ")}` };
  const ownerSecret = env.ASV_OWNER_SECRET ?? "";
  if (ownerSecret.length < MIN_OWNER_SECRET_LENGTH) return { problem: `ASV_OWNER_SECRET shorter than ${MIN_OWNER_SECRET_LENGTH}` };
  const teamDomain = env.ASV_ACCESS_TEAM_DOMAIN ?? "";
  if (!TEAM_DOMAIN.test(teamDomain)) return { problem: "ASV_ACCESS_TEAM_DOMAIN is not <team>.cloudflareaccess.com" };
  const publicOrigin = env.ASV_PUBLIC_ORIGIN ?? "";
  const allowedOrigins = (env.ASV_ALLOWED_ORIGINS ?? "").split(",").map((origin) => origin.trim());
  if (URL.parse(publicOrigin)?.origin !== publicOrigin || !publicOrigin.startsWith("https://") || !allowedOrigins.includes(publicOrigin)) {
    return { problem: "ASV_PUBLIC_ORIGIN must be an https origin listed in ASV_ALLOWED_ORIGINS (BR-098)" };
  }
  let keys: CryptoKeys;
  try {
    keys = await cryptoKeysFromEnv(env, true, () => undefined);
  } catch (error) {
    return { problem: error instanceof Error ? error.message : "crypto keys do not parse" };
  }
  return {
    keys,
    ownerSecret,
    brevoApiKey: env.BREVO_API_KEY ?? "",
    publicOrigin,
    allowedOrigins,
    accessTeamDomain: teamDomain,
    accessAudSite: env.ASV_ACCESS_AUD_SITE ?? "",
    accessAudOwner: env.ASV_ACCESS_AUD_OWNER ?? "",
    moderation: env.ASV_MODERATION === "on",
  };
};

/** One check per isolate: the environment does not change while it lives. */
const cache = new WeakMap<Env, Promise<Config | { readonly problem: string }>>();

export const cachedConfig = (env: Env): Promise<Config | { readonly problem: string }> => {
  let checked = cache.get(env);
  if (!checked) {
    checked = checkConfig(env);
    cache.set(env, checked);
  }
  return checked;
};
