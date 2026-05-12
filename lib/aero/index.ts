// Orchestrator: discover → incremental fetch transfers → compute & persist snapshot.

import { db } from "../../db/client";
import { aeroConfig } from "../../db/schema";
import { eq } from "drizzle-orm";
import { discoverAeroPosition, DiscoveredPosition } from "./discover";
import { ingestAeroTransfers } from "./transfers";
import { computeAeroSnapshot, saveAeroSnapshot, AeroSnapshot } from "./snapshot";
import { AERO_DEFAULT_ADDRESS } from "./constants";

function getMonitoredAddress(): string {
  const row = db.select().from(aeroConfig).where(eq(aeroConfig.key, "monitored_address")).get();
  if (row) return row.value.toLowerCase();
  return (process.env.AERO_MONITOR_ADDRESS ?? AERO_DEFAULT_ADDRESS).toLowerCase();
}

export function setMonitoredAddress(addr: string) {
  db.insert(aeroConfig)
    .values({ key: "monitored_address", value: addr.toLowerCase() })
    .onConflictDoUpdate({ target: aeroConfig.key, set: { value: addr.toLowerCase() } })
    .run();
}

export async function ingestAeroMonitor(daysBack = 14): Promise<{
  address: string;
  position: DiscoveredPosition | null;
  newTransfers: number;
  snapshot: AeroSnapshot | null;
}> {
  const address = getMonitoredAddress();
  const position = await discoverAeroPosition(address, daysBack);
  if (!position) {
    return { address, position: null, newTransfers: 0, snapshot: null };
  }
  const { newRows } = await ingestAeroTransfers(position, daysBack);
  const snapshot = await computeAeroSnapshot(position, daysBack);
  saveAeroSnapshot(snapshot);
  return { address, position, newTransfers: newRows, snapshot };
}

export { discoverAeroPosition } from "./discover";
export { computeAeroSnapshot, saveAeroSnapshot } from "./snapshot";
export type { AeroSnapshot } from "./snapshot";
export type { DiscoveredPosition } from "./discover";
