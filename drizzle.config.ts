import { defineConfig } from "drizzle-kit";
import "dotenv/config";

const url =
  process.env.TURSO_DATABASE_URL ??
  process.env.LIBSQL_DATABASE_URL ??
  "file:./data/tracker.db";
const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN;

export default defineConfig({
  dialect: "sqlite",
  schema: "./db/schema.ts",
  out: "./drizzle",
  dbCredentials: authToken ? { url, authToken } as never : { url },
});
