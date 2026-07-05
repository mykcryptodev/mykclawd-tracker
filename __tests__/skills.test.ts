import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf-8");
}

describe("Bankr skill docs", () => {
  it("hosts the Log a Dog skill alongside BirdBets", () => {
    const skillsPage = read("app/skills/page.tsx");

    expect(skillsPage).toContain("https://mykclawd.xyz/api/skills/birdbets");
    expect(skillsPage).toContain("https://mykclawd.xyz/api/skills/logadog");
    expect(read("app/api/skills/logadog/route.ts")).toContain(
      "lib/skills/logadog/SKILL.md",
    );
    expect(read("app/api/skills/logadog/workflows/route.ts")).toContain(
      "lib/skills/logadog/workflows.md",
    );
    expect(read("app/api/skills/logadog/contracts/route.ts")).toContain(
      "lib/skills/logadog/contracts.md",
    );
  });

  it("documents the direct user-wallet Log a Dog voting flow", () => {
    const skill = read("lib/skills/logadog/SKILL.md");
    const workflows = read("lib/skills/logadog/workflows.md");
    const contracts = read("lib/skills/logadog/contracts.md");

    expect(skill).toContain("Vote `VALID DOG` or `SUS`");
    expect(skill).toContain("Season 4");
    expect(skill).toContain("Do not use thirdweb Engine");
    expect(workflows).toContain("AttestationManager.attestToLog");
    expect(workflows).toContain("Bankr's swap capability on Base");
    expect(workflows).toContain("Staking.canParticipateInAttestation");
    expect(contracts).toContain("Season 4 voting/staking contract");
    expect(contracts).toContain("0x42B32e8de4eC9cc53825bcd61D4d29A724BC9f54");
    expect(`${skill}\n${workflows}\n${contracts}`).not.toContain("Season 3");
  });
});
