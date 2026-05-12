const CDP_SQL_URL = "https://api.cdp.coinbase.com/platform/v2/data/query/run";

export class CdpSqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CdpSqlError";
  }
}

export function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

export function sqlDateTimeFromUnix(tsSeconds: number) {
  return sqlString(new Date(tsSeconds * 1000).toISOString().replace("T", " ").replace("Z", ""));
}

export function parseSqlTimestamp(ts: string | number): number {
  if (typeof ts === "number") return Math.floor(ts);
  return Math.floor(new Date(ts).getTime() / 1000);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function cdpQuery(sql: string, attempt = 1): Promise<Record<string, unknown>[]> {
  const key = process.env.CDP_API_KEY?.trim();
  if (!key) throw new CdpSqlError("CDP_API_KEY is missing");

  let res: Response;
  try {
    res = await fetch(CDP_SQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql }),
    });
  } catch (e) {
    if (attempt < 3) {
      await sleep(500 * attempt);
      return cdpQuery(sql, attempt + 1);
    }
    throw new CdpSqlError(`CDP fetch failed: ${(e as Error).message}`);
  }

  const text = await res.text();
  let json: { result?: Record<string, unknown>[]; errorMessage?: string };
  try {
    json = JSON.parse(text) as { result?: Record<string, unknown>[]; errorMessage?: string };
  } catch {
    throw new CdpSqlError(`CDP HTTP ${res.status}: ${text.slice(0, 120)}`);
  }

  if (!res.ok) throw new CdpSqlError(json.errorMessage ?? `CDP HTTP ${res.status}`);
  if (json.errorMessage) throw new CdpSqlError(json.errorMessage);
  return json.result ?? [];
}
