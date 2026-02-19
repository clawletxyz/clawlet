#!/usr/bin/env node

/**
 * Unified demo entry point for Railway (or local) deployment.
 *
 * 1. Auto-seeds .clawlet/state.json if it doesn't exist
 * 2. Starts the mock x402 server on port 4020 (internal)
 * 3. Starts the main API + dashboard on $PORT (default 3000)
 *
 * Usage:  node dist/demo/start.js
 *   or:   npx tsx demo/start.ts
 */

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { seedState } from "./seed.js";
import { startDemoServer } from "./server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(process.cwd(), ".clawlet");
const statePath = join(dataDir, "state.json");

// Step 1: Auto-seed if no state exists
if (!existsSync(statePath)) {
  console.log("  No state found — seeding demo data...\n");
  seedState(dataDir);
} else {
  console.log("  Existing state found — skipping seed.\n");
}

// Step 2: Start mock x402 server (internal, port 4020)
startDemoServer(4020);

// Step 3: Start main API + dashboard
// Dynamic import because api.js is compiled by a different tsconfig
// (root tsc outputs src/api.ts → dist/api.js, not dist/src/api.js)
const apiPath = pathToFileURL(join(__dirname, "..", "api.js")).href;
const { main } = await import(apiPath) as { main: () => Promise<void> };
main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
