import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import fs from "fs";
import path from "path";
import * as schema from "./schema";

const dbPath = path.join(process.cwd(), "data", "tracker.db");
const fallbackDbPath = process.env.VERCEL ? "/tmp/tracker.db" : dbPath;
const localUrl = `file:${fallbackDbPath}`;

function nonEmptyEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getDatabaseUrl() {
  return (
    nonEmptyEnv("TURSO_DATABASE_URL") ??
    nonEmptyEnv("LIBSQL_DATABASE_URL") ??
    localUrl
  );
}

function getAuthToken() {
  return nonEmptyEnv("TURSO_AUTH_TOKEN") ?? nonEmptyEnv("LIBSQL_AUTH_TOKEN");
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
