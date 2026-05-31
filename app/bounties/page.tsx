import type { Metadata } from "next";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLinkIcon, GitBranchIcon } from "lucide-react";
import { db } from "@/db/client";
import { bountyJobs } from "@/db/schema";
import { desc } from "drizzle-orm";

export const metadata: Metadata = {
  title: "Bounties",
};

export const dynamic = "force-dynamic";

type BountyJob = typeof bountyJobs.$inferSelect;

async function getBountyJobs(): Promise<BountyJob[]> {
  try {
    const { ne } = await import("drizzle-orm");
    return await db
      .select()
      .from(bountyJobs)
      .where(ne(bountyJobs.status, "skipped"))
      .orderBy(desc(bountyJobs.discoveredAt))
      .all();
  } catch {
    // Table doesn't exist yet
    return [];
  }
}

function formatReward(reward: number | null, token: string | null) {
  if (reward == null) return "—";
  const amount = reward.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return token ? `${amount} ${token}` : amount;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type StatusVariant = "default" | "secondary" | "destructive" | "outline";

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: StatusVariant; className: string }
> = {
  discovered: {
    label: "Discovered",
    variant: "secondary",
    className: "bg-muted text-muted-foreground",
  },
  in_progress: {
    label: "In Progress",
    variant: "default",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-0",
  },
  submitted: {
    label: "Submitted",
    variant: "default",
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 border-0",
  },
  won: {
    label: "Won",
    variant: "default",
    className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-0",
  },
  lost: {
    label: "Lost",
    variant: "destructive",
    className: "",
  },
  skipped: {
    label: "Skipped",
    variant: "secondary",
    className: "bg-muted text-muted-foreground",
  },
};

const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  bounty: {
    label: "Bounty",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-0",
  },
  project: {
    label: "Project",
    className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-0",
  },
  hackathon: {
    label: "Hackathon",
    className: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-0",
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    variant: "secondary" as StatusVariant,
    className: "",
  };
  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}

function TypeBadge({ type }: { type: string }) {
  const config = TYPE_CONFIG[type] ?? {
    label: type,
    className: "",
  };
  return (
    <Badge variant="default" className={config.className}>
      {config.label}
    </Badge>
  );
}

export default async function BountiesPage() {
  const jobs = await getBountyJobs();

  // Compute stats (skipped jobs already excluded from query)
  const totalJobs = jobs.length;
  const submitted = jobs.filter((j) => j.status === "submitted" || j.status === "won").length;
  const won = jobs.filter((j) => j.status === "won").length;

  // Group won rewards by token
  const earnedByToken: Record<string, number> = {};
  for (const job of jobs) {
    if (job.status === "won" && job.reward != null) {
      const token = job.rewardToken ?? "?";
      earnedByToken[token] = (earnedByToken[token] ?? 0) + job.reward;
    }
  }
  const earnedDisplay =
    Object.keys(earnedByToken).length === 0
      ? "0"
      : Object.entries(earnedByToken)
          .map(([token, amt]) => `${amt.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${token}`)
          .join(" + ");

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
        <SiteHeader title="Bounties" showSync={false} />
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Total Jobs", value: totalJobs.toString() },
              { label: "Submitted", value: submitted.toString() },
              { label: "Won", value: won.toString() },
              { label: "Total Earned", value: earnedDisplay },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-border/60 bg-card px-4 py-4 flex flex-col gap-1"
              >
                <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                  {label}
                </p>
                <p className="text-2xl font-semibold tabular-nums truncate">{value}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            {jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                <p className="text-muted-foreground text-sm max-w-sm">
                  No bounty jobs yet. The agent will start working on eligible listings soon.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reward</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="w-12">Repo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      {/* Title */}
                      <TableCell className="max-w-xs">
                        {job.prUrl ? (
                          <a
                            href={job.prUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 font-medium hover:underline underline-offset-2 text-foreground"
                          >
                            <span className="truncate">{job.title}</span>
                            <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground" />
                          </a>
                        ) : (
                          <span className="font-medium truncate block">{job.title}</span>
                        )}
                      </TableCell>

                      {/* Type */}
                      <TableCell>
                        <TypeBadge type={job.type} />
                      </TableCell>

                      {/* Reward */}
                      <TableCell className="font-mono text-sm tabular-nums">
                        {formatReward(job.reward, job.rewardToken)}
                      </TableCell>

                      {/* Deadline */}
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(job.deadline)}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <StatusBadge status={job.status} />
                      </TableCell>

                      {/* Submitted At */}
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(job.submittedAt)}
                      </TableCell>

                      {/* Repo */}
                      <TableCell>
                        {job.repoUrl ? (
                          <a
                            href={job.repoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="GitHub Repo"
                          >
                            <GitBranchIcon className="size-4" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
