/**
 * Owner scripts of `moderation/02f` and `02h`: `pnpm mod:invite <name>`, `pnpm mod:revoke <name>` and
 * `pnpm mod:filed <reportId> <channel> <reference>` (UC20, BR-104) call the running
 * Node transport on loopback with `ASV_OWNER_SECRET` (BR-093, BR-094). Run on the server machine only.
 */
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** UC20: `mod:filed`; each refusal names its cause. */
const filed = async (fetchFn: Fetch, url: string, headers: Record<string, string>, reportId: string, rest: readonly string[]): Promise<string> => {
  const [channel, ...words] = rest;
  const body = JSON.stringify({ reportId, channel, reference: words.join(" ") });
  const response = await fetchFn(`${url}/mod/authority-filings`, { method: "POST", headers, body });
  if (response.status === 404) throw new Error(`no alert on report ${reportId}, or the /mod routes are off (ASV_OWNER_SECRET unset, tunnel mode)`);
  if (response.status === 409) throw new Error(`the alert of report ${reportId} is already filed`);
  if (response.status === 400) throw new Error("channel must be PHAROS, 17, 112 or PointDeContact, and the reference 1 to 100 characters");
  if (response.status !== 204) throw new Error(`filing refused (HTTP ${response.status})`);
  return `Alert of report ${reportId} recorded as filed (${channel})`;
};

/** Runs one command and returns the line to print; throws with a plain message on any refusal. */
export const runOwnerCommand = async (argv: readonly string[], env: NodeJS.ProcessEnv, fetchFn: Fetch = fetch): Promise<string> => {
  const [command, name, ...rest] = argv;
  const known = command === "invite" || command === "revoke" || (command === "filed" && rest.length >= 2);
  if (!known || !name) throw new Error("usage: mod:invite <name> | mod:revoke <name> | mod:filed <reportId> <channel> <reference>");
  if (!env.ASV_OWNER_SECRET) throw new Error("ASV_OWNER_SECRET is not set");
  const base = `http://127.0.0.1:${env.ASV_PORT ?? 8787}`;
  const headers = { Authorization: `Bearer ${env.ASV_OWNER_SECRET}`, "Content-Type": "application/json" };
  if (command === "filed") return filed(fetchFn, base, headers, name, rest);
  if (command === "invite") {
    const response = await fetchFn(`${base}/mod/invitations`, { method: "POST", headers, body: JSON.stringify({ name }) });
    if (response.status !== 201) throw new Error(`invitation refused (HTTP ${response.status})`);
    const { link } = (await response.json()) as { link: string };
    return `Invitation for ${name}, valid 24 h, single use: ${link}`;
  }
  const response = await fetchFn(`${base}/mod/moderators/${encodeURIComponent(name)}`, { method: "DELETE", headers });
  if (response.status === 404) throw new Error(`no moderator named ${name}, or the /mod routes are off (ASV_OWNER_SECRET unset, tunnel mode)`);
  if (response.status !== 204) throw new Error(`revocation refused (HTTP ${response.status})`);
  return `Moderator ${name} revoked`;
};
