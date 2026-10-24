/**
 * Entry point of the Node transport on 127.0.0.1 (`platform/02`): `pnpm dev` behind Vite, or the tester
 * exposure behind the Cloudflare Tunnel (ADR-0018) when `ASV_TUNNEL=1`.
 */
import { startNodeServer } from "./server";

const env = process.env;
const tunnel = env.ASV_TUNNEL === "1";
const port = Number(env.ASV_PORT ?? 8787);
const allowedOrigins = (env.ASV_ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173").split(",");
// BR-085: in tunnel mode the testers' origin must be set explicitly, over HTTPS.
if (tunnel && (!env.ASV_ALLOWED_ORIGINS || !allowedOrigins.every((origin) => origin.startsWith("https://"))))
  throw new Error("ASV_TUNNEL=1 needs ASV_ALLOWED_ORIGINS set to the https:// tunnel origin(s)");

const server = await startNodeServer({
  port,
  hostname: "127.0.0.1",
  allowedOrigins,
  cryptoEnv: env,
  brevoApiKey: env.BREVO_API_KEY,
  mailFrom: env.ASV_MAIL_FROM,
  logFile: env.ASV_LOG_FILE,
  vaultFile: env.ASV_VAULT_FILE,
  behindTunnel: tunnel,
  secureCookie: tunnel,
  staticRoot: env.ASV_STATIC_ROOT,
  legal: {
    ownerName: env.ASV_OWNER_NAME,
    postalAddress: env.ASV_OWNER_ADDRESS,
    phone: env.ASV_OWNER_PHONE,
    contactEmail: env.ASV_CONTACT_EMAIL,
    brevoLocation: env.ASV_BREVO_LOCATION,
  },
});
console.log(`asv Node transport on http://127.0.0.1:${server.port}${tunnel ? " (tunnel mode)" : ""}`);
