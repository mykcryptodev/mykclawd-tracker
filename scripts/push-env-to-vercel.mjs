/**
 * One-shot: read .env.local and mirror keys to Vercel (production, preview, development).
 * Run: node scripts/push-env-to-vercel.mjs
 * Does not print values.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");

function parseDotenv(text) {
  const out = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const name = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (name && value !== "") out.push({ name, value });
  }
  return out;
}

const entries = parseDotenv(readFileSync(envPath, "utf8"));
const publicPrefixes = ["NEXT_PUBLIC_"];

for (const { name, value } of entries) {
  const isPublic = publicPrefixes.some((p) => name.startsWith(p));
  const extra = isPublic ? ["--no-sensitive"] : [];

  for (const target of ["production", "preview", "development"]) {
    // Preview: empty branch arg = all preview branches (required in non-interactive mode).
    const args =
      target === "preview"
        ? [
            "vercel",
            "env",
            "add",
            name,
            target,
            "",
            "--value",
            value,
            "--yes",
            "--force",
            ...extra,
          ]
        : [
            "vercel",
            "env",
            "add",
            name,
            target,
            "--value",
            value,
            "--yes",
            "--force",
            ...extra,
          ];
    const r = spawnSync("npx", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (r.status !== 0) {
      console.error(`Failed: ${name} (${target})\n${r.stderr || r.stdout}`);
      process.exit(r.status ?? 1);
    }
    console.error(`OK ${name} -> ${target}`);
  }
}

console.error(`Done: ${entries.length} keys x 3 targets`);
