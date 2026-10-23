/** Development entry point (`pnpm dev`): Node transport on 127.0.0.1 (`platform/02`). */
import { startNodeServer } from "./server";

const port = Number(process.env.ASV_PORT ?? 8787);
const allowedOrigins = (process.env.ASV_ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173").split(",");

const server = await startNodeServer({
  port,
  hostname: "127.0.0.1",
  allowedOrigins,
  cryptoEnv: process.env,
  brevoApiKey: process.env.BREVO_API_KEY,
  mailFrom: process.env.ASV_MAIL_FROM,
});
console.log(`asv Node transport on http://127.0.0.1:${server.port}`);
