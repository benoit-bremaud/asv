/** Development entry point (`pnpm dev`): Node transport on 127.0.0.1 (`platform/02`). */
import { startNodeServer } from "./server";

const port = Number(process.env.ASV_PORT ?? 8787);
const allowedOrigins = (process.env.ASV_ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173").split(",");

const server = await startNodeServer({ port, hostname: "127.0.0.1", allowedOrigins });
console.log(`asv Node transport on http://127.0.0.1:${server.port}`);
