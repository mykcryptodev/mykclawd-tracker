// Collect all relevant events into data/aero-analysis.json
import "dotenv/config";
import { writeFileSync } from "fs";
import { createThirdwebClient, prepareEvent } from "thirdweb";
import { Insight } from "thirdweb";
import { base } from "thirdweb/chains";

const client = createThirdwebClient({ clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID! });
const ADDR = "0xf142022273602c6a6c0ea7a044d21082273bd686";
const WETH = "0x4200000000000000000000000000000000000006";
const CBBTC = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
const AERO = "0x940181a94a35a4569e4529a3cdfb74e38fd98631";

const ADDR_PADDED = "0x000000000000000000000000" + ADDR.slice(2).toLowerCase();
const SINCE = Math.floor(Date.now()/1000) - 12*86400;

const ERC20_TRANSFER = prepareEvent({ signature: "event Transfer(address indexed from, address indexed to, uint256 value)" });

type Row = { token: string; sym: string; dir: "in"|"out"; block: number; ts: number; from: string; to: string; value: string; tx: string };

async function scanToken(sym: string, contract: string, inbound: boolean): Promise<Row[]> {
  const out: Row[] = [];
  let page = 0;
  while (true) {
    const events: any[] = await Insight.getContractEvents({
      client, chains: [base],
      contractAddress: contract as `0x${string}`,
      event: ERC20_TRANSFER,
      decodeLogs: true,
      queryOptions: {
        filter_block_timestamp_gte: SINCE,
        [inbound ? "filter_topic_2" : "filter_topic_1"]: ADDR_PADDED,
        sort_by: "block_number", sort_order: "asc",
        limit: 500, page,
      },
    } as any);
    if (!events.length) break;
    for (const e of events) {
      // Decoded sometimes fails. Parse from topics directly.
      const from = "0x" + e.topics[1].slice(26);
      const to   = "0x" + e.topics[2].slice(26);
      const value = BigInt(e.data).toString();
      out.push({
        token: contract.toLowerCase(),
        sym,
        dir: inbound ? "in" : "out",
        block: e.block_number,
        ts: e.block_timestamp,
        from, to, value,
        tx: e.transaction_hash,
      });
    }
    if (events.length < 500) break;
    page++;
  }
  return out;
}

async function main() {
  const all: Row[] = [];
  for (const [sym,addr] of [["WETH",WETH],["cbBTC",CBBTC],["AERO",AERO]] as const) {
    for (const dir of [true,false]) {
      const rows = await scanToken(sym, addr, dir);
      console.log(`${sym} ${dir?"IN":"OUT"}: ${rows.length}`);
      all.push(...rows);
    }
  }
  // Native ETH from txlist (use BlockScout)
  const blockScoutTxs: any[] = [];
  let nextPageParams: any = null;
  do {
    const url: string = `https://base.blockscout.com/api/v2/addresses/${ADDR}/transactions${nextPageParams?"?"+new URLSearchParams(nextPageParams).toString():""}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json.items) break;
    for (const t of json.items) {
      const ts = Math.floor(new Date(t.timestamp).getTime()/1000);
      if (ts < SINCE) { nextPageParams = null; break; }
      blockScoutTxs.push({
        hash: t.hash,
        block: t.block_number,
        ts,
        from: t.from?.hash?.toLowerCase(),
        to: t.to?.hash?.toLowerCase(),
        method: t.method || t.decoded_input?.method_call || "",
        value: t.value,
        gas_used: t.gas_used,
        gas_price: t.gas_price,
        status: t.status,
      });
    }
    nextPageParams = json.next_page_params;
  } while (nextPageParams);
  console.log(`BlockScout txs (12d): ${blockScoutTxs.length}`);

  writeFileSync("data/aero-analysis.json", JSON.stringify({ since: SINCE, addr: ADDR, rows: all, txs: blockScoutTxs }, null, 2));
  console.log("Wrote data/aero-analysis.json");

  // Quick summary
  const sumByTokenDir: Record<string,bigint> = {};
  for (const r of all) {
    const k = `${r.sym} ${r.dir}`;
    sumByTokenDir[k] = (sumByTokenDir[k] ?? 0n) + BigInt(r.value);
  }
  console.log("\n--- Raw value sums ---");
  for (const [k,v] of Object.entries(sumByTokenDir)) console.log(`  ${k}: ${v.toString()}`);

  // Counterparty tally
  console.log("\n--- Counterparties for each token (top 10) ---");
  for (const sym of ["WETH","cbBTC","AERO"]) {
    const tally: Record<string, { in: bigint; out: bigint; count: number }> = {};
    for (const r of all.filter(x=>x.sym===sym)) {
      const cp = r.dir==="in" ? r.from : r.to;
      const t = tally[cp] ??= { in: 0n, out: 0n, count: 0 };
      if (r.dir==="in") t.in += BigInt(r.value); else t.out += BigInt(r.value);
      t.count++;
    }
    console.log(`\n${sym}:`);
    for (const [cp,t] of Object.entries(tally).sort((a,b)=>b[1].count-a[1].count).slice(0,10)) {
      console.log(`  ${cp} | IN=${t.in.toString()} OUT=${t.out.toString()} count=${t.count}`);
    }
  }
}
main().catch(e=>{console.error(e); process.exit(1);});
