import { gameplay } from "@/config/public";
import type { CombatEvent, CombatOrder } from "@/lib/combat";
import { zoneName } from "@/lib/equipment";
import { sceneAnchors, SCENE_SIZE, type SceneArea, type SceneSide, type ScenePoint } from "@/lib/combat-scene-anchors";

export type StrikeKind = "cannon" | "chain" | "grape" | "melee" | "firearm" | "grenade" | "smoke";
export type SceneStrike = {
  side: SceneSide; kind: StrikeKind; hit: boolean; damage: number; critical: boolean; zone: string | null;
  target: "ship" | "crew"; effect: "crew_accuracy" | "ship_speed" | null;
  origin: ScenePoint | null; point: ScenePoint; popup: ScenePoint; label: ScenePoint; start: number; impact: number; end: number;
};

const orderKinds: Partial<Record<CombatOrder, StrikeKind>> = { fire: "cannon", fire_chain: "chain", fire_grape: "grape", crew_shoot: "firearm", crew_attack: "melee" };
// Milliseconds from a strike's start to its impact, and from impact until its effects have faded.
const timing: Record<StrikeKind, { travel: number; tail: number }> = {
  cannon: { travel: 520, tail: 760 }, chain: { travel: 580, tail: 760 }, grape: { travel: 480, tail: 640 },
  firearm: { travel: 170, tail: 560 }, melee: { travel: 140, tail: 520 }, grenade: { travel: 600, tail: 860 }, smoke: { travel: 600, tail: 1300 },
};
const DEFENDER_DELAY = 260;
const itemNames = new Map<string, string>(gameplay.inventory.items.map(item => [item.id, item.name]));
const smokeNames = new Set(gameplay.equipment.temporaries.filter(item => !("damage" in item)).map(item => itemNames.get(item.itemId)));

export const scenePercent = (point: ScenePoint) => ({ left: point.x / SCENE_SIZE.width * 100 + "%", top: point.y / SCENE_SIZE.height * 100 + "%" });

// Deterministic randomness, so a round always lands and animates the same way, even after a reload.
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = state + 0x6d2b79f5 >>> 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// A uniformly random point inside one of an area's ellipses, each weighted by its size.
export function pointIn(area: SceneArea, random: () => number): ScenePoint {
  let pick = random() * area.reduce((sum, ellipse) => sum + ellipse.rx * ellipse.ry, 0), ellipse = area[area.length - 1];
  for (const candidate of area) {
    pick -= candidate.rx * candidate.ry;
    if (pick <= 0) { ellipse = candidate; break; }
  }
  const angle = random() * Math.PI * 2, distance = Math.sqrt(random());
  return { x: Math.round(ellipse.x + Math.cos(angle) * distance * ellipse.rx), y: Math.round(ellipse.y + Math.sin(angle) * distance * ellipse.ry) };
}

// The scene follows the viewer's own rounds; other attackers' rounds stay in the log.
export function latestOwnRound(events: CombatEvent[], attackerId: string) {
  return events.findLast(event => event.kind === "round" && event.actor_id === attackerId) ?? null;
}

function strikeKind(order: CombatOrder, weapon: string | null | undefined, effect: string | null | undefined): StrikeKind | null {
  if (order !== "crew_throw") return orderKinds[order] ?? null;
  return effect === "crew_accuracy" || smokeNames.has(weapon ?? "") ? "smoke" : "grenade";
}

// Where a strike starts, lands and reports, using the round's own phase rather than the current one.
// Hits land anywhere in the struck zone's area and misses anywhere in their splash or landing area.
function strikePoints(phase: "sea" | "boarding", side: SceneSide, kind: StrikeKind, hit: boolean, zone: string | null, target: "ship" | "crew", random: () => number) {
  const other: SceneSide = side === "attacker" ? "defender" : "attacker";
  if (phase === "sea") {
    const own = sceneAnchors.sea[side], ship = sceneAnchors.sea[other];
    const point = pointIn(!hit ? ship.splash : target === "crew" ? ship.deck : ship[zone as "rigging" | "hull" | "waterline"] ?? ship.hull, random);
    return { origin: own.guns, point, popup: point, label: ship.label };
  }
  const own = sceneAnchors.boarding[side], crew = sceneAnchors.boarding[other];
  const point = hit ? pointIn(crew[zone as "head" | "body" | "legs" | "feet"] ?? crew.body, random)
    : kind === "melee" ? sceneAnchors.boarding.parry : pointIn(kind === "firearm" ? crew.stray : crew.floor, random);
  // A parried swing reports over the captain who parried, clear of the other side's numbers.
  return { origin: kind === "melee" ? null : kind === "firearm" ? own.blade : own.hand, point, popup: !hit && kind === "melee" ? crew.head[0] : point, label: crew.label };
}

export function roundStrikes(event: CombatEvent): SceneStrike[] {
  const sides = [
    { side: "attacker" as const, order: event.attacker_order, hit: event.attacker_hit, damage: event.attacker_damage, weapon: event.attacker_weapon,
      zone: event.attacker_zone, critical: event.attacker_critical, target: event.attacker_target, effect: event.attacker_effect },
    { side: "defender" as const, order: event.defender_order, hit: event.defender_hit, damage: event.defender_damage, weapon: event.defender_weapon,
      zone: event.defender_zone, critical: event.defender_critical, target: event.defender_target, effect: event.defender_effect },
  ];
  const strikes: SceneStrike[] = [];
  for (const entry of sides) {
    const kind = strikeKind(entry.order, entry.weapon, entry.effect);
    if (!kind) continue;
    const target = entry.target ?? (event.phase === "sea" ? "ship" : "crew"), zone = entry.hit ? entry.zone ?? null : null;
    const start = strikes.length ? strikes[0].impact + DEFENDER_DELAY : 0, impact = start + timing[kind].travel;
    const random = seededRandom(event.sequence * 2 + (entry.side === "attacker" ? 0 : 1));
    strikes.push({ side: entry.side, kind, hit: entry.hit, damage: entry.damage, critical: !!entry.critical && entry.damage > 0, zone, target,
      effect: entry.effect ?? null, ...strikePoints(event.phase, entry.side, kind, entry.hit, zone, target, random), start, impact, end: impact + timing[kind].tail });
  }
  return strikes;
}

export const sceneDuration = (strikes: SceneStrike[]) => Math.max(0, ...strikes.map(strike => strike.end));

// Hits that leave a marker: misses and effect-only throws do not.
export type MarkTone = "hit" | "critical" | "blocked";
export function markTone(strike: SceneStrike): MarkTone | null {
  if (!strike.hit || strike.kind === "smoke") return null;
  return strike.critical ? "critical" : strike.damage === 0 ? "blocked" : "hit";
}

export type SceneScar = { key: string; target: SceneSide; point: ScenePoint; tone: MarkTone; age: number };
// Where the viewer's earlier rounds in one phase struck either side, newest first; age counts rounds back from the latest.
export function sceneHistory(events: CombatEvent[], attackerId: string, phase: "sea" | "boarding", before: number): SceneScar[] {
  const rounds = events.filter(event => event.kind === "round" && event.actor_id === attackerId && event.sequence < before).reverse();
  return rounds.flatMap((event, age) => event.phase !== phase ? [] : roundStrikes(event).flatMap(strike => {
    const tone = markTone(strike);
    return tone ? [{ key: event.sequence + "-" + strike.side, target: strike.side === "attacker" ? "defender" as const : "attacker" as const, point: strike.point, tone, age }] : [];
  }));
}

function place(strike: SceneStrike) {
  if (strike.target === "crew" && strike.kind === "grape") return "Crew";
  return zoneName(strike.target, strike.zone) ?? (strike.target === "ship" ? "Ship" : "Crew");
}

// The short result shown under the side that was struck.
export function strikeLabel(strike: SceneStrike) {
  if (!strike.hit) return "Miss";
  if (strike.kind === "smoke") return "Blinded";
  if (strike.damage === 0) return "Blocked · " + place(strike);
  return (strike.critical ? "Critical · " : "") + place(strike) + " · " + strike.damage;
}

// The number that rises from the impact point.
export function strikePopup(strike: SceneStrike) {
  if (!strike.hit) return "Miss";
  if (strike.kind === "smoke") return "Blinded";
  if (strike.damage === 0) return "Blocked";
  return (strike.critical ? "Critical " : "") + strike.damage;
}

function sentence(event: CombatEvent, side: SceneSide, defenderName: string) {
  const own = side === "attacker", subject = own ? "You" : defenderName, their = own ? "their" : "your";
  const order = own ? event.attacker_order : event.defender_order;
  const strike = roundStrikes(event).find(entry => entry.side === side);
  if (!strike) {
    if (order === "board") return own ? event.transition === "boarded" ? "You boarded their ship" : event.transition === "boarding_failed" ? "Your boarding attempt failed" : "You tried to board"
      : defenderName + " tried to board";
    if (order === "disengage") return "You disengaged";
    if (order === "retreat") return "You retreated";
    return null;
  }
  if (!strike.hit) return subject + " missed";
  if (strike.kind === "smoke") return subject + " blinded " + their + " crew";
  const target = strike.kind === "grape" ? their + " crew" : their + " " + place(strike).toLowerCase();
  const effect = strike.effect === "ship_speed" ? " and slowed " + their + " ship" : strike.effect === "crew_accuracy" ? " and blinded " + their + " crew" : "";
  if (strike.damage === 0) return subject + " hit " + target + " but it was blocked" + effect;
  return subject + " hit " + target + " for " + strike.damage + (strike.critical ? " (critical)" : "") + effect;
}

// A readable summary of one round for the scene caption and screen readers.
export function roundSummary(event: CombatEvent, defenderName: string) {
  const parts = (["attacker", "defender"] as const).map(side => sentence(event, side, defenderName)).filter(Boolean);
  return "Round " + event.round + ": " + parts.join(". ") + ".";
}
