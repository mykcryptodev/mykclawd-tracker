// Get internal ETH transfers via BlockScout
import "dotenv/config";

const ADDR = "0xf142022273602c6a6c0ea7a044d21082273bd686";
const SINCE = Math.floor(Date.now()/1000) - 12*86400;

async function main() {
  let next: any = null;
  const internals: any[] = [];
  do {
    const qs = next ? "?" + new URLSearchParams(next).toString() : "";
    const url = `https://base.blockscout.com/api/v2/addresses/${ADDR}/internal-transactions${qs}`;
    const res = await fetch(url);
    const j: any = await res.json();
    if (!j.items) break;
    for (const it of j.items) {
      const ts = Math.floor(new Date(it.timestamp).getTime()/1000);
      if (ts < SINCE) { next = null; break; }
      internals.push({
        block: it.block,
        ts,
        from: it.from?.hash?.toLowerCase(),
        to: it.to?.hash?.toLowerCase(),
        value: it.value,
        type: it.type,
        success: it.success,
        tx: it.transaction_hash,
        gasUsed: it.gas_used,
      });
    }
    next = j.next_page_params;
  } while (next);

  console.log(`Got ${internals.length} internal txs in window\n`);
  // ETH IN to safe
  const inEth = internals.filter(i=>i.to===ADDR && BigInt(i.value||"0")>0n && i.success);
  console.log(`ETH IN (internal) to safe: ${inEth.length}`);
  let totalIn = 0n;
  for (const i of inEth) {
    totalIn += BigInt(i.value);
    console.log(`  ${new Date(i.ts*1000).toISOString()} | +${(Number(BigInt(i.value))/1e18).toFixed(8)} ETH from ${i.from} | tx=${i.tx}`);
  }
  console.log(`  TOTAL ETH IN: ${(Number(totalIn)/1e18).toFixed(8)}\n`);

  // ETH OUT from safe
  const outEth = internals.filter(i=>i.from===ADDR && BigInt(i.value||"0")>0n && i.success);
  console.log(`ETH OUT (internal) from safe: ${outEth.length}`);
  let totalOut = 0n;
  for (const i of outEth) {
    totalOut += BigInt(i.value);
    console.log(`  ${new Date(i.ts*1000).toISOString()} | -${(Number(BigInt(i.value))/1e18).toFixed(8)} ETH to ${i.to} | tx=${i.tx}`);
  }
  console.log(`  TOTAL ETH OUT: ${(Number(totalOut)/1e18).toFixed(8)}`);
}
main().catch(e=>{console.error(e); process.exit(1);});
