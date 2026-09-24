import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CombatScene } from "../../src/components/combat/combat-scene";
import { gameplay } from "../../src/config/public";
import { FINALE_WINDOW_MS, recentlyFinished, type CombatEvent } from "../../src/lib/combat";
import { sceneAnchors, SCENE_SIZE } from "../../src/lib/combat-scene-anchors";
import { latestOwnRound, roundStrikes, roundSummary, sceneDuration, strikeLabel, strikePopup } from "../../src/lib/combat-scene";

const round = (overrides: Partial<CombatEvent>): CombatEvent => ({
  kind: "round", sequence: 5, actor_id: "a", actor_name: "Ann", round: 3, phase: "sea", attacker_order: "fire", defender_order: "fire",
  attacker_hit: false, defender_hit: false, attacker_damage: 0, defender_damage: 0, transition: null, outcome: null, at: "2026-09-24T12:00:00Z",
  timed_out: false, participant_result: "active", ...overrides,
});

describe("combat scene", () => {
  it("has an anchor inside the artwork for every configured hit zone on both sides", () => {
    for (const side of ["attacker", "defender"] as const) {
      for (const zone of gameplay.equipment.zones.ship) expect(sceneAnchors.sea[side]).toHaveProperty(zone.id);
      for (const zone of gameplay.equipment.zones.crew) expect(sceneAnchors.boarding[side]).toHaveProperty(zone.id);
    }
    const points = [...Object.values(sceneAnchors.sea).flatMap(Object.values), ...Object.values(sceneAnchors.boarding).flatMap(value => "x" in value ? [value] : Object.values(value))];
    for (const point of points) {
      expect(point.x).toBeGreaterThan(0); expect(point.x).toBeLessThan(SCENE_SIZE.width);
      expect(point.y).toBeGreaterThan(0); expect(point.y).toBeLessThan(SCENE_SIZE.height);
    }
  });
  it("keeps a just-finished fight available for its final round only briefly", () => {
    const observed = "2026-09-24T12:00:30.000Z", at = (ms: number) => new Date(Date.parse(observed) - ms).toISOString();
    expect(recentlyFinished({ status: "completed", finished_at: at(FINALE_WINDOW_MS), observed_at: observed })).toBe(true);
    expect(recentlyFinished({ status: "completed", finished_at: at(FINALE_WINDOW_MS + 1), observed_at: observed })).toBe(false);
    expect(recentlyFinished({ status: "active", finished_at: null, observed_at: observed })).toBe(false);
  });
  it("follows the viewer's latest round and ignores other attackers and notices", () => {
    const events = [round({ sequence: 1 }), round({ sequence: 2, actor_id: "b" }), { ...round({ sequence: 3 }), kind: "joined" as const }];
    expect(latestOwnRound(events, "a")?.sequence).toBe(1);
    expect(latestOwnRound(events, "c")).toBeNull();
  });
  it("places cannon hits on the struck ship zone and misses in the water", () => {
    const [own, theirs] = roundStrikes(round({ attacker_hit: true, attacker_damage: 30, attacker_zone: "waterline", attacker_critical: true, attacker_target: "ship" }));
    expect(own).toMatchObject({ side: "attacker", kind: "cannon", critical: true, origin: sceneAnchors.sea.attacker.guns, point: sceneAnchors.sea.defender.waterline,
      label: sceneAnchors.sea.defender.label });
    expect(theirs).toMatchObject({ side: "defender", hit: false, point: sceneAnchors.sea.attacker.splash, label: sceneAnchors.sea.attacker.label });
    expect(theirs.start).toBeGreaterThan(own.impact);
    expect(sceneDuration([own, theirs])).toBe(theirs.end);
    expect([strikeLabel(own), strikePopup(own), strikeLabel(theirs), strikePopup(theirs)]).toEqual(["Critical · Waterline · 30", "Critical 30", "Miss", "Miss"]);
  });
  it("shows chain shot in the rigging, grape shot on the deck crew and blocked hits", () => {
    const [chain] = roundStrikes(round({ attacker_order: "fire_chain", attacker_hit: true, attacker_damage: 4, attacker_zone: "rigging", attacker_target: "ship", attacker_effect: "ship_speed", defender_order: "board" }));
    expect(chain).toMatchObject({ kind: "chain", point: sceneAnchors.sea.defender.rigging, effect: "ship_speed" });
    const [grape] = roundStrikes(round({ attacker_order: "fire_grape", attacker_hit: true, attacker_damage: 6, attacker_zone: "legs", attacker_target: "crew", defender_order: "board" }));
    expect(grape).toMatchObject({ kind: "grape", point: sceneAnchors.sea.defender.deck });
    expect(strikeLabel(grape)).toBe("Crew · 6");
    const [blocked] = roundStrikes(round({ attacker_hit: true, attacker_damage: 0, attacker_zone: "hull", attacker_target: "ship", defender_order: "board" }));
    expect([strikeLabel(blocked), strikePopup(blocked)]).toEqual(["Blocked · Hull", "Blocked"]);
  });
  it("uses the boarding figures for melee, firearms and thrown temporaries", () => {
    const base = { phase: "boarding" as const, attacker_target: "crew" as const, defender_target: "crew" as const };
    const [melee, shot] = roundStrikes(round({ ...base, attacker_order: "crew_attack", attacker_hit: true, attacker_damage: 9, attacker_zone: "head",
      defender_order: "crew_shoot", defender_hit: false }));
    expect(melee).toMatchObject({ kind: "melee", origin: null, point: sceneAnchors.boarding.defender.head });
    expect(shot).toMatchObject({ kind: "firearm", origin: sceneAnchors.boarding.defender.blade, point: sceneAnchors.boarding.attacker.stray });
    const [parried] = roundStrikes(round({ ...base, attacker_order: "crew_attack", defender_order: "disengage" }));
    expect(parried).toMatchObject({ point: sceneAnchors.boarding.parry, popup: sceneAnchors.boarding.defender.head });
    const [smoke] = roundStrikes(round({ ...base, attacker_order: "crew_throw", attacker_hit: true, attacker_weapon: "Smoke Pot", attacker_effect: "crew_accuracy", defender_order: "disengage" }));
    expect(smoke).toMatchObject({ kind: "smoke", origin: sceneAnchors.boarding.attacker.hand, point: sceneAnchors.boarding.defender.body });
    expect(strikeLabel(smoke)).toBe("Blinded");
    const [thrown] = roundStrikes(round({ ...base, attacker_order: "crew_throw", attacker_weapon: "Smoke Pot", defender_order: "disengage" }));
    expect(thrown).toMatchObject({ kind: "smoke", point: sceneAnchors.boarding.defender.floor });
    const [grenade] = roundStrikes(round({ ...base, attacker_order: "crew_throw", attacker_weapon: "Grenado", attacker_hit: true, attacker_damage: 20, attacker_zone: "body", defender_order: "disengage" }));
    expect(grenade.kind).toBe("grenade");
  });
  it("skips orders without a strike and summarizes the round from the viewer's side", () => {
    const boarded = round({ attacker_order: "board", defender_hit: true, defender_damage: 12, defender_zone: "hull", defender_target: "ship", transition: "boarded" });
    expect(roundStrikes(boarded).map(strike => strike.side)).toEqual(["defender"]);
    expect(roundSummary(boarded, "Bo")).toBe("Round 3: You boarded their ship. Bo hit your hull for 12.");
    const chain = round({ attacker_order: "fire_chain", attacker_hit: true, attacker_damage: 4, attacker_zone: "rigging", attacker_target: "ship", attacker_effect: "ship_speed" });
    expect(roundSummary(chain, "Bo")).toBe("Round 3: You hit their sails and rigging for 4 and slowed their ship. Bo missed.");
    const crew = round({ phase: "boarding", attacker_order: "crew_attack", attacker_hit: true, attacker_damage: 25, attacker_zone: "head", attacker_critical: true,
      attacker_target: "crew", defender_order: "crew_throw", defender_hit: true, defender_weapon: "Smoke Pot", defender_effect: "crew_accuracy", defender_target: "crew" });
    expect(roundSummary(crew, "Bo")).toBe("Round 3: You hit their head for 25 (critical). Bo blinded your crew.");
  });
  it("renders the latest round's marks and labels without replaying it on the first render", () => {
    const events = [round({ attacker_hit: true, attacker_damage: 14, attacker_zone: "hull", attacker_target: "ship" })];
    const html = renderToStaticMarkup(createElement(CombatScene, { phase: "sea", events, attackerId: "a", defenderName: "Bo" }));
    expect(html).toContain('data-round="5"');
    expect(html).toContain('data-animate="false"');
    expect(html).not.toContain("o-scene-live");
    expect(html).toContain('data-zone="hull"');
    expect(html).toContain(">Hull · 14<");
    expect(html).toContain(">Miss<");
    expect(html).toContain("Round 3: You hit their hull for 14. Bo missed.");
    const idle = renderToStaticMarkup(createElement(CombatScene, { phase: "boarding", attackerId: "a", defenderName: "Bo" }));
    expect(idle).toContain("Steel. Blood. Plunder.");
    expect(idle).not.toContain("o-scene-overlay");
  });
});
