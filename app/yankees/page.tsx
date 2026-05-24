"use client";

import * as React from "react";
import type { Metadata } from "next";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ── types ────────────────────────────────────────────────────────────────────

interface MlbTeam {
  id: number;
  name: string;
}

interface MlbTeamEntry {
  team: MlbTeam;
  leagueRecord?: { wins: number; losses: number; pct: string };
  score?: number;
  isWinner?: boolean;
}

interface MlbGame {
  gamePk: number;
  gameDate: string;        // ISO UTC
  officialDate: string;    // YYYY-MM-DD local
  status: {
    abstractGameState: string; // "Preview" | "Live" | "Final"
    detailedState: string;
    statusCode: string;
    startTimeTBD: boolean;
  };
  teams: { away: MlbTeamEntry; home: MlbTeamEntry };
  venue: { id: number; name: string };
  dayNight: "day" | "night";
  doubleHeader: string;
  seriesDescription: string;
}

interface MlbDateEntry {
  date: string;
  games: MlbGame[];
}

interface MlbScheduleResponse {
  dates: MlbDateEntry[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

const YANKEES_ID = 147;

function isYankeesHome(game: MlbGame) {
  return game.teams.home.team.id === YANKEES_ID;
}

function getYankees(game: MlbGame): MlbTeamEntry {
  return isYankeesHome(game) ? game.teams.home : game.teams.away;
}

function getOpponent(game: MlbGame): MlbTeamEntry {
  return isYankeesHome(game) ? game.teams.away : game.teams.home;
}

function gameResult(game: MlbGame): "W" | "L" | "T" | null {
  const state = game.status.abstractGameState;
  if (state !== "Final") return null;
  const yank = getYankees(game);
  if (yank.score === undefined) return null;
  const opp = getOpponent(game);
  if (yank.score === opp.score) return "T";
  return yank.isWinner ? "W" : "L";
}

function formatTime(isoUtc: string): string {
  const d = new Date(isoUtc);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "America/New_York",
  });
}

function abbrev(name: string): string {
  // Common abbreviations for display
  const map: Record<string, string> = {
    "New York Yankees": "NYY",
    "Boston Red Sox": "BOS",
    "Toronto Blue Jays": "TOR",
    "Baltimore Orioles": "BAL",
    "Tampa Bay Rays": "TB",
    "Houston Astros": "HOU",
    "Texas Rangers": "TEX",
    "Seattle Mariners": "SEA",
    "Los Angeles Angels": "LAA",
    "Oakland Athletics": "OAK",
    "Minnesota Twins": "MIN",
    "Cleveland Guardians": "CLE",
    "Chicago White Sox": "CWS",
    "Detroit Tigers": "DET",
    "Kansas City Royals": "KC",
    "New York Mets": "NYM",
    "Atlanta Braves": "ATL",
    "Philadelphia Phillies": "PHI",
    "Washington Nationals": "WSH",
    "Miami Marlins": "MIA",
    "Chicago Cubs": "CHC",
    "Milwaukee Brewers": "MIL",
    "St. Louis Cardinals": "STL",
    "Cincinnati Reds": "CIN",
    "Pittsburgh Pirates": "PIT",
    "Los Angeles Dodgers": "LAD",
    "San Francisco Giants": "SF",
    "San Diego Padres": "SD",
    "Arizona Diamondbacks": "ARI",
    "Colorado Rockies": "COL",
    "Sacramento River Cats": "SAC",
    "Athletics": "OAK",
  };
  return map[name] ?? name.slice(0, 3).toUpperCase();
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Build a 6-week grid for a given month/year
function buildCalendarGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: (Date | null)[][] = [];
  let day = 1 - firstDay;
  for (let week = 0; week < 6; week++) {
    const row: (Date | null)[] = [];
    for (let d = 0; d < 7; d++) {
      if (day < 1 || day > daysInMonth) {
        row.push(null);
      } else {
        row.push(new Date(year, month, day));
      }
      day++;
    }
    grid.push(row);
    if (day > daysInMonth) break;
  }
  return grid;
}

function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// ── component ────────────────────────────────────────────────────────────────

export default function YankeesPage() {
  const today = new Date();
  const [viewYear, setViewYear] = React.useState(today.getFullYear());
  const [viewMonth, setViewMonth] = React.useState(today.getMonth());
  const [schedule, setSchedule] = React.useState<Record<string, MlbGame[]>>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  // Fetch full season schedule once (or when year changes)
  const fetchedYears = React.useRef<Set<number>>(new Set());

  React.useEffect(() => {
    if (fetchedYears.current.has(viewYear)) return;
    fetchedYears.current.add(viewYear);
    setLoading(true);
    setError(null);

    fetch(`/api/yankees?season=${viewYear}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<MlbScheduleResponse>;
      })
      .then((data) => {
        const byDate: Record<string, MlbGame[]> = {};
        for (const entry of data.dates ?? []) {
          byDate[entry.date] = entry.games;
        }
        setSchedule((prev) => ({ ...prev, ...byDate }));
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [viewYear]);

  const grid = buildCalendarGrid(viewYear, viewMonth);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  const todayKey = toLocalDateKey(today);

  // Compute season record from loaded schedule
  const record = React.useMemo(() => {
    let w = 0, l = 0;
    for (const games of Object.values(schedule)) {
      for (const g of games) {
        const r = gameResult(g);
        if (r === "W") w++;
        if (r === "L") l++;
      }
    }
    return { w, l };
  }, [schedule]);

  const selectedGames = selectedDate ? (schedule[selectedDate] ?? []) : [];

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
        <SiteHeader title="Yankees" variant="minimal" />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 px-4 lg:px-6">

              {/* Season record banner */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold font-[family-name:var(--font-segment)]">⚾ Yankees</span>
                  <span className="text-sm text-muted-foreground">{viewYear} Season</span>
                </div>
                {!loading && (
                  <Badge variant="outline" className="font-mono text-sm">
                    {record.w}–{record.l}
                  </Badge>
                )}
                {loading && (
                  <span className="text-xs text-muted-foreground animate-pulse">loading…</span>
                )}
                {error && (
                  <span className="text-xs text-destructive">Error: {error}</span>
                )}
              </div>

              {/* Calendar card */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Button variant="ghost" size="icon" onClick={prevMonth}>
                      <ChevronLeftIcon className="h-4 w-4" />
                    </Button>
                    <CardTitle className="text-sm font-semibold tracking-wide">
                      {MONTH_NAMES[viewMonth]} {viewYear}
                    </CardTitle>
                    <Button variant="ghost" size="icon" onClick={nextMonth}>
                      <ChevronRightIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0 pb-4">
                  {/* Day headers */}
                  <div className="grid grid-cols-7 border-b border-border/40 mb-1">
                    {DOW.map((d) => (
                      <div key={d} className="text-center text-[10px] uppercase tracking-widest text-muted-foreground py-1">
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Weeks */}
                  {grid.map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7">
                      {week.map((date, di) => {
                        if (!date) {
                          return <div key={di} className="min-h-[72px] border-b border-r border-border/10 last:border-r-0" />;
                        }
                        const key = toLocalDateKey(date);
                        const games = schedule[key] ?? [];
                        const isToday = key === todayKey;
                        const isSelected = key === selectedDate;
                        const isCurrentMonth = date.getMonth() === viewMonth;

                        return (
                          <div
                            key={di}
                            onClick={() => setSelectedDate(isSelected ? null : key)}
                            className={[
                              "min-h-[72px] p-1 border-b border-r border-border/10 last:border-r-0 cursor-pointer transition-colors select-none",
                              isSelected ? "bg-accent" : "hover:bg-muted/40",
                              !isCurrentMonth ? "opacity-30" : "",
                            ].join(" ")}
                          >
                            {/* Date number */}
                            <div className="flex justify-end">
                              <span className={[
                                "text-[11px] font-mono w-5 h-5 flex items-center justify-center rounded-full",
                                isToday
                                  ? "bg-primary text-primary-foreground font-bold"
                                  : "text-muted-foreground",
                              ].join(" ")}>
                                {date.getDate()}
                              </span>
                            </div>

                            {/* Games */}
                            {games.map((g) => {
                              const result = gameResult(g);
                              const isHome = isYankeesHome(g);
                              const opp = getOpponent(g);
                              const ys = getYankees(g);
                              const state = g.status.abstractGameState;

                              let chipColor = "bg-muted/60 text-muted-foreground";
                              if (result === "W") chipColor = "bg-green-500/20 text-green-400";
                              if (result === "L") chipColor = "bg-red-500/20 text-red-400";
                              if (state === "Live") chipColor = "bg-yellow-500/20 text-yellow-400 animate-pulse";

                              return (
                                <div
                                  key={g.gamePk}
                                  className={`mt-1 rounded px-1 py-0.5 text-[10px] leading-tight ${chipColor}`}
                                >
                                  <div className="flex items-center gap-0.5 font-medium">
                                    <span className="opacity-60">{isHome ? "vs" : "@"}</span>
                                    <span>{abbrev(opp.team.name)}</span>
                                    {result && (
                                      <span className="ml-auto font-bold">
                                        {result} {ys.score}–{opp.score}
                                      </span>
                                    )}
                                    {state === "Live" && <span className="ml-auto font-bold">LIVE</span>}
                                    {state === "Preview" && !g.status.startTimeTBD && (
                                      <span className="ml-auto opacity-70">
                                        {formatTime(g.gameDate).replace(/ (EDT|EST|ET)/, "")}
                                      </span>
                                    )}
                                    {state === "Preview" && g.status.startTimeTBD && (
                                      <span className="ml-auto opacity-70">TBD</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Selected date detail */}
              {selectedDate && selectedGames.length > 0 && (
                <Card className="border-border/60">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                      {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                        weekday: "long", month: "long", day: "numeric", year: "numeric",
                      })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedGames.map((g) => {
                      const result = gameResult(g);
                      const isHome = isYankeesHome(g);
                      const opp = getOpponent(g);
                      const ys = getYankees(g);
                      const state = g.status.abstractGameState;

                      return (
                        <div key={g.gamePk} className="flex flex-col gap-1 rounded-lg border border-border/40 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold">
                              {isHome ? "NYY vs " : "NYY @ "}
                              {opp.team.name}
                            </span>
                            {result && (
                              <Badge
                                variant="outline"
                                className={result === "W"
                                  ? "border-green-500 text-green-400"
                                  : "border-red-500 text-red-400"}
                              >
                                {result} {ys.score}–{opp.score}
                              </Badge>
                            )}
                            {state === "Live" && (
                              <Badge variant="outline" className="border-yellow-500 text-yellow-400 animate-pulse">
                                LIVE
                              </Badge>
                            )}
                            {state === "Preview" && (
                              <Badge variant="outline" className="text-muted-foreground">
                                {g.status.startTimeTBD ? "TBD" : formatTime(g.gameDate)}
                              </Badge>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mt-1">
                            <div>
                              <span className="text-[10px] uppercase tracking-wider">Venue</span>
                              <p className="text-foreground">{g.venue.name}</p>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase tracking-wider">Game time</span>
                              <p className="text-foreground capitalize">{g.dayNight}</p>
                            </div>
                            {ys.leagueRecord && (
                              <div>
                                <span className="text-[10px] uppercase tracking-wider">NYY record</span>
                                <p className="text-foreground font-mono">
                                  {ys.leagueRecord.wins}–{ys.leagueRecord.losses} ({ys.leagueRecord.pct})
                                </p>
                              </div>
                            )}
                            {opp.leagueRecord && (
                              <div>
                                <span className="text-[10px] uppercase tracking-wider">{abbrev(opp.team.name)} record</span>
                                <p className="text-foreground font-mono">
                                  {opp.leagueRecord.wins}–{opp.leagueRecord.losses} ({opp.leagueRecord.pct})
                                </p>
                              </div>
                            )}
                            {g.doubleHeader !== "N" && (
                              <div className="col-span-2">
                                <Badge variant="secondary" className="text-[10px]">Doubleheader</Badge>
                              </div>
                            )}
                          </div>

                          <a
                            href={`https://www.mlb.com/gameday/${g.gamePk}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-primary underline underline-offset-2 mt-1 hover:no-underline"
                          >
                            View on MLB.com →
                          </a>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {/* Legend */}
              <div className="flex gap-3 text-[10px] text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="rounded px-1 py-0.5 bg-green-500/20 text-green-400">W</span> Win
                </span>
                <span className="flex items-center gap-1">
                  <span className="rounded px-1 py-0.5 bg-red-500/20 text-red-400">L</span> Loss
                </span>
                <span className="flex items-center gap-1">
                  <span className="rounded px-1 py-0.5 bg-yellow-500/20 text-yellow-400">LIVE</span> In progress
                </span>
                <span className="flex items-center gap-1">
                  <span className="rounded px-1 py-0.5 bg-muted/60 text-muted-foreground">7:05p</span> Scheduled
                </span>
                <span className="flex items-center gap-1 ml-auto">Data: MLB Stats API
                </span>
              </div>

            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
