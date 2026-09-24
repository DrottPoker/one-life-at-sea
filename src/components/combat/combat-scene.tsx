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
// Effects are drawn in the artwork's pixels. Particles stay a few art pixels wide to match its detail, while
// distances are scaled up because the scene is shown at well under half the artwork's width.
const SPREAD = 2.5;
type Vars = CSSProperties & Record<`--${string}`, string>;
const unit = (value: number) => Math.round(value) + "px";
const ms = (value: number) => Math.round(value) + "ms";
const white = "--o-fx-water", fire = ["--o-fx-flash", "--o-fx-fire", "--o-fx-ember"], wood = ["--o-fx-wood", "--o-fx-wood-light"];
const water = ["--o-fx-water", "--o-fx-water-deep"], smoke = ["--o-fx-smoke", "--o-fx-smoke-dark"], blood = ["--o-fx-hit", "--o-fx-ember"], sparks = ["--o-fx-flash", "--o-gold"];
// Blast palettes run from the hot centre to the edge.
const blasts = { fire: [white, "--o-fx-flash", "--o-fx-fire", "--o-fx-ember"], gold: [white, "--o-fx-flash", "--o-gold", "--o-gold"], light: [white, white, "--o-fx-flash", "--o-fx-smoke"] };

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

function square(key: string, className: string, x: number, y: number, side: number, style: Vars) {
  return <rect key={key} className={className} x={x - side / 2} y={y - side / 2} width={side} height={side} style={style} />;
}

// Small pixels thrown out from a point: they rise by `lift` on the way out and settle by `fall`.
function bits(random: () => number, at: ScenePoint, count: number, colors: string[], size: number, spread: number, lift: number, fall: number, time: number, duration: number, key = "bit") {
  return Array.from({ length: count }, (_, index) => {
    const angle = random() * Math.PI * 2, distance = spread * SPREAD * (0.3 + random() * 0.7);
    const dx = Math.cos(angle) * distance, dy = Math.sin(angle) * distance * 0.7;
    return square(key + index, "o-fx-bit", at.x, at.y, size * (0.6 + random() * 0.7), { fill: "var(" + colors[index % colors.length] + ")", "--mx": unit(dx * 0.6),
      "--my": unit(dy * 0.6 - lift * SPREAD * (0.6 + random() * 0.4)), "--px": unit(dx), "--py": unit(dy + fall * SPREAD), "--t": ms(time + random() * 80),
      "--d": ms(duration * (0.65 + random() * 0.5)) });
  });
}

// A dense cloud of small pixels, hottest in the middle, that flashes and spreads a little: an explosion or a muzzle flash.
function blast(random: () => number, at: ScenePoint, radius: number, count: number, palette: keyof typeof blasts, time: number, duration: number, key = "blast") {
  const colors = blasts[palette], reach = radius * SPREAD;
  return Array.from({ length: count }, (_, index) => {
    const angle = random() * Math.PI * 2, share = Math.sqrt(random()), dx = Math.cos(angle) * reach * share, dy = Math.sin(angle) * reach * share * 0.8;
    const ring = Math.min(colors.length - 1, Math.floor(share * colors.length));
    return square(key + index, "o-fx-bit", at.x + dx, at.y + dy, (13 - share * 5) * (0.75 + random() * 0.5), { fill: "var(" + colors[ring] + ")", "--mx": unit(dx * 0.25),
      "--my": unit(dy * 0.25), "--px": unit(dx * 0.55), "--py": unit(dy * 0.5 + 4), "--t": ms(time + share * 50), "--d": ms(duration * (0.55 + random() * 0.6)) });
  });
}

// Drifting smoke built from small grey pixels that swell a little as they fade.
function puffs(random: () => number, at: ScenePoint, count: number, size: number, spread: number, rise: number, time: number, duration: number, key = "puff") {
  return Array.from({ length: count }, (_, index) => {
    const dx = (random() - 0.5) * spread * SPREAD * 2, dy = ((random() - 0.5) * spread - rise * (0.5 + random() * 0.5)) * SPREAD;
    return square(key + index, "o-fx-puff", at.x + (random() - 0.5) * spread * SPREAD * 0.5, at.y + (random() - 0.5) * spread * SPREAD * 0.35,
      size * 0.75 * (0.7 + random() * 0.6), { fill: "var(" + smoke[index % smoke.length] + ")", "--px": unit(dx), "--py": unit(dy), "--t": ms(time + random() * 140),
        "--d": ms(duration * (0.75 + random() * 0.45)) });
  });
}

// The bright pop at the heart of a blast.
const core = (key: string, at: ScenePoint, size: number, time: number, duration: number) =>
  square(key, "o-fx-flash", at.x, at.y, size, { "--t": ms(time), "--d": ms(duration) });

// A projectile follows a straight line while an inner group lifts it into an arc.
function projectile(key: string, from: ScenePoint, to: ScenePoint, lift: number, time: number, duration: number, body: ReactNode, spin = false) {
  const timing = { "--t": ms(time), "--d": ms(duration) };
  return <g key={key} transform={"translate(" + from.x + " " + from.y + ")"}>
    <g className="o-fx-fly" style={{ ...timing, "--dx": unit(to.x - from.x), "--dy": unit(to.y - from.y) } as Vars}>
      <g className="o-fx-arc" style={{ ...timing, "--arc": unit(-lift) } as Vars}><g className={spin ? "o-fx-spin" : undefined} style={timing as Vars}>{body}</g></g>
    </g>
  </g>;
}

function stroke(key: string, path: string, time: number, duration: number, className: string) {
  return <path key={key} className={"o-fx-draw " + className} d={path} pathLength={100} style={{ "--t": ms(time), "--d": ms(duration) } as Vars} />;
}

function impact(random: () => number, strike: SceneStrike): ReactNode[] {
  const { point, impact: time } = strike, out: ReactNode[] = [];
  if (strike.critical) out.push(...blast(random, point, 32, 40, "gold", time, 540, "crit"), ...bits(random, point, 18, sparks, 9, 120, 40, 30, time, 660, "critspark"));
  if (strike.kind === "grenade") return [...out, core("core", point, 34, time, 280), ...blast(random, point, 44, 80, "fire", time, 480),
    ...bits(random, point, 28, fire, 10, 110, 40, 30, time, 720), ...puffs(random, point, 24, 18, 56, 70, time + 90, 1200)];
  if (strike.kind === "smoke") return [...out, ...puffs(random, point, 54, 20, 76, 30, time, 1500)];
  if (strike.target === "crew") return [...out, core("core", point, 18, time, 240), ...blast(random, point, 14, 24, "light", time, 300),
    ...bits(random, point, strike.kind === "grape" ? 10 : 16, blood, 10, 42, 20, 30, time, 540)];
  const splinters = bits(random, point, strike.zone === "rigging" ? 10 : 24, wood, 12, 90, 40, 80, time, 780, "splinter");
  const burst = [core("core", point, 26, time, 280), ...blast(random, point, 32, 76, "fire", time, 420)];
  if (strike.zone === "rigging") return [...out, ...burst, ...splinters, ...bits(random, point, 40, ["--o-fx-cloth"], 12, 80, -10, 130, time, 1200, "cloth")];
  if (strike.zone === "waterline") return [...out, ...burst, ...splinters, ...bits(random, point, 56, water, 10, 34, 120, 40, time + 40, 880, "drop")];
  return [...out, ...burst, ...splinters, ...puffs(random, point, 30, 16, 32, 44, time + 60, 1050)];
}

function miss(random: () => number, strike: SceneStrike): ReactNode[] {
  const { point, impact: time } = strike;
  if (strike.kind === "melee") return [core("core", point, 16, time, 220), ...bits(random, point, 26, sparks, 8, 60, 20, 20, time, 480)];
  if (strike.kind === "firearm") return bits(random, point, 16, wood, 10, 34, 10, 30, time, 500);
  if (strike.kind === "grenade") return [core("core", point, 28, time, 260), ...blast(random, point, 34, 60, "fire", time, 440),
    ...bits(random, point, 22, fire, 10, 90, 40, 20, time, 640), ...puffs(random, point, 18, 18, 46, 60, time + 80, 1100)];
  if (strike.kind === "smoke") return puffs(random, point, 32, 18, 56, 40, time, 1300);
  // A narrow column of spray with a skirt of foam on the water.
  return [...bits(random, point, 90, water, 10, 20, 170, 34, time, 980, "column"), ...bits(random, point, 40, water, 9, 54, 60, 14, time + 30, 700, "spray"),
    ...bits(random, { x: point.x, y: point.y + 6 }, 36, water, 10, 72, 6, 4, time, 620, "foam")];
}

// The shot or swing itself, from its source to its landing point.
function delivery(random: () => number, strike: SceneStrike): ReactNode[] {
  const { origin, point, start, impact: time, kind } = strike, facing = strike.side === "attacker" ? 1 : -1;
  if (kind === "melee") {
    const hold = strike.hit ? point : { x: point.x, y: point.y + 10 }, reach = 25 * SPREAD * facing, drop = 23 * SPREAD;
    const path = "M" + (hold.x - reach) + " " + (hold.y - drop) + " Q" + (hold.x + reach / 4) + " " + (hold.y - drop / 4) + " " + (hold.x + reach) + " " + (hold.y + drop);
    return [stroke("edge", path, start, 300, "o-fx-slash-edge"), stroke("slash", path, start, 300, "o-fx-slash")];
  }
  if (!origin) return [];
  if (kind === "firearm") return [core("muzzle", origin, 16, start, 200), ...blast(random, origin, 10, 16, "fire", start, 240, "flash"),
    ...puffs(random, origin, 10, 12, 10, 16, start + 40, 720), stroke("tracer", "M" + origin.x + " " + origin.y + " L" + point.x + " " + point.y, start + 50, time - start, "o-fx-tracer")];
  if (kind === "grenade" || kind === "smoke") {
    const body = kind === "grenade" ? <><rect className="o-fx-iron" x={-9} y={-9} width={18} height={18} /><rect className="o-fx-fuse" x={5} y={-15} width={6} height={6} /></>
      : <rect className="o-fx-jar" x={-8} y={-10} width={16} height={20} />;
    return [projectile("throw", origin, point, 150, start, time - start, body, true)];
  }
  const distance = Math.abs(point.x - origin.x), launch = start + 60;
  const out = [core("muzzle", origin, 22, start, 220), ...blast(random, origin, 20, 48, "fire", start, 340, "flash"),
    ...bits(random, origin, 14, fire, 9, 40, 10, 6, start, 360, "spark"), ...puffs(random, origin, 48, 18, 34, 48, start + 40, 1200)];
  if (kind === "chain") out.push(projectile("chain", origin, point, distance * 0.14, launch, time - launch,
    <><rect className="o-fx-iron" x={-20} y={-6} width={12} height={12} /><rect className="o-fx-iron" x={8} y={-6} width={12} height={12} /><rect className="o-fx-iron" x={-8} y={-1} width={16} height={3} /></>, true));
  else if (kind === "grape") for (let pellet = 0; pellet < 7; pellet++) {
    const spread = { x: point.x + (random() - 0.5) * 100 * SPREAD, y: point.y + (random() - 0.5) * 16 * SPREAD };
    out.push(projectile("pellet" + pellet, origin, spread, distance * 0.08, launch + pellet * 16, time - launch, <rect className="o-fx-iron" x={-4} y={-4} width={8} height={8} />));
  }
  else out.push(projectile("ball", origin, point, distance * 0.16, launch, time - launch, <rect className="o-fx-iron" x={-9} y={-9} width={18} height={18} />));
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
    transform={"translate(" + strike.point.x + " " + strike.point.y + ")"} style={{ "--t": ms(strike.impact + 140) } as Vars}>
    <rect x={-62} y={-5} width={34} height={10} /><rect x={28} y={-5} width={34} height={10} /><rect x={-5} y={-62} width={10} height={34} />
    <rect x={-5} y={28} width={10} height={34} /><rect x={-5} y={-5} width={10} height={10} />
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
