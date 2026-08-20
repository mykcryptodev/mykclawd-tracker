import type { Metadata } from "next";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { CumulativeChart } from "@/components/pawthereum/cumulative-chart";
import { ExternalLinkIcon, TrophyIcon, RadioIcon } from "lucide-react";
import donationsData from "@/lib/pawthereum-donations.json";

export const metadata: Metadata = {
  title: "Pawthereum Donations",
  description:
    "Weekly Pawthereum endowment yield, voted on by the community and donated onchain via Endaoment.",
};

// ── types ────────────────────────────────────────────────────────────────────

interface Charity {
  name: string;
  ein: string | null;
  website: string | null;
  twitter: string | null;
  endaomentUrl: string | null;
  pitchTweetUrl: string | null;
  pitchCastUrl?: string | null;
  votes: number | null;
  votesX?: number | null;
  votesFc?: number | null;
  isWinner: boolean;
}

interface Week {
  pollDate: string;
  completedDate: string | null;
  pollUrl: string | null;
  resultsUrl: string | null;
  amountUsd: number;
  cumulativeUsd: number;
  donationTx: string | null;
  donationTxUrl: string | null;
  yieldTxUrl: string | null;
  totalVotes: number | null;
  pollStatus: string | null;
  winner: string | null;
  charities: Charity[];
  tieBreak?: string | null;
  farcasterUrl?: string | null;
  farcasterResultsUrl?: string | null;
}

interface CurrentWeek {
  pollDate: string;
  pollUrl: string | null;
  farcasterUrl?: string | null;
  amountUsd: number;
  pollStatus: string | null;
  totalVotes: number | null;
  charities: Charity[];
}

interface DonationsData {
  generatedAt: string;
  account: string;
  donationsWallet: string;
  submodule: string;
  totals: {
    usd: number;
    weeks: number;
    charitiesFunded: number;
    charitiesNominated: number;
    avgPerWeek: number;
    totalVotes: number;
    largestWeekUsd: number;
  };
  current: CurrentWeek | null;
  weeks: Week[];
}

const data = donationsData as DonationsData;

// ── formatting ───────────────────────────────────────────────────────────────

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function fullDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function titleCase(name: string) {
  // Endaoment returns some org names fully capitalized — soften those only.
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b(Llc|Usa|Sos)\b/g, (m) => m.toUpperCase());
}

function hostname(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function websiteHref(url: string | null) {
  if (!url) return null;
  return url.startsWith("http") ? url : `https://${url}`;
}

/** Vote counts are read back from X live, so they don't always explain the recorded winner. */
function resolution(week: Week) {
  const votes = week.charities.map((c) => c.votes ?? 0);
  const total = votes.reduce((a, b) => a + b, 0);
  if (total === 0) return "X reports no votes on this poll — winner as recorded at execution";
  const max = Math.max(...votes);
  const winnerVotes = week.charities.find((c) => c.isWinner)?.votes ?? 0;
  if (winnerVotes < max) return "Winner differs from current X vote counts — recorded at execution";
  if (votes.filter((v) => v === max).length > 1) return "Tie on votes — broken by poll order";
  return null;
}

// ── pieces ───────────────────────────────────────────────────────────────────

function CharityRow({
  charity,
  totalVotes,
  showWinner,
  showVotes = true,
}: {
  charity: Charity;
  totalVotes: number;
  showWinner: boolean;
  /** Off while a poll is still open — a running tally biases the vote. */
  showVotes?: boolean;
}) {
  const votes = charity.votes ?? 0;
  const pct = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
  const winner = showWinner && charity.isWinner;

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        winner
          ? "border-green-500/40 bg-green-50/60 dark:bg-green-900/15"
          : "border-border/60 bg-background/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {winner && <TrophyIcon className="size-3.5 shrink-0 text-green-600 dark:text-green-400" />}
            <span className="text-sm font-medium leading-tight">{titleCase(charity.name)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {charity.endaomentUrl && (
              <a
                href={charity.endaomentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                EIN {charity.ein}
              </a>
            )}
            {charity.website && (
              <a
                href={websiteHref(charity.website)!}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors truncate"
              >
                {hostname(charity.website)}
              </a>
            )}
            {charity.twitter && (
              <a
                href={`https://x.com/${charity.twitter.replace(/^@/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                {charity.twitter}
              </a>
            )}
            {charity.pitchTweetUrl && (
              <a
                href={charity.pitchTweetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                pitch ↗
              </a>
            )}
            {charity.pitchCastUrl && (
              <a
                href={charity.pitchCastUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                pitch (fc) ↗
              </a>
            )}
          </div>
        </div>
        {showVotes && (
          <span
            className="shrink-0 text-xs tabular-nums text-muted-foreground"
            title={
              charity.votesX != null || charity.votesFc != null
                ? `X: ${charity.votesX ?? 0} · Farcaster: ${charity.votesFc ?? 0}`
                : undefined
            }
          >
            {votes} {votes === 1 ? "vote" : "votes"}
            {charity.votesX != null && charity.votesFc != null && (
              <span className="ml-1 text-[10px] text-muted-foreground/70">
                ({charity.votesX}𝕏·{charity.votesFc}fc)
              </span>
            )}
          </span>
        )}
      </div>
      {showVotes && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${winner ? "bg-green-500" : "bg-muted-foreground/40"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function WeekCard({ week }: { week: Week }) {
  const totalVotes = week.totalVotes ?? 0;
  const note = resolution(week);

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border/60 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-medium">{fullDate(week.pollDate)}</h3>
          <span className="text-[11px] text-muted-foreground">
            {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tabular-nums">{usd.format(week.amountUsd)}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {usd.format(week.cumulativeUsd)} total
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-4">
        {week.charities.map((c) => (
          <CharityRow key={c.ein ?? c.name} charity={c} totalVotes={totalVotes} showWinner />
        ))}

        {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
        {week.tieBreak && (
          <p className="text-[11px] text-muted-foreground">
            Combined X + Farcaster vote tied — winner chosen at random among tied charities.
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
          {week.pollUrl && (
            <a
              href={week.pollUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              Poll (X) <ExternalLinkIcon className="size-3" />
            </a>
          )}
          {week.farcasterUrl && (
            <a
              href={week.farcasterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              Poll (Farcaster) <ExternalLinkIcon className="size-3" />
            </a>
          )}
          {week.resultsUrl && (
            <a
              href={week.resultsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              Results <ExternalLinkIcon className="size-3" />
            </a>
          )}
          {week.farcasterResultsUrl && (
            <a
              href={week.farcasterResultsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              Results (Farcaster) <ExternalLinkIcon className="size-3" />
            </a>
          )}
          {week.donationTxUrl && (
            <a
              href={week.donationTxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              {week.donationTx!.slice(0, 10)}… <ExternalLinkIcon className="size-3" />
            </a>
          )}
          {week.yieldTxUrl && (
            <a
              href={week.yieldTxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              Yield claim <ExternalLinkIcon className="size-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function LivePoll({ current }: { current: CurrentWeek }) {
  // Results stay hidden until voting closes — showing a running tally would
  // bias the vote, which is why X hides it in its own UI too.
  const open = current.pollStatus !== "closed";
  const totalVotes = current.totalVotes ?? 0;

  return (
    <div className="rounded-xl border border-blue-500/40 bg-blue-50/50 dark:bg-blue-900/10 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-blue-500/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <RadioIcon className="size-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-medium">
            {open ? "Poll open now" : "Awaiting donation"} · {fullDate(current.pollDate)}
          </h3>
          <Badge className="border-0 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            {open ? "Voting" : `${totalVotes} ${totalVotes === 1 ? "vote" : "votes"}`}
          </Badge>
        </div>
        <span className="text-lg font-semibold tabular-nums">
          {usd.format(current.amountUsd)} <span className="text-[11px] font-normal text-muted-foreground">at stake</span>
        </span>
      </div>
      <div className="flex flex-col gap-2 p-4">
        {current.charities.map((c) => (
          <CharityRow
            key={c.ein ?? c.name}
            charity={c}
            totalVotes={totalVotes}
            showWinner={false}
            showVotes={!open}
          />
        ))}
        {open && (
          <p className="text-[11px] text-muted-foreground">
            Results hidden until the poll closes.
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-4">
          {current.pollUrl && (
            <a
              href={current.pollUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Vote on X <ExternalLinkIcon className="size-3" />
            </a>
          )}
          {current.farcasterUrl && (
            <a
              href={current.farcasterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-600 dark:text-purple-400 hover:underline"
            >
              Vote on Farcaster <ExternalLinkIcon className="size-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function PawthereumPage() {
  const { totals, current, weeks } = data;
  const chartData = weeks.map((w) => ({
    date: w.pollDate,
    cumulative: w.cumulativeUsd,
    weekly: w.amountUsd,
  }));
  const recentFirst = [...weeks].reverse();

  const stats = [
    { label: "Total Donated", value: usd.format(totals.usd) },
    { label: "Weeks", value: String(totals.weeks) },
    { label: "Charities Funded", value: String(totals.charitiesFunded) },
    { label: "Nominated", value: String(totals.charitiesNominated) },
    { label: "Avg / Week", value: usdWhole.format(totals.avgPerWeek) },
    { label: "Votes Cast", value: String(totals.totalVotes) },
  ];

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader title="Pawthereum Donations" showSync={false} />
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">

          <p className="max-w-3xl text-sm text-muted-foreground">
            Every week the{" "}
            <a
              href={`https://basescan.org/address/${data.submodule}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2 hover:no-underline"
            >
              Pawthereum endowment
            </a>{" "}
            yield is claimed on Base, three animal-welfare charities are drawn from Endaoment, and{" "}
            <a
              href={`https://x.com/${data.account}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2 hover:no-underline"
            >
              @{data.account}
            </a>{" "}
            runs a 24-hour poll. The winner receives the full week&apos;s yield onchain via Endaoment —
            every donation below is a verifiable Base transaction.
          </p>

          <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
            {/* eslint-disable-next-line @next/next/no-img-element -- static explainer asset */}
            <img
              src="/images/pawthereum-explainer.jpg"
              alt="Pawthereum yield donation flow: endowment yield in Mamo is claimed weekly via the Gnosis Safe submodule, a community poll on X picks an animal shelter, and the donation is executed via Endaoment."
              className="h-auto w-full"
              loading="lazy"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {stats.map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-border/60 bg-card px-4 py-4 flex flex-col gap-1"
              >
                <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                  {label}
                </p>
                <p className="text-2xl font-semibold tabular-nums truncate">{value}</p>
              </div>
            ))}
          </div>

          {weeks.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <p className="mb-3 text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                Cumulative Donated
              </p>
              <CumulativeChart data={chartData} />
            </div>
          )}

          {current && <LivePoll current={current} />}

          <div className="flex flex-col gap-4">
            {recentFirst.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-card flex flex-col items-center justify-center py-20 text-center px-4">
                <p className="text-muted-foreground text-sm max-w-sm">
                  No donations recorded yet.
                </p>
              </div>
            ) : (
              recentFirst.map((w) => <WeekCard key={w.pollDate} week={w} />)
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Donations sent from{" "}
            <a
              href={`https://basescan.org/address/${data.donationsWallet}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono hover:text-foreground transition-colors"
            >
              {data.donationsWallet.slice(0, 6)}…{data.donationsWallet.slice(-4)}
            </a>
            . Updated weekly after each donation executes.
          </p>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
