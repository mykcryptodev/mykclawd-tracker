// Build a standalone HTML report from data/aero-summary.json + aero-analysis.json
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";

interface Row { sym: string; dir: "in"|"out"; block: number; ts: number; from: string; to: string; value: string; tx: string }

const summary = JSON.parse(readFileSync("data/aero-summary.json","utf-8"));
const analysis = JSON.parse(readFileSync("data/aero-analysis.json","utf-8")) as { rows: Row[]; txs: any[] };

const ADDR = "0xF142022273602c6a6c0Ea7A044d21082273bD686";
const W_NOW = summary.prices.W_NOW;
const C_NOW = summary.prices.C_NOW;
const A_NOW = summary.prices.A_NOW;
const W_START = summary.prices.W_START;

// Compute the activity buckets (per-day claim count, per-hour rebalance activity)
const claims = analysis.rows.filter(r => r.sym==="AERO" && r.dir==="in").sort((a,b)=>a.ts-b.ts);
const swaps = analysis.rows.filter(r => r.sym!=="AERO").sort((a,b)=>a.ts-b.ts);

// Per-day timeline: AERO claimed each day, and tx count
const dayBuckets: Record<string, { aero: number; txs: Set<string> }> = {};
for (const r of analysis.rows) {
  const d = new Date(r.ts*1000).toISOString().slice(0,10);
  const b = dayBuckets[d] ??= { aero: 0, txs: new Set() };
  b.txs.add(r.tx);
  if (r.sym==="AERO" && r.dir==="in") b.aero += Number(r.value)/1e18;
}
const dayKeys = Object.keys(dayBuckets).sort();

// Position breakdown by USD
const posWusd = summary.end.positionWeth * W_NOW;
const posCusd = summary.end.positionCbbtc * C_NOW;
const aeroAllUsd = (summary.end.walletAero + summary.end.pendingAero) * A_NOW;
const walletEthUsd = summary.end.walletEth * W_NOW;
const walletWethUsd = summary.end.walletWeth * W_NOW;

// HODL baseline: 3 ETH (starting balance) + 1.0007 WETH (Steakhouse inflow during the window)
const STAKEHOUSE_WETH = 1.00074667;
const baselineEth = summary.start.eth + STAKEHOUSE_WETH; // 4 ETH-equivalent
const hodlEndUsd = baselineEth * W_NOW;
const startEffectiveUsd = summary.start.eth * W_START + STAKEHOUSE_WETH * W_START;

// Strategy total
const stratEndUsd = posWusd + posCusd + aeroAllUsd + walletEthUsd + walletWethUsd;

const deltaUsd = stratEndUsd - hodlEndUsd;
const deltaPct = (stratEndUsd / hodlEndUsd - 1) * 100;
const apr = ((Math.pow(stratEndUsd / hodlEndUsd, 365/summary.window.days)) - 1) * 100;

// AERO contribution + LP-only PnL
const aeroContribution = aeroAllUsd;
const lpOnlyDelta = deltaUsd - aeroContribution; // negative = LP lost vs hodling ETH

// HTML
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtt = (n: number, d=6) => n.toLocaleString("en-US", { minimumFractionDigits: Math.min(4,d), maximumFractionDigits: Math.min(20,Math.max(d,4)) });
const explorer = (h: string) => `https://basescan.org/tx/${h}`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Aerodrome WETH/cbBTC LP — Strategy Report</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<style>
  :root {
    --bg: #0b0d10;
    --card: #14181d;
    --card-2: #1a1f26;
    --border: #232a33;
    --text: #e8edf2;
    --text-dim: #8d97a3;
    --green: #2ecc71;
    --red: #e74c3c;
    --blue: #4ea8ff;
    --gold: #f5b840;
    --purple: #b78cff;
  }
  * { box-sizing: border-box; }
  body { background: var(--bg); color: var(--text); font: 14px/1.55 -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif; margin: 0; padding: 24px; }
  .container { max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px 0; font-weight: 600; }
  h2 { font-size: 16px; margin: 0 0 12px 0; font-weight: 600; color: var(--text); }
  .sub { color: var(--text-dim); font-size: 13px; margin-bottom: 24px; }
  .grid { display: grid; gap: 16px; }
  .grid-2 { grid-template-columns: 1fr 1fr; }
  .grid-3 { grid-template-columns: 1fr 1fr 1fr; }
  .grid-4 { grid-template-columns: repeat(4, 1fr); }
  @media (max-width: 800px) { .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; } }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  .kpi { display: flex; flex-direction: column; gap: 4px; }
  .kpi-label { font-size: 12px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
  .kpi-value { font-size: 28px; font-weight: 700; font-feature-settings: "tnum"; }
  .kpi-sub { font-size: 12px; color: var(--text-dim); }
  .pos { color: var(--green); }
  .neg { color: var(--red); }
  .neutral { color: var(--text); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border); }
  th { color: var(--text-dim); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  td.num, th.num { text-align: right; font-feature-settings: "tnum"; }
  .mono { font-family: ui-monospace, SF Mono, Menlo, monospace; font-size: 12px; }
  .addr { color: var(--text-dim); }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
  .pill-green { background: rgba(46,204,113,0.12); color: var(--green); }
  .pill-red   { background: rgba(231,76,60,0.12);  color: var(--red); }
  .pill-blue  { background: rgba(78,168,255,0.12); color: var(--blue); }
  .pill-gold  { background: rgba(245,184,64,0.12); color: var(--gold); }
  .chart-wrap { position: relative; height: 280px; }
  .chart-wrap-tall { position: relative; height: 360px; }
  .footnote { color: var(--text-dim); font-size: 12px; line-height: 1.6; margin-top: 24px; }
  a { color: var(--blue); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .range-bar { height: 8px; background: var(--card-2); border-radius: 4px; position: relative; margin: 12px 0; }
  .range-bar-fill { position: absolute; top: 0; bottom: 0; background: var(--blue); border-radius: 4px; }
  .range-marker { position: absolute; top: -4px; bottom: -4px; width: 2px; background: var(--gold); }
  .row { display: flex; justify-content: space-between; padding: 6px 0; }
  .row .label { color: var(--text-dim); }
  .row .value { font-weight: 500; font-feature-settings: "tnum"; }
</style>
</head>
<body>
<div class="container">

<h1>Aerodrome WETH/cbBTC — Active LP Strategy Report</h1>
<div class="sub">
  <span class="mono">${ADDR}</span>
  &nbsp;·&nbsp; <span class="pill pill-blue">Safe multisig</span>
  &nbsp;·&nbsp; ${new Date(summary.window.firstTs*1000).toISOString().slice(0,16).replace("T"," ")} → ${new Date(summary.window.lastTs*1000).toISOString().slice(0,16).replace("T"," ")} UTC
  &nbsp;·&nbsp; ${summary.window.days.toFixed(2)} days
</div>

<!-- TLDR Card -->
<div class="card" style="margin-bottom:16px;">
  <div class="grid grid-4">
    <div class="kpi">
      <div class="kpi-label">Strategy ending value</div>
      <div class="kpi-value">\$${fmt(stratEndUsd)}</div>
      <div class="kpi-sub">from ~\$${fmt(startEffectiveUsd)} deployed</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">HODL baseline (4 ETH)</div>
      <div class="kpi-value">\$${fmt(hodlEndUsd)}</div>
      <div class="kpi-sub">if you'd just held the ETH</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Δ vs HODL</div>
      <div class="kpi-value ${deltaUsd>=0?'pos':'neg'}">${deltaUsd>=0?'+':''}\$${fmt(deltaUsd)}</div>
      <div class="kpi-sub">${deltaPct>=0?'+':''}${deltaPct.toFixed(2)}% in ${summary.window.days.toFixed(2)}d &nbsp; (~${apr.toFixed(0)}% APR if sustained)</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Gas paid</div>
      <div class="kpi-value">\$${fmt(summary.usd.totalGasUsd)}</div>
      <div class="kpi-sub">${summary.gasTxsCounted} txs · ${fmtt(summary.usd.totalGasEth,8)} ETH</div>
    </div>
  </div>
</div>

<!-- Charts row -->
<div class="grid grid-2" style="margin-bottom:16px;">
  <div class="card">
    <h2>Where the money is now</h2>
    <div class="chart-wrap"><canvas id="composition"></canvas></div>
  </div>
  <div class="card">
    <h2>Strategy vs HODL — value breakdown</h2>
    <div class="chart-wrap"><canvas id="vsHodl"></canvas></div>
  </div>
</div>

<!-- AERO over time + claim cadence -->
<div class="grid grid-2" style="margin-bottom:16px;">
  <div class="card">
    <h2>AERO claimed (cumulative)</h2>
    <div class="chart-wrap"><canvas id="aeroCum"></canvas></div>
  </div>
  <div class="card">
    <h2>Daily activity — tx count</h2>
    <div class="chart-wrap"><canvas id="txCount"></canvas></div>
  </div>
</div>

<!-- Position details -->
<div class="card" style="margin-bottom:16px;">
  <h2>Active LP position</h2>
  <div class="grid grid-2">
    <div>
      <div class="row"><span class="label">Token ID</span><span class="value mono">#364941</span></div>
      <div class="row"><span class="label">Pool</span><span class="value mono">WETH / cbBTC (CL, ts=10)</span></div>
      <div class="row"><span class="label">Range (ticks)</span><span class="value">[-265830, -265800]</span></div>
      <div class="row"><span class="label">Range width</span><span class="value">30 ticks (~0.3% price band)</span></div>
      <div class="row"><span class="label">Owned by</span><span class="value mono">CLGauge (staked)</span></div>
      <div class="row"><span class="label">Liquidity (L)</span><span class="value">${(4273892629615703).toLocaleString()}</span></div>
    </div>
    <div>
      <div class="row"><span class="label">In-position WETH</span><span class="value">${fmtt(summary.end.positionWeth,6)} (\$${fmt(posWusd)})</span></div>
      <div class="row"><span class="label">In-position cbBTC</span><span class="value">${fmtt(summary.end.positionCbbtc,8)} (\$${fmt(posCusd)})</span></div>
      <div class="row"><span class="label">Total in LP</span><span class="value">\$${fmt(posWusd+posCusd)}</span></div>
      <div class="row"><span class="label">Pending AERO (gauge)</span><span class="value">${fmtt(summary.end.pendingAero,4)} (\$${fmt(summary.end.pendingAero*A_NOW)})</span></div>
      <div class="row"><span class="label">Claimed AERO (in wallet)</span><span class="value">${fmtt(summary.end.walletAero,2)} (\$${fmt(summary.end.walletAero*A_NOW)})</span></div>
      <div class="row"><span class="label">Total AERO earned</span><span class="value pos">+${fmtt(summary.end.walletAero+summary.end.pendingAero,2)} AERO = \$${fmt(aeroAllUsd)}</span></div>
    </div>
  </div>
</div>

<!-- Capital trace -->
<div class="card" style="margin-bottom:16px;">
  <h2>Capital trace (where the money came from & went)</h2>
  <table>
    <thead><tr><th>Step</th><th>Event</th><th class="num">Amount</th><th class="num">~ USD (at the time)</th></tr></thead>
    <tbody>
      <tr><td><span class="pill pill-blue">START</span></td><td>Safe pre-funded with native ETH (≥14d before strategy)</td><td class="num">3.0000 ETH</td><td class="num">\$${fmt(3 * W_START)}</td></tr>
      <tr><td><span class="pill pill-blue">+IN</span></td><td>WETH inflow from Steakhouse ETH vault (Morpho) — withdrawal</td><td class="num">1.0007 WETH</td><td class="num">\$${fmt(1.0007 * W_START)}</td></tr>
      <tr><td><span class="pill pill-gold">SETUP</span></td><td>CoW Protocol swap: WETH → cbBTC (acquired LP cbBTC leg)</td><td class="num">~1.995 WETH → 0.0568 cbBTC</td><td class="num">~\$4,700 swapped</td></tr>
      <tr><td><span class="pill pill-gold">SETUP</span></td><td>LP minted in pool 0x42d4… range [-265830, -265800]</td><td class="num">WETH + cbBTC</td><td class="num">paired into NFT</td></tr>
      <tr><td><span class="pill pill-blue">LOOP</span></td><td>~36 claim/rebalance cycles via Aerodrome UniversalRouter (every ~3.5h)</td><td class="num">81.7 WETH / 2.97 cbBTC turned over</td><td class="num">churn</td></tr>
      <tr><td><span class="pill pill-green">REWARD</span></td><td>AERO claimed from CLGauge</td><td class="num">+964.76 AERO</td><td class="num">\$${fmt(964.76 * A_NOW)} (today)</td></tr>
      <tr><td><span class="pill pill-blue">END</span></td><td>Strategy current total value (LP + AERO + wallet)</td><td class="num">—</td><td class="num"><b>\$${fmt(stratEndUsd)}</b></td></tr>
    </tbody>
  </table>
</div>

<!-- Why AERO yield got eaten -->
<div class="card" style="margin-bottom:16px;">
  <h2>Decomposing the +\$${fmt(deltaUsd)} vs HODL</h2>
  <div class="chart-wrap-tall"><canvas id="waterfall"></canvas></div>
  <p class="footnote" style="margin-top:8px;">
    AERO rewards added <b class="pos">+\$${fmt(aeroAllUsd)}</b>, but the LP itself produced
    <b class="${lpOnlyDelta>=0?'pos':'neg'}">${lpOnlyDelta>=0?'+':''}\$${fmt(lpOnlyDelta)}</b>
    relative to just holding ETH — the ultra-narrow 0.3% range bleeds value to slippage every time the position is re-centered.
    Net outperformance is the small residual after AERO offsets the LP drag.
  </p>
</div>

<!-- Activity by day -->
<div class="card" style="margin-bottom:16px;">
  <h2>Per-day breakdown</h2>
  <table>
    <thead><tr><th>Day (UTC)</th><th class="num">Txs</th><th class="num">AERO claimed</th><th class="num">AERO value @ today</th></tr></thead>
    <tbody>
      ${dayKeys.map(d => {
        const b = dayBuckets[d];
        return `<tr><td>${d}</td><td class="num">${b.txs.size}</td><td class="num">${b.aero.toFixed(4)}</td><td class="num">\$${fmt(b.aero * A_NOW)}</td></tr>`;
      }).join("\n")}
      <tr style="font-weight:600;"><td>Total</td><td class="num">${Object.values(dayBuckets).reduce((s,b)=>s+b.txs.size,0)}</td><td class="num">${dayKeys.reduce((s,d)=>s+dayBuckets[d].aero,0).toFixed(4)}</td><td class="num">\$${fmt(dayKeys.reduce((s,d)=>s+dayBuckets[d].aero,0) * A_NOW)}</td></tr>
    </tbody>
  </table>
</div>

<!-- Key counterparties -->
<div class="card" style="margin-bottom:16px;">
  <h2>Counterparties identified on-chain</h2>
  <table>
    <thead><tr><th>Address</th><th>Identity</th><th>Role in strategy</th></tr></thead>
    <tbody>
      <tr><td class="mono">0x42d4…b76b</td><td>Aerodrome Slipstream CLPool</td><td>The WETH/cbBTC pool itself</td></tr>
      <tr><td class="mono">0x61e0…0817</td><td>Aerodrome CLGauge</td><td>Holds the LP NFT, pays AERO emissions</td></tr>
      <tr><td class="mono">0xe1f8…8b53</td><td>Aerodrome NFPM (Slipstream)</td><td>Mints/manages CL position NFTs</td></tr>
      <tr><td class="mono">0xcaf2…7c67</td><td>Aerodrome UniversalRouter</td><td>Used for rebalancing swaps</td></tr>
      <tr><td class="mono">0x9008…ab41</td><td>CoW Protocol GPv2Settlement</td><td>Used to acquire cbBTC via WETH swap</td></tr>
      <tr><td class="mono">0x4e1d…aebd</td><td>Steakhouse ETH (safestmWETH) vault</td><td>Source of 1.0007 WETH inflow at start</td></tr>
    </tbody>
  </table>
</div>

<div class="footnote">
  Prices: WETH/cbBTC from CoinGecko (BTC used as cbBTC proxy), AERO from CoinGecko. Block range scanned via Thirdweb Insight + Coinbase RPC.
  Starting capital = on-chain balance at block ${(summary.start.eth, '45,645,988')} (just before first strategy tx) <i>plus</i> the 1.0007 WETH that came in from the Steakhouse vault during the first activity block, since both were paid into the strategy.
  Gas is the total ETH spent by Safe signers across the 45 strategy txs.
  Position-value math uses standard Uniswap V3 sqrt-price formulas at the current pool tick.
</div>

</div>

<script>
// ---- Composition Pie ----
new Chart(document.getElementById('composition'), {
  type: 'doughnut',
  data: {
    labels: ['LP WETH (\$${fmt(posWusd)})', 'LP cbBTC (\$${fmt(posCusd)})', 'AERO claimed+pending (\$${fmt(aeroAllUsd)})', 'Wallet ETH+WETH (\$${fmt(walletEthUsd+walletWethUsd)})'],
    datasets: [{
      data: [${posWusd.toFixed(2)}, ${posCusd.toFixed(2)}, ${aeroAllUsd.toFixed(2)}, ${(walletEthUsd+walletWethUsd).toFixed(2)}],
      backgroundColor: ['#4ea8ff', '#f5b840', '#b78cff', '#8d97a3'],
      borderWidth: 0,
    }]
  },
  options: {
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#e8edf2', font: { size: 12 } } },
      tooltip: { callbacks: { label: (ctx) => ctx.label + ': $' + ctx.parsed.toLocaleString() } }
    }
  }
});

// ---- Strategy vs HODL bar ----
new Chart(document.getElementById('vsHodl'), {
  type: 'bar',
  data: {
    labels: ['HODL 4 ETH', 'Strategy (LP + AERO + wallet)'],
    datasets: [{
      label: 'Ending USD value',
      data: [${hodlEndUsd.toFixed(2)}, ${stratEndUsd.toFixed(2)}],
      backgroundColor: ['#8d97a3', '#2ecc71'],
      borderRadius: 6,
    }]
  },
  options: {
    maintainAspectRatio: false,
    indexAxis: 'x',
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => '$' + ctx.parsed.y.toLocaleString() } }
    },
    scales: {
      x: { ticks: { color: '#e8edf2' }, grid: { display: false } },
      y: { ticks: { color: '#8d97a3', callback: (v) => '$' + v.toLocaleString() }, grid: { color: '#232a33' }, beginAtZero: false }
    }
  }
});

// ---- AERO cumulative ----
const claims = ${JSON.stringify(claims.map(c => ({ ts: c.ts, amt: Number(c.value)/1e18 })))};
let cum = 0;
const aeroLabels = [];
const aeroValues = [];
for (const c of claims) {
  cum += c.amt;
  const d = new Date(c.ts*1000);
  aeroLabels.push(d.toISOString().slice(5,16).replace('T',' '));
  aeroValues.push(cum);
}
new Chart(document.getElementById('aeroCum'), {
  type: 'line',
  data: {
    labels: aeroLabels,
    datasets: [{
      label: 'Cumulative AERO claimed',
      data: aeroValues,
      borderColor: '#b78cff', backgroundColor: 'rgba(183,140,255,0.18)',
      tension: 0.25, fill: true, pointRadius: 2, pointBackgroundColor: '#b78cff',
    }]
  },
  options: {
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: {
        title: (items) => items[0].label + ' UTC',
        label: (ctx) => ctx.parsed.y.toFixed(2) + ' AERO ($' + (ctx.parsed.y * ${A_NOW}).toFixed(2) + ')'
      } }
    },
    scales: {
      x: { ticks: { color: '#8d97a3', maxTicksLimit: 8, autoSkip: true }, grid: { color: '#232a33' } },
      y: { ticks: { color: '#8d97a3', callback: (v) => v + ' AERO' }, grid: { color: '#232a33' }, beginAtZero: true }
    }
  }
});

// ---- Daily tx count ----
const dayKeys = ${JSON.stringify(dayKeys)};
const dayCounts = ${JSON.stringify(dayKeys.map(d => dayBuckets[d].txs.size))};
new Chart(document.getElementById('txCount'), {
  type: 'bar',
  data: {
    labels: dayKeys,
    datasets: [{
      label: 'Unique txs',
      data: dayCounts,
      backgroundColor: '#4ea8ff',
      borderRadius: 4,
    }]
  },
  options: {
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#8d97a3' }, grid: { display: false } },
      y: { ticks: { color: '#8d97a3', stepSize: 1 }, grid: { color: '#232a33' }, beginAtZero: true }
    }
  }
});

// ---- Waterfall: HODL → +AERO → +/- LP → Strategy ----
const hodlVal = ${hodlEndUsd.toFixed(2)};
const aeroVal = ${aeroAllUsd.toFixed(2)};
const lpDelta = ${lpOnlyDelta.toFixed(2)}; // can be negative
const stratVal = ${stratEndUsd.toFixed(2)};

// Build floating-bar waterfall: each bar has [base, top]
function fb(base, top) { return [Math.min(base, top), Math.max(base, top)]; }
const wfData = [
  { label: 'HODL 4 ETH', floats: fb(0, hodlVal), color: '#8d97a3' },
  { label: '+ AERO rewards', floats: fb(hodlVal, hodlVal + aeroVal), color: '#b78cff' },
  { label: (lpDelta >= 0 ? '+ LP gains' : '− LP slippage/IL'), floats: fb(hodlVal + aeroVal, hodlVal + aeroVal + lpDelta), color: lpDelta>=0 ? '#2ecc71' : '#e74c3c' },
  { label: 'Strategy total', floats: fb(0, stratVal), color: '#2ecc71' },
];
new Chart(document.getElementById('waterfall'), {
  type: 'bar',
  data: {
    labels: wfData.map(w => w.label),
    datasets: [{
      label: 'USD',
      data: wfData.map(w => w.floats),
      backgroundColor: wfData.map(w => w.color),
      borderRadius: 6,
    }]
  },
  options: {
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: {
        label: (ctx) => {
          const [a, b] = ctx.raw;
          const delta = b - a;
          return '$' + delta.toLocaleString(undefined, { maximumFractionDigits: 0 }) + (ctx.dataIndex === 1 || ctx.dataIndex === 2 ? ' (Δ)' : '');
        }
      } }
    },
    scales: {
      x: { ticks: { color: '#e8edf2' }, grid: { display: false } },
      y: { ticks: { color: '#8d97a3', callback: (v) => '$' + v.toLocaleString() }, grid: { color: '#232a33' }, beginAtZero: true }
    }
  }
});
</script>
</body>
</html>`;

writeFileSync("data/aero-report.html", html);
console.log("Wrote data/aero-report.html (" + (html.length/1024).toFixed(1) + " KB)");
console.log("Open with: open data/aero-report.html");
