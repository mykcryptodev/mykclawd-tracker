/**
 * Build smoke test: verifies the Next.js production build succeeds.
 * Catches issues like:
 *   - "clientId or secretKey must be provided" in /api/token-image
 *   - "c is not iterable" prerender crash on /
 *   - Any page failing to collect data or prerender
 *
 * Run: pnpm test:build
 * (Separate from unit tests since it takes ~30s)
 */
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import path from "path";

describe("Next.js production build", () => {
  it(
    "builds successfully with no page errors",
    () => {
      const projectRoot = path.resolve(__dirname, "..");
      let output = "";
      try {
        output = execSync("NEXT_PUBLIC_THIRDWEB_CLIENT_ID=test npx next build", {
          cwd: projectRoot,
          encoding: "utf8",
          env: { ...process.env, NEXT_PUBLIC_THIRDWEB_CLIENT_ID: "test" },
          timeout: 120_000,
        });
      } catch (err: unknown) {
        const error = err as { stdout?: string; stderr?: string };
        output = (error.stdout ?? "") + (error.stderr ?? "");
        const failLines = output
          .split("\n")
          .filter((l) => l.includes("Error") || l.includes("failed") || l.includes("prerender"));
        throw new Error(
          `Build failed:\n${failLines.slice(0, 20).join("\n")}\n\nFull output tail:\n${output.slice(-2000)}`
        );
      }

      // Verify key pages exist in build output
      expect(output).toContain("○ /");           // homepage prerendered
      expect(output).toContain("○ /inference");  // inference page prerendered
      expect(output).toContain("ƒ /pnl");        // portfolio server-rendered
      expect(output).not.toContain("Build error occurred");
    },
    130_000 // allow 130s for build
  );
});
