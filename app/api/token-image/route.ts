import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { tokens } from "../../../db/schema";
import { runMigrations } from "../../../db/migrate";
import { resolveTokenImage } from "../../../lib/ingest/images";

export async function GET(request: NextRequest) {
  runMigrations();

  const address = request.nextUrl.searchParams.get("address")?.toLowerCase();
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const row = db.select().from(tokens).where(eq(tokens.contractAddress, address)).get();

  if (row?.imageChecked) {
    return NextResponse.json({ url: row.imageUrl ?? null });
  }

  const imageUrl = await resolveTokenImage(address, row?.coingeckoId ?? null);

  db.update(tokens)
    .set({ imageUrl, imageChecked: true })
    .where(eq(tokens.contractAddress, address))
    .run();

  return NextResponse.json({ url: imageUrl });
}
