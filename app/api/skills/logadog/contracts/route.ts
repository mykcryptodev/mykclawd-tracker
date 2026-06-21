import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-static";

export function GET() {
  const text = readFileSync(
    join(process.cwd(), "lib/skills/logadog/contracts.md"),
    "utf-8"
  );
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
