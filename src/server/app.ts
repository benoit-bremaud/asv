import { Hono } from "hono";

/**
 * Builds the Hono app. Each transport calls it and plugs in its hub; the server never
 * imports a transport (ADR-0002). Routes arrive with brick 7.
 */
export const createApp = (): Hono => new Hono();
