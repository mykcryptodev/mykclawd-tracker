import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SURPLUS_BALANCE_URL =
  "https://api.surplusintelligence.ai/v1/payments/balance";

export async function GET() {
  const apiKey = process.env.SURPLUS_INTELLIGENCE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "SURPLUS_INTELLIGENCE_API_KEY not configured" },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(SURPLUS_BALANCE_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `surplus api returned ${res.status}` },
        { status: 502 },
      );
    }

    const data = await res.json();

    return NextResponse.json({
      availableUsdcMicro: String(data.usdc_available_usdc ?? "0"),
      heldUsdcMicro: String(data.usdc_held_usdc ?? "0"),
      creditBalanceUsdcMicro: String(data.credit_balance_usdc ?? "0"),
      pendingDepositUsdcMicro: String(data.pending_deposit_usdc ?? "0"),
      depositAddress: data.deposit_address ?? null,
      accountStatus: data.account_status ?? null,
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
