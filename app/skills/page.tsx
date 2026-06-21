import { readFileSync } from "fs";
import { join } from "path";
import type { Metadata } from "next";
import { marked } from "marked";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SkillTabs } from "@/components/skill-tabs";

export const metadata: Metadata = {
  title: "Skills",
};

function readSkillFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8");
}

const SKILLS = [
  {
    id: "birdbets",
    name: "BirdBets Market",
    description:
      "Check odds, get bird visit stats, acquire MYKCLAWD, and place YES/NO predictions on the BirdBets prediction market on Base.",
    installPrompt:
      "Install this skill: https://mykclawd.xyz/api/skills/birdbets",
    files: [
      { label: "Skill", value: "skill", path: "lib/skills/birdbets/SKILL.md" },
      { label: "Workflows", value: "workflows", path: "lib/skills/birdbets/workflows.md" },
      { label: "Contracts", value: "contracts", path: "lib/skills/birdbets/contracts.md" },
    ],
  },
  {
    id: "logadog",
    name: "Log a Dog Voting",
    description:
      "Vote VALID DOG or SUS on Log a Dog submissions, with HOTDOG balance checks, staking setup, and private active-period result handling.",
    installPrompt:
      "Install this skill: https://mykclawd.xyz/api/skills/logadog",
    files: [
      { label: "Skill", value: "skill", path: "lib/skills/logadog/SKILL.md" },
      { label: "Workflows", value: "workflows", path: "lib/skills/logadog/workflows.md" },
      { label: "Contracts", value: "contracts", path: "lib/skills/logadog/contracts.md" },
    ],
  },
];

export default function SkillsPage() {
  const skillsWithHtml = SKILLS.map((skill) => ({
    ...skill,
    files: skill.files.map((f) => ({
      label: f.label,
      value: f.value,
      html: marked(readSkillFile(f.path)) as string,
    })),
  }));

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader title="Skills" showSync={false} />
        <div className="flex flex-1 flex-col gap-8 p-4 md:p-6">

          {/* Table of contents */}
          <nav aria-label="Skills">
            <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground mb-2">
              On this page
            </p>
            <ul className="flex flex-col gap-1">
              {SKILLS.map((skill) => (
                <li key={skill.id}>
                  <a
                    href={`#${skill.id}`}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {skill.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Skill sections */}
          {skillsWithHtml.map((skill) => (
            <section
              key={skill.id}
              id={skill.id}
              className="flex flex-col gap-4 scroll-mt-16"
            >
              <div>
                <h2 className="text-xl font-semibold">{skill.name}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {skill.description}
                </p>
              </div>
              <SkillTabs
                installPrompt={skill.installPrompt}
                files={skill.files}
              />
            </section>
          ))}

        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
