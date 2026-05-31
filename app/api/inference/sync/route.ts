import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DUNE_QUERY_IDS = [7560232, 7560157, 7560211] as const;
const DUNE_API_BASE = "https://api.dune.com/api/v1";

type DuneExecuteResponse = {
  execution_id?: string;
  state?: string;
  error?: string;
};

type QueryExecution = {
  queryId: number;
  ok: boolean;
  executionId: string | null;
  state: string | null;
  error: string | null;
};

async function executeDuneQuery(queryId: number, apiKey: string): Promise<QueryExecution> {
  try {
    const res = await fetch(`${DUNE_API_BASE}/query/${queryId}/execute`, {
      method: "POST",
      headers: {
        "X-Dune-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ performance: "small" }),
    });

    const data = (await res.json().catch(() => ({}))) as DuneExecuteResponse;

    return {
      queryId,
      ok: res.ok,
      executionId: data.execution_id ?? null,
      state: data.state ?? null,
      error: res.ok ? null : data.error ?? `Dune returned ${res.status}`,
    };
  } catch (e) {
    return {
      queryId,
      ok: false,
      executionId: null,
      state: null,
      error: (e as Error).message,
    };
  }
}

export async function POST() {
  const apiKey = process.env.DUNE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DUNE_API_KEY not configured" }, { status: 500 });
  }

  const executions = await Promise.all(
    DUNE_QUERY_IDS.map((queryId) => executeDuneQuery(queryId, apiKey))
  );
  const failed = executions.filter((execution) => !execution.ok);

  if (failed.length > 0) {
    return NextResponse.json(
      {
        error: `Failed to start ${failed.length} Dune query refresh${failed.length === 1 ? "" : "es"}`,
        executions,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, executions });
}
