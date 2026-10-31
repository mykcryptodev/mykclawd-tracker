"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Badge, Bar, BrandMark, Count, Icon, Meter, Stage, States } from "@/components/stageshow/kit";
import type { Act, Layout } from "@/components/stageshow/kit";
import "./bento.css";

// The Projects section, built to the Stageshow bento rules. One Stage per tile,
// at 1:1, pinned to the tile's bottom; the copy and the link are page HTML.
//
//   Tile          Span   Kind       The one thing                     Moves
//   BankrBall     2 × 1  Hero UI    a pick sheet going in             cursor picks, submits, the pot rolls
//   Smart Router  1 × 1  Component  candidates scored for a prompt    scores fill, the winner is routed
//   PaidPR        1 × 1  Component  the 402 between you and a PR      Pay turns into an opened PR
//   Agent Chess   1 × 1  Object     the board                         one move
//   BirdBets      1 × 1  Photo      real frames from the feeder cam   one bird gives way to the next
//
// Figures are illustrative; the section says so. BirdBets shows its off-season
// state because that is what the product shows right now.

const STEP = 110;
const LEAD = 450;

type Beat = { on: boolean };
const before: Beat = { on: false };
const after: Beat = { on: true };
const beat = (i: number) => async (a: Act<Beat>) => {
  await a.wait(LEAD + i * STEP);
  await a.set({ on: true });
};

// The tile owns the crop, so a measured Stage always reaches the tile's edge.
function usePictureWidth(initial: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(Math.max(1, node.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function Tile({
  area,
  href,
  name,
  children,
  picture,
}: {
  area: string;
  href: string;
  name: string;
  children: ReactNode;
  picture: ReactNode;
}) {
  return (
    <li className={`pb-tile pb-tile--${area}`}>
      <p className="pb-copy">
        <a className="pb-link" href={href} target="_blank" rel="noopener noreferrer">
          {name}
        </a>{" "}
        {children}
      </p>
      {/* The pictures repeat what the copy says, as illustration */}
      <div aria-hidden>{picture}</div>
    </li>
  );
}

/* ---------------- BankrBall (hero) ---------------- */

type Sheet = { second: boolean; third: boolean; sent: boolean };
const GAMES = [
  { away: "BAL", home: "BUF", time: "Sun 6:00 PM" },
  { away: "KC", home: "DEN", time: "Sun 9:25 PM" },
  { away: "DAL", home: "PHI", time: "Mon 8:15 PM" },
];

async function sheetScript(a: Act<Sheet>) {
  await a.wait(600);
  await a.click("pick-2");
  await a.set({ second: true });
  await a.wait(350);
  await a.click("pick-3");
  await a.set({ third: true });
  await a.wait(450);
  await a.click("submit");
  await a.set({ sent: true });
  await a.wait(500);
  await a.move({ at: "submit", x: 0.3, y: 2.6 });
}

function Team({ name, picked, target }: { name: string; picked: boolean; target?: string }) {
  return (
    <span className="pb-team" data-picked={picked || undefined} data-target={target} data-cursor="pointer">
      {name}
    </span>
  );
}

function PickSheet({ s, layout }: { s: Sheet; layout: Layout }) {
  const picked = 1 + Number(s.second) + Number(s.third);
  return (
    <>
      <div className="pb-sheet" data-compact={layout === "compact" || undefined}>
        <div className="pb-sheet-head">
          <div className="pb-sheet-title">
            <div className="pb-sheet-name">Pick&rsquo;em</div>
            <div className="pb-sheet-sub">{picked} of 3 picked</div>
          </div>
          <span className="pb-submit" data-target="submit" data-cursor="pointer" data-sent={s.sent || undefined}>
            <States
              value={s.sent ? "sent" : "ask"}
              states={{
                ask: "Submit picks",
                sent: (
                  <span className="pb-submit-done">
                    <Icon name="check" size={14} /> Picks in
                  </span>
                ),
              }}
            />
          </span>
        </div>
        {GAMES.map((game, i) => (
          <div key={game.away} className="pb-game">
            <Team name={game.away} picked={i === 0} />
            <span className="pb-at">at</span>
            <Team
              name={game.home}
              picked={(i === 1 && s.second) || (i === 2 && s.third)}
              target={i === 1 ? "pick-2" : i === 2 ? "pick-3" : undefined}
            />
            <span className="pb-time">{game.time}</span>
          </div>
        ))}
        <div className="pb-game">
          <Bar w={76} h={36} r={10} tone={1} />
          <span />
          <Bar w={76} h={36} r={10} tone={1} />
        </div>
      </div>
      {layout === "wide" && (
        <div className="pb-pot">
          <div className="pb-pot-label">On the line</div>
          <div className="pb-pot-value">
            <BrandMark brand="usdc" size={22} tile={false} />
            <Count value={s.sent ? 15 : 14} duration={700} />
          </div>
          <div className="pb-pot-sub">
            <Count value={s.sent ? 15 : 14} duration={700} /> players
          </div>
        </div>
      )}
    </>
  );
}

function BankrBall() {
  const [picture, width] = usePictureWidth(624);
  const layout = width < 500 ? "compact" : "wide";
  return (
    <Tile
      area="hero"
      name="BankrBall"
      href="https://bankrball.com/"
      picture={
        <div ref={picture} className="pb-picture">
          <Stage<Sheet>
            width={width}
            height={layout === "wide" ? 276 : 268}
            initial={{ second: false, third: false, sent: false }}
            poster={{ second: true, third: true, sent: true }}
            play="once"
            script={sheetScript}
            cursor={{ at: { x: width - 60, y: 240 }, style: "real" }}
            theme="dark"
            className="pb-stage"
          >
            {(s) => <PickSheet s={s} layout={layout} />}
          </Stage>
        </div>
      }
    >
      Onchain NFL Pick&rsquo;em contests. Join a weekly pool, make your picks, and settle prizes transparently on Base.
    </Tile>
  );
}

/* ---------------- Smart Router ---------------- */

const MODELS = [
  { name: "claude-opus-5-5", score: 0.92, won: true },
  { name: "gpt-5.5", score: 0.74, won: false },
  { name: "grok-4.3", score: 0.58, won: false },
];

function SmartRouter() {
  const [picture, width] = usePictureWidth(306);
  return (
    <Tile
      area="router"
      name="OpenClaw Smart Router"
      href="https://github.com/mykclawd/openclaw-smart-router"
      picture={
        <div ref={picture} className="pb-picture">
          <Stage<Beat> width={width} height={196} initial={before} poster={after} play="once" script={beat(1)} className="pb-stage">
            {(s) => (
              <div className="pb-router">
                <div className="pb-prompt">Refactor the auth flow</div>
                {MODELS.map((m) => (
                  <div key={m.name} className="pb-model" data-won={m.won || undefined}>
                    <span className="pb-model-name">{m.name}</span>
                    <Count value={s.on ? Math.round(m.score * 100) : 0} duration={800} className="pb-model-score" />
                    <Meter value={s.on ? m.score : 0} tone={m.won ? "accent" : "ink"} className="pb-model-meter" />
                  </div>
                ))}
              </div>
            )}
          </Stage>
        </div>
      }
    >
      Picks the best LLM for every request, then proxies the winner through unmodified.
    </Tile>
  );
}

/* ---------------- PaidPR ---------------- */

function PaidPR() {
  const [picture, width] = usePictureWidth(306);
  return (
    <Tile
      area="paidpr"
      name="PaidPR"
      href="https://paidpr.mykclawd.xyz/"
      picture={
        <div ref={picture} className="pb-picture">
          <Stage<Beat> width={width} height={200} initial={before} poster={after} play="once" script={beat(2)} theme="dark" className="pb-stage">
            {(s) => (
              <div className="pb-pr">
                <div className="pb-pr-head">
                  <BrandMark brand="github" size={18} tile={false} surface="dark" />
                  <span className="pb-pr-title">fix: retry on rate limit</span>
                </div>
                <span className="pb-pr-body">
                  <Bar w={170} h={6} tone={2} />
                  <Bar w={118} h={6} tone={2} />
                </span>
                <States
                  value={s.on ? "open" : "gated"}
                  align="start"
                  states={{
                    gated: <Badge tone="warning">402 Payment required</Badge>,
                    open: <Badge tone="success">#128 opened</Badge>,
                  }}
                />
                <span className="pb-pay" data-on={s.on || undefined}>
                  <States
                    value={s.on ? "done" : "ask"}
                    states={{
                      ask: "Pay 1 USDC",
                      done: (
                        <span className="pb-submit-done">
                          <Icon name="check" size={14} /> Paid
                        </span>
                      ),
                    }}
                  />
                </span>
              </div>
            )}
          </Stage>
        </div>
      }
    >
      Stop the slop. Open a real PR. Charges a small x402 fee to open a PR on OSS repos.
    </Tile>
  );
}

/* ---------------- Agent Chess ---------------- */

// Nc3-d5 in an Italian game. Files and ranks count from a8. Solid glyphs on both
// sides, told apart by color, so the white pieces hold up on light squares.
const PIECES = [
  { glyph: "♜", file: 0, rank: 0, dark: true },
  { glyph: "♚", file: 4, rank: 0, dark: true },
  { glyph: "♟", file: 1, rank: 1, dark: true },
  { glyph: "♟", file: 5, rank: 1, dark: true },
  { glyph: "♟", file: 3, rank: 2, dark: true },
  { glyph: "♝", file: 2, rank: 3, dark: true },
  { glyph: "♟", file: 4, rank: 3, dark: true },
  { glyph: "♝", file: 2, rank: 4, dark: false },
  { glyph: "♟", file: 4, rank: 4, dark: false },
  { glyph: "♟", file: 3, rank: 5, dark: false },
];
const FROM = { file: 2, rank: 5 };
const TO = { file: 3, rank: 3 };

function AgentChess() {
  const [picture, width] = usePictureWidth(306);
  // The board always runs off the right, well past the edge at either width
  const cell = width < 340 ? 44 : 46;
  return (
    <Tile
      area="chess"
      name="Agent Chess"
      href="https://chess.mykclawd.xyz/"
      picture={
        <div ref={picture} className="pb-picture">
          <Stage<Beat> width={width} height={cell === 44 ? 280 : 290} initial={before} poster={after} play="once" script={beat(3)} theme="dark" className="pb-stage">
            {(s) => {
              const knight = s.on ? TO : FROM;
              return (
                <div className="pb-board" style={{ "--cell": `${cell}px` } as CSSProperties}>
                  {Array.from({ length: 64 }, (_, i) => {
                    const file = i % 8;
                    const rank = Math.floor(i / 8);
                    const moved = (file === FROM.file && rank === FROM.rank) || (file === TO.file && rank === TO.rank);
                    return <span key={i} className="pb-square" data-light={(file + rank) % 2 === 0 || undefined} data-moved={(moved && s.on) || undefined} />;
                  })}
                  {PIECES.map((p, i) => (
                    <span key={i} className="pb-piece" data-dark={p.dark || undefined} style={{ transform: `translate(${p.file * cell}px, ${p.rank * cell}px)` }}>
                      {p.glyph}&#xFE0E;
                    </span>
                  ))}
                  <span className="pb-piece pb-piece--mover" style={{ transform: `translate(${knight.file * cell}px, ${knight.rank * cell}px)` }}>
                    ♞&#xFE0E;
                  </span>
                </div>
              );
            }}
          </Stage>
        </div>
      }
    >
      AI agents play each other onchain for ETH. Create games, accept challenges, win prizes.
    </Tile>
  );
}

/* ---------------- BirdBets ---------------- */

function BirdBets() {
  const [picture, width] = usePictureWidth(306);
  return (
    <Tile
      area="birds"
      name="BirdBets"
      href="https://birdbets.mykclawd.xyz/"
      picture={
        <div ref={picture} className="pb-picture">
          <Stage<Beat> width={width} height={280} initial={before} poster={after} play="once" script={beat(4)} theme="dark" className="pb-stage">
            {(s) => (
              <div className="pb-cam">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="pb-cam-frame" src="/images/projects/birdbets-cardinal.webp" alt="" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="pb-cam-frame pb-cam-frame--next" data-on={s.on || undefined} src="/images/projects/birdbets-jay.webp" alt="" />
                <span className="pb-cam-label">
                  <span className="pb-cam-dot" /> Season rewind
                </span>
              </div>
            )}
          </Stage>
        </div>
      }
    >
      Prediction markets on a live Bird Buddy feeder. Gone south for the winter, back in spring.
    </Tile>
  );
}

export function ProjectsBento() {
  return (
    <ul className="pb-root">
      <BankrBall />
      <SmartRouter />
      <PaidPR />
      <AgentChess />
      <BirdBets />
    </ul>
  );
}
