import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import fs from "fs";
import path from "path";
import * as schema from "./schema";

const dbPath = path.join(process.cwd(), "data", "tracker.db");
const fallbackDbPath = process.env.VERCEL ? "/tmp/tracker.db" : dbPath;
const localUrl = `file:${fallbackDbPath}`;

function getDatabaseUrl() {
  return (
    process.env.TURSO_DATABASE_URL ??
    process.env.LIBSQL_DATABASE_URL ??
    localUrl
  );
}

function getAuthToken() {
  return process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN;
}

if (getDatabaseUrl() === localUrl) {
  fs.mkdirSync(path.dirname(fallbackDbPath), { recursive: true });
}

export const client = createClient({
  url: getDatabaseUrl(),
  authToken: getAuthToken(),
});

export const db = drizzle(client, { schema });

export function changedRows(result: { rowsAffected?: number; changes?: number }) {
  return result.rowsAffected ?? result.changes ?? 0;
}
