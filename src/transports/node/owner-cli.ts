/**
 * Owner scripts of `moderation/02f` and `02h`: `pnpm mod:invite <name>`, `pnpm mod:revoke <name>` and
 * `pnpm mod:filed <reportId> <channel> <reference>` (UC20, BR-104) call the running
 * transport at `ASV_OWNER_URL` (default: Node on loopback) with `ASV_OWNER_SECRET` (BR-093, BR-094), plus the
 * Access service token when `ASV_ACCESS_CLIENT_ID` and `ASV_ACCESS_CLIENT_SECRET` are set (BR-113).
 */
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** UC20: `mod:filed`; each refusal names its cause. */
const filed = async (fetchFn: Fetch, url: string, headers: Record<string, string>, reportId: string, rest: readonly string[]): Promise<string> => {
  const [channel, ...words] = rest;
  const body = JSON.stringify({ reportId, channel, reference: words.join(" ") });
  const response = await send(fetchFn, `${url}/owner/authority-filings`, { method: "POST", headers, body });
  if (response.status === 404) throw new Error(`no alert on report ${reportId}, or the /owner routes are off (ASV_OWNER_SECRET unset, tunnel mode)`);
  if (response.status === 409) throw new Error(`the alert of report ${reportId} is already filed`);
  if (response.status === 400) throw new Error("channel must be PHAROS, 17, 112 or PointDeContact, and the reference 1 to 100 characters");
  if (response.status !== 204) throw new Error(`filing refused (HTTP ${response.status})`);
  return `Alert of report ${reportId} recorded as filed (${channel})`;
};

const LOCAL_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

/** The base URL: `ASV_OWNER_URL` or loopback; the owner secret never travels over plain http to another host. */
const ownerBase = (env: NodeJS.ProcessEnv): string => {
  const raw = env.ASV_OWNER_URL || `http://127.0.0.1:${env.ASV_PORT ?? 8787}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("ASV_OWNER_URL is not a valid URL");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
    throw new Error("ASV_OWNER_URL must be https, or http on 127.0.0.1, ::1 or localhost");
  }
  return raw.replace(/\/+$/, "");
};

/** Redirects are never followed: they would carry the secret elsewhere. */
const send = async (fetchFn: Fetch, url: string, init: RequestInit): Promise<Response> => {
  const response = await fetchFn(url, { ...init, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) throw new Error(`${url} answered a redirect (HTTP ${response.status}); check ASV_OWNER_URL and the Access login`);
  return response;
};

/** Runs one command and returns the line to print; throws with a plain message on any refusal. */
export const runOwnerCommand = async (argv: readonly string[], env: NodeJS.ProcessEnv, fetchFn: Fetch = fetch): Promise<string> => {
  const [command, name, ...rest] = argv;
  const known = command === "invite" || command === "revoke" || (command === "filed" && rest.length >= 2);
  if (!known || !name) throw new Error("usage: mod:invite <name> | mod:revoke <name> | mod:filed <reportId> <channel> <reference>");
  if (!env.ASV_OWNER_SECRET) throw new Error("ASV_OWNER_SECRET is not set");
  const base = ownerBase(env);
  const headers: Record<string, string> = { Authorization: `Bearer ${env.ASV_OWNER_SECRET}`, "Content-Type": "application/json" };
  // BR-113: behind Cloudflare Access, `/owner/*` also needs the Service Auth token of the owner CLI.
  if (Boolean(env.ASV_ACCESS_CLIENT_ID) !== Boolean(env.ASV_ACCESS_CLIENT_SECRET)) {
    throw new Error("set both ASV_ACCESS_CLIENT_ID and ASV_ACCESS_CLIENT_SECRET, or neither");
  }
  if (env.ASV_ACCESS_CLIENT_ID && env.ASV_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = env.ASV_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = env.ASV_ACCESS_CLIENT_SECRET;
  }
  if (command === "filed") return filed(fetchFn, base, headers, name, rest);
  if (command === "invite") {
    const response = await send(fetchFn, `${base}/owner/invitations`, { method: "POST", headers, body: JSON.stringify({ name }) });
    if (response.status !== 201) throw new Error(`invitation refused (HTTP ${response.status})`);
    const { link } = (await response.json()) as { link: string };
    return `Invitation for ${name}, valid 24 h, single use: ${link}`;
  }
  const response = await send(fetchFn, `${base}/owner/moderators/${encodeURIComponent(name)}`, { method: "DELETE", headers });
  if (response.status === 404) throw new Error(`no moderator named ${name}, or the /owner routes are off (ASV_OWNER_SECRET unset, tunnel mode)`);
  if (response.status !== 204) throw new Error(`revocation refused (HTTP ${response.status})`);
  return `Moderator ${name} revoked`;
};
