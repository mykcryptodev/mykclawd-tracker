import { NextResponse } from "next/server";
import os from "os";

export const dynamic = "force-dynamic";

export async function GET() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const cpus = os.cpus();
  const loadAvg = os.loadavg();

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    uptime: {
      system: os.uptime(),
      process: process.uptime(),
    },
    memory: {
      totalBytes: totalMem,
      usedBytes: usedMem,
      freeBytes: freeMem,
      usedPercent: (usedMem / totalMem) * 100,
    },
    cpu: {
      model: cpus[0]?.model ?? "Unknown",
      cores: cpus.length,
      loadAvg1m: loadAvg[0],
      loadAvg5m: loadAvg[1],
      loadAvg15m: loadAvg[2],
    },
    process: {
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      memoryUsage: process.memoryUsage(),
    },
  });
}
