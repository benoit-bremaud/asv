/**
 * Owner scripts of `moderation/02f`: `pnpm mod:invite <name>` and `pnpm mod:revoke <name>` call the running
 * Node transport on loopback with `ASV_OWNER_SECRET` (BR-093, BR-094). Run on the server machine only.
 */
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** Runs one command and returns the line to print; throws with a plain message on any refusal. */
export const runOwnerCommand = async (argv: readonly string[], env: NodeJS.ProcessEnv, fetchFn: Fetch = fetch): Promise<string> => {
  const [command, name] = argv;
  if ((command !== "invite" && command !== "revoke") || !name) throw new Error("usage: mod:invite <name> | mod:revoke <name>");
  if (!env.ASV_OWNER_SECRET) throw new Error("ASV_OWNER_SECRET is not set");
  const base = `http://127.0.0.1:${env.ASV_PORT ?? 8787}`;
  const headers = { Authorization: `Bearer ${env.ASV_OWNER_SECRET}`, "Content-Type": "application/json" };
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
