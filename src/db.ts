import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { DEFAULT_DATA_DIR, DB_FILE } from "./constants.js";

let prisma: PrismaClient | null = null;
let _dataDir: string;

/**
 * Initialize the database connection.
 * Creates the .clawlet directory if needed, runs `prisma db push` if the DB
 * file doesn't exist yet, connects via better-sqlite3 adapter, and upserts
 * the AppState singleton row.
 */
export async function initDb(baseDir?: string): Promise<void> {
  _dataDir = baseDir
    ? join(baseDir, DEFAULT_DATA_DIR)
    : join(process.cwd(), DEFAULT_DATA_DIR);

  if (!existsSync(_dataDir)) {
    mkdirSync(_dataDir, { recursive: true });
  }

  const dbPath = join(_dataDir, DB_FILE);
  const dbUrl = `file:${dbPath}`;

  process.env.DATABASE_URL = dbUrl;

  const needsPush = !existsSync(dbPath);

  if (needsPush) {
    execSync("npx prisma db push", {
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: "pipe",
    });
  }

  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  prisma = new PrismaClient({ adapter });

  // Upsert the AppState singleton
  await prisma.appState.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", network: "base" },
  });
}

/** Get the PrismaClient instance. Throws if not initialized. */
export function db(): PrismaClient {
  if (!prisma) throw new Error("Database not initialized. Call initDb() first.");
  return prisma;
}

/** Disconnect from the database. */
export async function closeDb(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
