// Fixture: a domain test may import vitest, nothing else.
import { readFileSync } from "node:fs";
import { expect } from "vitest";

expect(readFileSync).toBeDefined();
