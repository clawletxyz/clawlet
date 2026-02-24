import { defineConfig, env } from "prisma/config";

export default defineConfig({
  earlyAccess: true,
  schema: "prisma/schema.prisma",
  migrate: {
    async adapter() {
      const { PrismaBetterSqlite3 } = await import(
        "@prisma/adapter-better-sqlite3"
      );
      return new PrismaBetterSqlite3({
        url: env("DATABASE_URL") ?? "file:.clawlet/clawlet.db",
      });
    },
  },
  datasource: {
    url: env("DATABASE_URL") ?? "file:.clawlet/clawlet.db",
  },
});
