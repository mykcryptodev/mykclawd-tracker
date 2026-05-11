import { db } from "../../db/client";
import { prices, tokens, syncState } from "../../db/schema";
import { getDailyPrices } from "../coingecko";
import { getZerionPriceHistory } from "../zerion";
import { getCodexDailyPrices } from "../codex";
import { eq, and, isNotNull } from "drizzle-orm";

function toDateString(tsMs: number): string {
  return new Date(tsMs).toISOString().slice(0, 10);
}

export async function ingestPrices(): Promise<number> {
  let added = 0;
  const stateKey = "prices_last_fetch";

  const pricedTokens = db
    .select()
    .from(tokens)
    .where(eq(tokens.isPriced, true))
    .all();

  const total = pricedTokens.filter((t) => t.coingeckoId).length;
  let done = 0;

  for (const token of pricedTokens) {
    if (!token.coingeckoId) continue;
    done++;
    console.log(`  ${done}/${total} tokens | ${added} price rows`);

    // Check how many days of data we already have
    const existingCount = db
      .select({ date: prices.date })
      .from(prices)
      .where(eq(prices.tokenAddress, token.contractAddress))
      .all().length;

    // Always fetch last 7 days to keep recent data fresh; fetch 365 days if cold start
    const days = existingCount < 10 ? 365 : 7;

    try {
      const dailyPrices = await getDailyPrices(token.coingeckoId, days);

      for (const [tsMs, priceUsd] of dailyPrices) {
        const date = toDateString(tsMs);
        db.insert(prices)
          .values({
            tokenAddress: token.contractAddress,
            date,
            priceUsd,
            source: "coingecko",
          })
          .onConflictDoUpdate({
            target: [prices.tokenAddress, prices.date],
            set: { priceUsd, source: "coingecko" },
          })
          .run();
        added++;
      }
    } catch (e) {
      console.warn(
        `Failed to fetch prices for ${token.symbol} (${token.coingeckoId}):`,
        (e as Error).message
      );
    }
  }

  // Zerion price pass: tokens with zerionId but no CoinGecko ID
  const zerionTokens = db
    .select()
    .from(tokens)
    .where(and(isNotNull(tokens.zerionId), eq(tokens.isPriced, true)))
    .all()
    .filter((t) => !t.coingeckoId && t.zerionId);

  if (zerionTokens.length > 0) {
    console.log(`  Fetching prices from Zerion for ${zerionTokens.length} tokens...`);
    let zdone = 0;
    for (const token of zerionTokens) {
      zdone++;
      console.log(`  Zerion prices ${zdone}/${zerionTokens.length} | ${token.symbol || token.contractAddress.slice(0, 10)}`);
      try {
        const points = await getZerionPriceHistory(token.zerionId!);
        for (const [tsSeconds, priceUsd] of points) {
          const date = toDateString(tsSeconds * 1000);
          db.insert(prices)
            .values({ tokenAddress: token.contractAddress, date, priceUsd, source: "zerion" })
            .onConflictDoUpdate({
              target: [prices.tokenAddress, prices.date],
              set: { priceUsd, source: "zerion" },
            })
            .run();
          added++;
        }
      } catch (e) {
        console.warn(`  Zerion price fetch failed for ${token.symbol}: ${(e as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // Codex pass: tokens not priced by CoinGecko or Zerion
  const codexCandidates = db
    .select()
    .from(tokens)
    .where(and(eq(tokens.isPriced, false), eq(tokens.codexChecked, false)))
    .all();

  if (codexCandidates.length > 0) {
    console.log(`  Checking ${codexCandidates.length} tokens on Codex...`);
    let codexFound = 0;
    for (let i = 0; i < codexCandidates.length; i++) {
      const token = codexCandidates[i];
      if ((i + 1) % 50 === 0 || i + 1 === codexCandidates.length) {
        console.log(`  Codex ${i + 1}/${codexCandidates.length} | ${codexFound} found`);
      }
      try {
        const points = await getCodexDailyPrices(token.contractAddress);
        if (points.length > 0) {
          for (const [tsSeconds, priceUsd] of points) {
            const date = toDateString(tsSeconds * 1000);
            db.insert(prices)
              .values({ tokenAddress: token.contractAddress, date, priceUsd, source: "codex" })
              .onConflictDoUpdate({
                target: [prices.tokenAddress, prices.date],
                set: { priceUsd, source: "codex" },
              })
              .run();
            added++;
          }
          db.update(tokens)
            .set({ isPriced: true, codexChecked: true })
            .where(eq(tokens.contractAddress, token.contractAddress))
            .run();
          codexFound++;
        } else {
          db.update(tokens)
            .set({ codexChecked: true })
            .where(eq(tokens.contractAddress, token.contractAddress))
            .run();
        }
      } catch (e) {
        console.warn(`  Codex failed for ${token.symbol}: ${(e as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    console.log(`  Codex: ${codexFound}/${codexCandidates.length} tokens found`);
  }

  db.insert(syncState)
    .values({ key: stateKey, value: new Date().toISOString() })
    .onConflictDoUpdate({
      target: syncState.key,
      set: { value: new Date().toISOString() },
    })
    .run();

  return added;
}

// Look up USD price for a token on a specific date (returns 0 if not found).
export function getPriceForDate(
  tokenAddress: string,
  dateStr: string
): number {
  const row = db
    .select()
    .from(prices)
    .where(
      and(
        eq(prices.tokenAddress, tokenAddress),
        eq(prices.date, dateStr)
      )
    )
    .get();
  return row?.priceUsd ?? 0;
}

// Returns sorted array of {date, priceUsd} for a token
export function getPriceHistory(
  tokenAddress: string
): Array<{ date: string; priceUsd: number }> {
  return db
    .select({ date: prices.date, priceUsd: prices.priceUsd })
    .from(prices)
    .where(eq(prices.tokenAddress, tokenAddress))
    .all()
    .sort((a, b) => a.date.localeCompare(b.date));
}
