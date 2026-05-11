/**
 * Weighted-average cost basis engine.
 *
 * Processes transfers in chronological order and maintains a lot per token.
 * All amounts are in "human units" (already divided by decimals).
 */

export interface Lot {
  quantity: number;
  avgCostUsd: number;
  realizedPnlUsd: number;
}

export interface ProcessResult {
  lot: Lot;
  realizedDelta: number;
}

export function processInbound(
  lot: Lot,
  amount: number,
  priceUsd: number
): ProcessResult {
  if (amount <= 0) return { lot, realizedDelta: 0 };

  const newQty = lot.quantity + amount;
  const newAvg =
    newQty > 0
      ? (lot.quantity * lot.avgCostUsd + amount * priceUsd) / newQty
      : priceUsd;

  return {
    lot: { ...lot, quantity: newQty, avgCostUsd: newAvg },
    realizedDelta: 0,
  };
}

export function processOutbound(
  lot: Lot,
  amount: number,
  priceUsd: number
): ProcessResult {
  if (amount <= 0) return { lot, realizedDelta: 0 };

  const soldQty = Math.min(amount, lot.quantity);
  const realized = soldQty * (priceUsd - lot.avgCostUsd);
  const newQty = Math.max(0, lot.quantity - soldQty);

  return {
    lot: {
      quantity: newQty,
      avgCostUsd: newQty > 0 ? lot.avgCostUsd : 0,
      realizedPnlUsd: lot.realizedPnlUsd + realized,
    },
    realizedDelta: realized,
  };
}

// Process a gas deduction: remove ETH qty and credit realized loss.
export function processGas(lot: Lot, gasEthAmount: number, ethPriceUsd: number): ProcessResult {
  return processOutbound(lot, gasEthAmount, ethPriceUsd);
}
