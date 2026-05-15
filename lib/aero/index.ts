// Orchestrator: discover → incremental fetch transfers → compute & persist snapshot.

import { db } from "../../db/client";
import { aeroConfig } from "../../db/schema";
import { eq } from "drizzle-orm";
import { discoverAeroPosition, DiscoveredPosition } from "./discover";
import { ingestAeroTransfers } from "./transfers";
import { computeAeroSnapshot, saveAeroSnapshot, AeroSnapshot } from "./snapshot";
import { evaluateAndAlert, MonitorResult } from "./monitor";
import { AERO_DEFAULT_ADDRESS } from "./constants";

async function getMonitoredAddress(): Promise<string> {
  const row = await db.select().from(aeroConfig).where(eq(aeroConfig.key, "monitored_address")).get();
  if (row) return row.value.toLowerCase();
  return (process.env.AERO_MONITOR_ADDRESS ?? AERO_DEFAULT_ADDRESS).toLowerCase();
}

export async function setMonitoredAddress(addr: string) {
  await db.insert(aeroConfig)
    .values({ key: "monitored_address", value: addr.toLowerCase() })
    .onConflictDoUpdate({ target: aeroConfig.key, set: { value: addr.toLowerCase() } })
    .run();
}

export async function ingestAeroMonitor(daysBack = 14): Promise<{
  address: string;
  position: DiscoveredPosition | null;
  newTransfers: number;
  snapshot: AeroSnapshot | null;
  monitor: MonitorResult | null;
}> {
  const address = await getMonitoredAddress();
  const position = await discoverAeroPosition(address, daysBack);
  if (!position) {
    return { address, position: null, newTransfers: 0, snapshot: null, monitor: null };
  }
  const { newRows } = await ingestAeroTransfers(position, daysBack);
  const snapshot = await computeAeroSnapshot(position, daysBack);
  await saveAeroSnapshot(snapshot);
  const monitor = await evaluateAndAlert(snapshot);
  return { address, position, newTransfers: newRows, snapshot, monitor };
}

export { discoverAeroPosition } from "./discover";
export { computeAeroSnapshot, saveAeroSnapshot } from "./snapshot";
export { evaluateAndAlert } from "./monitor";
export type { AeroSnapshot } from "./snapshot";
export type { DiscoveredPosition } from "./discover";
export type { MonitorResult } from "./monitor";
