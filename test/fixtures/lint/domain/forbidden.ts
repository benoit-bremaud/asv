import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import { createApp } from "../../../../src/server/app";

export const leak = [Hono, readFile, createApp];
