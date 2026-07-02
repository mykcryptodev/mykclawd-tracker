import type { Metadata } from "next";
import { db } from "@/db/client";
import { syncState } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runMigrations } from "@/db/migrate";
import { CpuChart } from "@/components/health/cpu-chart";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Server Health",
};

interface HealthSnapshot {
  timestamp: string;
  uptime: { system: number; process: number };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
  };
  disk: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
  } | null;
  swap: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
  } | null;
  cpu: {
    model: string;
    cores: number;
    loadAvg1m: number;
    loadAvg5m: number;
    loadAvg15m: number;
  };
  process: {
    nodeVersion: string;
    platform: string;
    arch: string;
    memoryUsage: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
  };
}

const HEALTH_SNAPSHOT_KEY = "health_snapshot";

async function getHealthSnapshot(): Promise<HealthSnapshot | null> {
  try {
    await runMigrations();
    const row = await db
      .select()
      .from(syncState)
      .where(eq(syncState.key, HEALTH_SNAPSHOT_KEY))
      .get();
    if (!row) return null;
    return JSON.parse(row.value) as HealthSnapshot;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + " GB";
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(2) + " MB";
  return (bytes / 1024).toFixed(2) + " KB";
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color =
    pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
        {label}
      </span>
      <span className="text-sm font-mono">{value}</span>
    </div>
  );
}

export default async function HealthPage() {
  const data = await getHealthSnapshot();

  const asOf = data
    ? new Date(data.timestamp).toISOString().slice(0, 19).replace("T", " ") + " UTC"
    : "—";

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
        <SiteHeader asOf={asOf} title="Server Health" variant="minimal" />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 px-4 lg:px-6">

              {!data ? (
                <Card className="border-border/60">
                  <CardContent className="py-12 text-center text-sm text-muted-foreground">
                    No health data yet. The metrics reporter on the home server hasn&apos;t pushed any data.
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Memory */}
                  <Card className="border-border/60">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                        Memory
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-mono">
                          {formatBytes(data.memory.usedBytes)} / {formatBytes(data.memory.totalBytes)}
                        </span>
                        <span
                          className={`font-mono font-semibold ${
                            data.memory.usedPercent > 90
                              ? "text-red-500"
                              : data.memory.usedPercent > 70
                              ? "text-yellow-500"
                              : "text-green-500"
                          }`}
                        >
                          {data.memory.usedPercent.toFixed(1)}%
                        </span>
                      </div>
                      <ProgressBar value={data.memory.usedPercent} />
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <StatRow label="Free" value={formatBytes(data.memory.freeBytes)} />
                        <StatRow label="Total" value={formatBytes(data.memory.totalBytes)} />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Swap */}
                  {data.swap && (
                    <Card className="border-border/60">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                          Swap
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        {data.swap.totalBytes === 0 ? (
                          <div className="text-sm text-muted-foreground">No swap configured</div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-mono">
                                {formatBytes(data.swap.usedBytes)} / {formatBytes(data.swap.totalBytes)}
                              </span>
                              <span
                                className={`font-mono font-semibold ${
                                  data.swap.usedPercent > 90
                                    ? "text-red-500"
                                    : data.swap.usedPercent > 70
                                    ? "text-yellow-500"
                                    : "text-green-500"
                                }`}
                              >
                                {data.swap.usedPercent.toFixed(1)}%
                              </span>
                            </div>
                            <ProgressBar value={data.swap.usedPercent} />
                            <div className="grid grid-cols-2 gap-2 mt-1">
                              <StatRow label="Free" value={formatBytes(data.swap.freeBytes)} />
                              <StatRow label="Total" value={formatBytes(data.swap.totalBytes)} />
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Disk */}
                  {data.disk && (
                    <Card className="border-border/60">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                          Disk
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-mono">
                            {formatBytes(data.disk.usedBytes)} / {formatBytes(data.disk.totalBytes)}
                          </span>
                          <span
                            className={`font-mono font-semibold ${
                              data.disk.usedPercent > 90
                                ? "text-red-500"
                                : data.disk.usedPercent > 70
                                ? "text-yellow-500"
                                : "text-green-500"
                            }`}
                          >
                            {data.disk.usedPercent.toFixed(1)}%
                          </span>
                        </div>
                        <ProgressBar value={data.disk.usedPercent} />
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <StatRow label="Free" value={formatBytes(data.disk.freeBytes)} />
                          <StatRow label="Total" value={formatBytes(data.disk.totalBytes)} />
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* CPU */}
                  <CpuChart
                    model={data.cpu.model}
                    cores={data.cpu.cores}
                    loadAvg1m={data.cpu.loadAvg1m}
                    loadAvg5m={data.cpu.loadAvg5m}
                    loadAvg15m={data.cpu.loadAvg15m}
                  />

                  {/* Uptime */}
                  <Card className="border-border/60">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                        Uptime
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <StatRow label="System" value={formatUptime(data.uptime.system)} />
                      <StatRow label="Process" value={formatUptime(data.uptime.process)} />
                    </CardContent>
                  </Card>

                  {/* Process */}
                  <Card className="border-border/60">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                        Process
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <StatRow label="Node.js" value={data.process.nodeVersion} />
                      <StatRow label="Platform" value={`${data.process.platform} ${data.process.arch}`} />
                      <StatRow label="Heap Used" value={formatBytes(data.process.memoryUsage.heapUsed)} />
                      <StatRow label="Heap Total" value={formatBytes(data.process.memoryUsage.heapTotal)} />
                      <StatRow label="RSS" value={formatBytes(data.process.memoryUsage.rss)} />
                      <StatRow label="External" value={formatBytes(data.process.memoryUsage.external)} />
                    </CardContent>
                  </Card>
                </>
              )}

            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
