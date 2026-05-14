import type { Metadata } from "next";
import os from "os";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Server Health",
};

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
  const parts = [];
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

interface StatRowProps {
  label: string;
  value: string;
}
function StatRow({ label, value }: StatRowProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
        {label}
      </span>
      <span className="text-sm font-mono">{value}</span>
    </div>
  );
}

export default function HealthPage() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPct = (usedMem / totalMem) * 100;

  const cpus = os.cpus();
  const loadAvg = os.loadavg();

  const sysUptime = os.uptime();
  const procUptime = process.uptime();
  const procMem = process.memoryUsage();

  const asOf = new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC";

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
                      {formatBytes(usedMem)} / {formatBytes(totalMem)}
                    </span>
                    <span
                      className={`font-mono font-semibold ${
                        memPct > 90
                          ? "text-red-500"
                          : memPct > 70
                          ? "text-yellow-500"
                          : "text-green-500"
                      }`}
                    >
                      {memPct.toFixed(1)}%
                    </span>
                  </div>
                  <ProgressBar value={memPct} />
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <StatRow label="Free" value={formatBytes(freeMem)} />
                    <StatRow label="Total" value={formatBytes(totalMem)} />
                  </div>
                </CardContent>
              </Card>

              {/* CPU */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                    CPU
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <StatRow label="Model" value={cpus[0]?.model ?? "Unknown"} />
                  <StatRow label="Cores" value={String(cpus.length)} />
                  <StatRow label="Load (1m)" value={loadAvg[0].toFixed(2)} />
                  <StatRow label="Load (5m)" value={loadAvg[1].toFixed(2)} />
                  <StatRow label="Load (15m)" value={loadAvg[2].toFixed(2)} />
                </CardContent>
              </Card>

              {/* Uptime */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                    Uptime
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <StatRow label="System" value={formatUptime(sysUptime)} />
                  <StatRow label="Process" value={formatUptime(procUptime)} />
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
                  <StatRow label="Node.js" value={process.version} />
                  <StatRow label="Platform" value={`${os.platform()} ${os.arch()}`} />
                  <StatRow label="Heap Used" value={formatBytes(procMem.heapUsed)} />
                  <StatRow label="Heap Total" value={formatBytes(procMem.heapTotal)} />
                  <StatRow label="RSS" value={formatBytes(procMem.rss)} />
                  <StatRow label="External" value={formatBytes(procMem.external)} />
                </CardContent>
              </Card>

            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
