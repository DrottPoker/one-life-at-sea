"use client";

import Image from "next/image";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Anchor, Swords } from "lucide-react";
import type { CombatEvent } from "@/lib/combat";
import { SCENE_SIZE, type ScenePoint } from "@/lib/combat-scene-anchors";
import { latestOwnRound, roundStrikes, roundSummary, sceneDuration, scenePercent, strikeLabel, strikePopup, type SceneStrike } from "@/lib/combat-scene";

const art = {
  sea: { src: "/images/combat-sea-broadside.webp", alt: "Two pirate ships face each other on the open sea.", tagline: "Two ships. One victory.", Icon: Anchor },
  boarding: { src: "/images/combat-boarding-duel.webp", alt: "Two pirate captains cross cutlasses on a plank between their ships.", tagline: "Steel. Blood. Plunder.", Icon: Swords },
};
const sizes = "(max-width: 800px) 100vw, (max-width: 1400px) 45vw, 600px";
// Effect sizes below are written for the scene's display width, which is roughly 2.5 times smaller than the artwork.
const FX = 2.5;
type Vars = CSSProperties & Record<`--${string}`, string>;
const unit = (value: number) => Math.round(value) + "px";
const ms = (value: number) => Math.round(value) + "ms";
const fire = ["--o-fx-flash", "--o-fx-fire", "--o-fx-ember"], wood = ["--o-fx-wood", "--o-fx-wood-light"], water = ["--o-fx-water", "--o-fx-water-deep"];
const smoke = ["--o-fx-smoke", "--o-fx-smoke-dark"], blood = ["--o-fx-hit", "--o-fx-flash"], sparks = ["--o-fx-flash", "--o-gold"];

// Deterministic randomness per round, so a re-render never reshuffles an effect.
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = state + 0x6d2b79f5 >>> 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Square pixels thrown out from a point, rising by `lift` and settling by `fall`.
function bits(random: () => number, at: ScenePoint, count: number, colors: string[], size: number, spread: number, lift: number, fall: number, time: number, duration: number) {
  return Array.from({ length: count }, (_, index) => {
    const angle = random() * Math.PI * 2, distance = spread * FX * (0.35 + random() * 0.65), side = size * FX * (0.6 + random() * 0.8);
    const dx = Math.cos(angle) * distance, dy = Math.sin(angle) * distance * 0.75;
    const style: Vars = { fill: "var(" + colors[index % colors.length] + ")", "--mx": unit(dx * 0.6), "--my": unit(dy * 0.6 - lift * FX), "--px": unit(dx),
      "--py": unit(dy + fall * FX), "--t": ms(time + random() * 70), "--d": ms(duration * (0.7 + random() * 0.5)) };
    return <rect key={"bit" + index} className="o-fx-bit" x={at.x - side / 2} y={at.y - side / 2} width={side} height={side} style={style} />;
  });
}

// Smoke or cloud squares that swell while drifting.
function puffs(random: () => number, at: ScenePoint, count: number, size: number, spread: number, rise: number, time: number, duration: number) {
  return Array.from({ length: count }, (_, index) => {
    const side = size * FX * (0.7 + random() * 0.6), dx = (random() - 0.5) * spread * FX * 2, dy = ((random() - 0.5) * spread - rise) * FX;
    const style: Vars = { fill: "var(" + smoke[index % smoke.length] + ")", "--px": unit(dx), "--py": unit(dy), "--t": ms(time + random() * 120), "--d": ms(duration * (0.8 + random() * 0.4)) };
    return <rect key={"puff" + index} className="o-fx-puff" x={at.x + (random() - 0.5) * spread * FX * 0.6 - side / 2} y={at.y + (random() - 0.5) * spread * FX * 0.4 - side / 2}
      width={side} height={side} style={style} />;
  });
}

// A pixel starburst: a plus of light around a bright core. Rings and ripples keep a plain outline.
function flash(key: string, at: ScenePoint, base: number, time: number, duration: number, className = "o-fx-flash", tone = "light") {
  const size = base * FX, bar = size / 3, style = { "--t": ms(time), "--d": ms(duration) } as Vars;
  if (className !== "o-fx-flash") return <rect key={key} className={className} x={at.x - size / 2} y={at.y - size / 2} width={size} height={size} style={style} />;
  return <g key={key} className="o-fx-flash" data-tone={tone} style={style}>
    <rect x={at.x - size / 2} y={at.y - bar / 2} width={size} height={bar} /><rect x={at.x - bar / 2} y={at.y - size / 2} width={bar} height={size} />
    <rect className="o-fx-core" x={at.x - bar * 0.8} y={at.y - bar * 0.8} width={bar * 1.6} height={bar * 1.6} />
  </g>;
}

// A projectile follows a straight line while an inner group lifts it into an arc.
function projectile(key: string, from: ScenePoint, to: ScenePoint, lift: number, time: number, duration: number, body: ReactNode, spin = false) {
  const timing = { "--t": ms(time), "--d": ms(duration) };
  return <g key={key} transform={"translate(" + from.x + " " + from.y + ")"}>
    <g className="o-fx-fly" style={{ ...timing, "--dx": unit(to.x - from.x), "--dy": unit(to.y - from.y) } as Vars}>
      <g className="o-fx-arc" style={{ ...timing, "--arc": unit(-lift) } as Vars}><g className={spin ? "o-fx-spin" : undefined} style={timing as Vars}><g transform={"scale(" + FX + ")"}>{body}</g></g></g>
    </g>
  </g>;
}

function stroke(key: string, path: string, time: number, duration: number, className: string) {
  return <path key={key} className={"o-fx-draw " + className} d={path} pathLength={100} style={{ "--t": ms(time), "--d": ms(duration) } as Vars} />;
}

function impact(random: () => number, strike: SceneStrike): ReactNode[] {
  const { point, impact: time, critical } = strike, out: ReactNode[] = [];
  if (critical) out.push(flash("critical", point, 84, time, 440, undefined, "gold"), ...bits(random, point, 12, sparks, 8, 120, 40, 30, time, 600));
  if (strike.kind === "grenade") return [...out, flash("boom", point, 80, time, 360, undefined, "fire"), ...bits(random, point, 22, fire, 12, 100, 50, 30, time, 660), ...puffs(random, point, 12, 24, 60, 70, time + 90, 1100)];
  if (strike.kind === "smoke") return [...out, ...puffs(random, point, 26, 30, 80, 30, time, 1500)];
  if (strike.target === "crew") return [...out, flash("hit", point, 34, time, 220), ...bits(random, point, strike.kind === "grape" ? 6 : 10, blood, 8, 46, 20, 30, time, 480)];
  const splinters = bits(random, point, strike.zone === "rigging" ? 6 : 14, wood, 11, 90, 40, 70, time, 700);
  if (strike.zone === "rigging") return [...out, flash("hit", point, 50, time, 300, undefined, "fire"), ...splinters, ...bits(random, point, 14, ["--o-fx-cloth"], 13, 70, -10, 110, time, 1000)];
  if (strike.zone === "waterline") return [...out, flash("hit", point, 54, time, 300, undefined, "fire"), ...splinters, ...bits(random, point, 14, water, 10, 40, 90, 30, time + 40, 760)];
  return [...out, flash("hit", point, 54, time, 300, undefined, "fire"), ...splinters, ...puffs(random, point, 5, 18, 30, 40, time + 60, 800)];
}

function miss(random: () => number, strike: SceneStrike): ReactNode[] {
  const { point, impact: time } = strike;
  if (strike.kind === "melee") return [flash("parry", point, 30, time, 200), ...bits(random, point, 14, sparks, 7, 60, 20, 20, time, 420)];
  if (strike.kind === "firearm") return bits(random, point, 8, wood, 8, 40, 10, 30, time, 460);
  if (strike.kind === "grenade") return [flash("boom", point, 70, time, 340, undefined, "fire"), ...bits(random, point, 18, fire, 12, 90, 40, 20, time, 600), ...puffs(random, point, 10, 22, 50, 60, time + 80, 1000)];
  if (strike.kind === "smoke") return puffs(random, point, 16, 26, 60, 40, time, 1300);
  return [...bits(random, point, 26, water, 10, 34, 130, 20, time, 860), ...bits(random, point, 12, water, 12, 64, 18, 8, time, 600),
    flash("ripple", { x: point.x, y: point.y + 8 }, 56, time, 560, "o-fx-ripple")];
}

// The shot or swing itself, from its source to its landing point.
function delivery(random: () => number, strike: SceneStrike): ReactNode[] {
  const { origin, point, start, impact: time, kind } = strike, facing = strike.side === "attacker" ? 1 : -1;
  if (kind === "melee") {
    const hold = strike.hit ? point : { x: point.x, y: point.y + 10 };
    const reach = 25 * FX * facing, drop = 23 * FX;
    const path = "M" + (hold.x - reach) + " " + (hold.y - drop) + " Q" + (hold.x + reach / 4) + " " + (hold.y - drop / 4) + " " + (hold.x + reach) + " " + (hold.y + drop);
    return [stroke("edge", path, start, 300, "o-fx-slash-edge"), stroke("slash", path, start, 300, "o-fx-slash")];
  }
  if (!origin) return [];
  if (kind === "firearm") return [flash("muzzle", origin, 30, start, 220, undefined, "fire"), ...puffs(random, origin, 5, 14, 20, 30, start + 40, 700),
    stroke("tracer", "M" + origin.x + " " + origin.y + " L" + point.x + " " + point.y, start + 50, time - start, "o-fx-tracer")];
  const out: ReactNode[] = [];
  if (kind === "grenade" || kind === "smoke") {
    const body = kind === "grenade" ? <><rect className="o-fx-iron" x={-8} y={-8} width={16} height={16} /><rect className="o-fx-fuse" x={4} y={-14} width={6} height={6} /></>
      : <rect className="o-fx-jar" x={-7} y={-9} width={14} height={18} />;
    return [projectile("throw", origin, point, 150, start, time - start, body, true)];
  }
  const distance = Math.abs(point.x - origin.x), launch = start + 60;
  out.push(flash("muzzle", origin, 44, start, 260, undefined, "fire"), ...bits(random, origin, 9, fire, 9, 40, 10, 0, start, 300), ...puffs(random, origin, 10, 18, 36, 50, start + 40, 1000));
  if (kind === "chain") out.push(projectile("chain", origin, point, distance * 0.14, launch, time - launch,
    <><rect className="o-fx-iron" x={-17} y={-5} width={10} height={10} /><rect className="o-fx-iron" x={7} y={-5} width={10} height={10} /><rect className="o-fx-iron" x={-7} y={-1} width={14} height={2} /></>, true));
  else if (kind === "grape") for (let pellet = 0; pellet < 5; pellet++) {
    const spread = { x: point.x + (random() - 0.5) * 100 * FX, y: point.y + (random() - 0.5) * 16 * FX };
    out.push(projectile("pellet" + pellet, origin, spread, distance * 0.08, launch + pellet * 18, time - launch, <rect className="o-fx-iron" x={-4} y={-4} width={8} height={8} />));
  }
  else out.push(projectile("ball", origin, point, distance * 0.16, launch, time - launch, <rect className="o-fx-iron" x={-7} y={-7} width={14} height={14} />));
  return out;
}

function StrikeEffects({ strike, seed }: { strike: SceneStrike; seed: number }) {
  const random = seeded(seed);
  return <g data-kind={strike.kind}>{[...delivery(random, strike), ...(strike.hit ? impact(random, strike) : miss(random, strike))]}</g>;
}

const tone = (strike: SceneStrike) => !strike.hit ? "miss" : strike.critical ? "critical" : strike.damage === 0 ? strike.kind === "smoke" ? "effect" : "blocked" : "hit";
const struck = (strike: SceneStrike) => strike.side === "attacker" ? "defender" : "attacker";

// A pixel reticle left on the zone that was hit, until the next round.
function mark(strike: SceneStrike, index: number) {
  if (!strike.hit || strike.kind === "smoke") return null;
  return <g key={"mark" + index} className="o-scene-mark" data-tone={tone(strike)} data-zone={strike.zone ?? strike.target} data-target={struck(strike)}
    transform={"translate(" + strike.point.x + " " + strike.point.y + ") scale(" + FX * 0.8 + ")"} style={{ "--t": ms(strike.impact + 140) } as Vars}>
    <rect x={-30} y={-4} width={16} height={8} /><rect x={14} y={-4} width={16} height={8} /><rect x={-4} y={-30} width={8} height={16} />
    <rect x={-4} y={14} width={8} height={16} /><rect x={-4} y={-4} width={8} height={8} />
  </g>;
}

function SceneOverlay({ strikes, animate, sequence }: { strikes: SceneStrike[]; animate: boolean; sequence: number }) {
  return <div className="o-scene-overlay" data-animate={animate} data-round={sequence} aria-hidden="true">
    <svg viewBox={"0 0 " + SCENE_SIZE.width + " " + SCENE_SIZE.height} preserveAspectRatio="none" shapeRendering="crispEdges">
      {animate && <g className="o-scene-live">{strikes.map((strike, index) => <StrikeEffects key={index} strike={strike} seed={sequence * 10 + index} />)}</g>}
      {strikes.map(mark)}
    </svg>
    {animate && strikes.map((strike, index) => <span key={"pop" + index} className="o-scene-pop" data-tone={tone(strike)}
      style={{ ...scenePercent(strike.popup), "--t": ms(strike.impact) } as Vars}>{strikePopup(strike)}</span>)}
    {strikes.map((strike, index) => <span key={"label" + index} className="o-scene-chip" data-tone={tone(strike)} data-target={struck(strike)}
      style={{ ...scenePercent(strike.label), "--t": ms(strike.impact + 160) } as Vars}>{strikeLabel(strike)}</span>)}
  </div>;
}

// The VS artwork doubles as the hit display: the latest own round plays on it, then its marks stay until the next round.
export function CombatScene({ phase, events = [], attackerId, defenderName }: {
  phase: "sea" | "boarding"; events?: CombatEvent[]; attackerId: string; defenderName: string;
}) {
  const round = latestOwnRound(events, attackerId);
  const [initial] = useState(round?.sequence ?? 0);
  const fresh = !!round && round.sequence > initial, strikes = round ? roundStrikes(round) : [];
  // A round that changed phase finishes on its own artwork before the new phase shows.
  const leaving = fresh && round.phase !== phase;
  const { Icon, tagline } = art[phase];
  return <figure className="o-combat-scene" data-phase={phase}>
    <div className="o-combat-scene-art">
      <Image src={art[phase].src} alt={art[phase].alt} width={SCENE_SIZE.width} height={SCENE_SIZE.height} sizes={sizes} loading="eager" />
      {round && round.phase === phase && <SceneOverlay key={round.sequence} strikes={strikes} animate={fresh} sequence={round.sequence} />}
      {leaving && <div key={"leaving" + round.sequence} className="o-scene-leaving" style={{ "--hold": ms(sceneDuration(strikes)) } as Vars}>
        <Image src={art[round.phase].src} alt="" width={SCENE_SIZE.width} height={SCENE_SIZE.height} sizes={sizes} loading="eager" />
        <SceneOverlay strikes={strikes} animate sequence={round.sequence} />
      </div>}
      <span className="o-combat-versus" aria-hidden="true">VS</span>
    </div>
    <figcaption aria-live="polite">{round ? <span className="o-scene-summary">{roundSummary(round, defenderName)}</span>
      : <><Icon aria-hidden="true" /><span>{tagline}</span></>}</figcaption>
  </figure>;
}
