import { Hono } from "hono";
import type { Stats } from "./hub";

/** What the routes read from the hub. */
export interface AppDeps {
  readonly stats: () => Stats;
}

/**
 * Builds the Hono app. Each transport calls it and plugs in its hub; the server never
 * imports a transport (ADR-0002). The WebSocket upgrade belongs to the transport (`platform/02`).
 */
export const createApp = (deps: AppDeps): Hono => {
  const app = new Hono();
  // Aggregate only, no pseudo (`platform/04`, D8).
  app.get("/api/stats", (c) => c.json(deps.stats(), 200, { "Cache-Control": "no-store" }));
  return app;
};
