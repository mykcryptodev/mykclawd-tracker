/**
 * Bankr order fetcher.
 *
 * Bankr's /user/automation endpoint is session-only (no API-key auth).
 * The Agent API is accessible with an API key: we submit a structured prompt,
 * poll for completion, then parse the JSON response.
 */

const BANKR_BASE = "https://api.bankr.bot";
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 15; // 30 s max

export interface BankrOrder {
  source: "bankr";
  orderId: string;
  status: string; // "active" | "completed" | "cancelled" | "triggered" | "paused"
  type: string; // "limit" | "stop" | "dca" | "twap" | "other"
  description: string;
  tokenSymbol: string | null;
  tokenAddress: string | null;
  side: "buy" | "sell" | null;
  targetPrice: number | null;
  amount: number | null;
  currency: string | null;
  createdAt: string | null;
  triggeredAt: string | null;
}

interface AgentJobResponse {
  success: boolean;
  jobId: string;
  status: string;
  response?: string;
}

async function submitPrompt(prompt: string): Promise<string> {
  const apiKey = process.env.BANKR_API_KEY ?? "";
  const res = await fetch(`${BANKR_BASE}/agent/prompt`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bankr prompt submit ${res.status}: ${text.slice(0, 200)}`);
  }
  const data: AgentJobResponse = await res.json();
  if (!data.success || !data.jobId) throw new Error("Bankr: no jobId returned");
  return data.jobId;
}

async function pollJob(jobId: string): Promise<string> {
  const apiKey = process.env.BANKR_API_KEY ?? "";
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${BANKR_BASE}/agent/job/${jobId}`, {
      headers: { "X-API-Key": apiKey },
    });
    if (!res.ok) continue;
    const data: AgentJobResponse = await res.json();
    if (data.status === "completed" && data.response) return data.response;
    if (data.status === "failed") throw new Error(`Bankr job failed: ${jobId}`);
  }
  throw new Error(`Bankr job timed out: ${jobId}`);
}

/**
 * Returns all Bankr automations/orders as structured data.
 * Uses agent API: submit prompt → poll → parse JSON from response.
 */
export async function fetchBankrOrders(): Promise<BankrOrder[]> {
  if (!process.env.BANKR_API_KEY) return [];

  const prompt = `List ALL of my automations, limit orders, stop orders, DCA orders, and TWAP orders — both active and historical. Return ONLY a JSON array (no markdown, no explanation) where each element has these fields:
{
  "id": string,
  "status": "active"|"completed"|"cancelled"|"triggered"|"paused",
  "type": "limit"|"stop"|"dca"|"twap"|"other",
  "description": string,
  "tokenSymbol": string|null,
  "tokenAddress": string|null,
  "side": "buy"|"sell"|null,
  "targetPrice": number|null,
  "amount": number|null,
  "currency": string|null,
  "createdAt": ISO string|null,
  "triggeredAt": ISO string|null
}
If there are no orders, return [].`;

  const jobId = await submitPrompt(prompt);
  const raw = await pollJob(jobId);

  // Extract JSON from the response (agent may wrap it in prose)
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const items = JSON.parse(jsonMatch[0]) as Array<{
      id: string;
      status: string;
      type: string;
      description: string;
      tokenSymbol?: string;
      tokenAddress?: string;
      side?: string;
      targetPrice?: number;
      amount?: number;
      currency?: string;
      createdAt?: string;
      triggeredAt?: string;
    }>;

    return items.map((item) => ({
      source: "bankr" as const,
      orderId: item.id,
      status: item.status,
      type: item.type,
      description: item.description,
      tokenSymbol: item.tokenSymbol ?? null,
      tokenAddress: item.tokenAddress?.toLowerCase() ?? null,
      side: (item.side === "buy" || item.side === "sell") ? item.side : null,
      targetPrice: item.targetPrice ?? null,
      amount: item.amount ?? null,
      currency: item.currency ?? null,
      createdAt: item.createdAt ?? null,
      triggeredAt: item.triggeredAt ?? null,
    }));
  } catch {
    return [];
  }
}
