import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CombatScene } from "../../src/components/combat/combat-scene";
import { gameplay } from "../../src/config/public";
import type { CombatEvent } from "../../src/lib/combat";
import { sceneAnchors, SCENE_SIZE, type CrewAnchors, type SceneArea, type ScenePoint } from "../../src/lib/combat-scene-anchors";
import { latestOwnRound, markTone, roundStrikes, roundSummary, sceneDuration, sceneHistory, strikeLabel, strikePopup } from "../../src/lib/combat-scene";

const round = (overrides: Partial<CombatEvent>): CombatEvent => ({
  kind: "round", sequence: 5, actor_id: "a", actor_name: "Ann", round: 3, phase: "sea", attacker_order: "fire", defender_order: "fire",
  attacker_hit: false, defender_hit: false, attacker_damage: 0, defender_damage: 0, transition: null, outcome: null, at: "2026-09-24T12:00:00Z",
  timed_out: false, participant_result: "active", ...overrides,
});

// A point lies inside an area when it is inside any of its ellipses, allowing for rounding to whole pixels.
const inside = (point: ScenePoint, area: SceneArea) => area.some(ellipse => ((point.x - ellipse.x) / (ellipse.rx + 1)) ** 2 + ((point.y - ellipse.y) / (ellipse.ry + 1)) ** 2 <= 1);

describe("combat scene", () => {
  it("has a hit area inside the artwork for every configured hit zone on both sides", () => {
    for (const side of ["attacker", "defender"] as const) {
      for (const zone of gameplay.equipment.zones.ship) expect((sceneAnchors.sea[side] as Record<string, unknown>)[zone.id]).toEqual(expect.arrayContaining([expect.anything()]));
      for (const zone of gameplay.equipment.zones.crew) expect((sceneAnchors.boarding[side] as Record<string, unknown>)[zone.id]).toEqual(expect.arrayContaining([expect.anything()]));
    }
    const values: (SceneArea | ScenePoint)[] = [...Object.values(sceneAnchors.sea).flatMap(anchors => Object.values(anchors)),
      ...Object.values(sceneAnchors.boarding).flatMap(value => Array.isArray(value) ? [value as SceneArea] : Object.values(value as CrewAnchors))];
    for (const shape of values.flatMap(value => Array.isArray(value) ? value : [{ ...value as ScenePoint, rx: 0, ry: 0 }])) {
      expect(shape.x - shape.rx).toBeGreaterThan(0); expect(shape.x + shape.rx).toBeLessThan(SCENE_SIZE.width);
      expect(shape.y - shape.ry).toBeGreaterThan(0); expect(shape.y + shape.ry).toBeLessThan(SCENE_SIZE.height);
    }
  });
  it("follows the viewer's latest round and ignores other attackers and notices", () => {
    const events = [round({ sequence: 1 }), round({ sequence: 2, actor_id: "b" }), { ...round({ sequence: 3 }), kind: "joined" as const }];
    expect(latestOwnRound(events, "a")?.sequence).toBe(1);
    expect(latestOwnRound(events, "c")).toBeNull();
  });
  it("lands every hit inside the struck zone's area, the same way each time for a round but varied between rounds", () => {
    for (let sequence = 1; sequence <= 200; sequence++) {
      for (const zone of ["rigging", "hull", "waterline"] as const) {
        const [strike] = roundStrikes(round({ sequence, attacker_hit: true, attacker_damage: 5, attacker_zone: zone, attacker_target: "ship", defender_order: "board" }));
        expect(inside(strike.point, sceneAnchors.sea.defender[zone])).toBe(true);
      }
      for (const zone of ["head", "body", "legs", "feet"] as const) {
        const [strike] = roundStrikes(round({ sequence, phase: "boarding", attacker_order: "crew_attack", defender_order: "disengage", attacker_hit: true,
          attacker_damage: 5, attacker_zone: zone, attacker_target: "crew" }));
        expect(inside(strike.point, sceneAnchors.boarding.defender[zone])).toBe(true);
      }
    }
    const event = round({ attacker_hit: true, attacker_damage: 8, attacker_zone: "hull", attacker_target: "ship" });
    expect(roundStrikes(event)[0].point).toEqual(roundStrikes(event)[0].point);
    const spots = new Set(Array.from({ length: 12 }, (_, sequence) => JSON.stringify(roundStrikes({ ...event, sequence })[0].point)));
    expect(spots.size).toBeGreaterThan(8);
  });
  it("spreads misses around the target instead of one spot", () => {
    // Every ellipse of a miss area is used, so cannon misses reach the water on all sides of the ship and shots every side of the captain.
    const used = (area: SceneArea, points: ScenePoint[]) => new Set(points.map(point => area.findIndex(ellipse => inside(point, [ellipse])))).size;
    const shots = Array.from({ length: 300 }, (_, sequence) => roundStrikes(round({ sequence, defender_order: "board" }))[0]);
    expect(shots.every(shot => shot.area === "splash" && inside(shot.point, sceneAnchors.sea.defender.splash))).toBe(true);
    expect(used(sceneAnchors.sea.defender.splash, shots.map(shot => shot.point))).toBe(sceneAnchors.sea.defender.splash.length);
    const strays = Array.from({ length: 300 }, (_, sequence) => roundStrikes(round({ sequence, phase: "boarding", attacker_order: "crew_shoot", defender_order: "disengage",
      attacker_target: "crew" }))[0]);
    expect(strays.every(stray => inside(stray.point, sceneAnchors.boarding.defender.near))).toBe(true);
    expect(used(sceneAnchors.boarding.defender.near, strays.map(stray => stray.point))).toBe(sceneAnchors.boarding.defender.near.length);
    const xs = shots.map(shot => shot.point.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(400);
  });
  it("places cannon hits on the struck ship zone and misses in the water", () => {
    const [own, theirs] = roundStrikes(round({ attacker_hit: true, attacker_damage: 30, attacker_zone: "waterline", attacker_critical: true, attacker_target: "ship" }));
    expect(own).toMatchObject({ side: "attacker", kind: "cannon", critical: true, origin: sceneAnchors.sea.attacker.guns, label: sceneAnchors.sea.defender.label });
    expect(inside(own.point, sceneAnchors.sea.defender.waterline)).toBe(true);
    expect(own.popup).toEqual(own.point);
    expect(theirs).toMatchObject({ side: "defender", hit: false, label: sceneAnchors.sea.attacker.label });
    expect(inside(theirs.point, sceneAnchors.sea.attacker.splash)).toBe(true);
    expect(theirs.start).toBeGreaterThan(own.impact);
    expect(sceneDuration([own, theirs])).toBe(theirs.end);
    expect([strikeLabel(own), strikePopup(own), strikeLabel(theirs), strikePopup(theirs)]).toEqual(["Critical · Waterline · 30", "Critical 30", "Miss", "Miss"]);
    expect([markTone(own), markTone(theirs)]).toEqual(["critical", "miss"]);
  });
  it("shows chain shot in the rigging, grape shot on the deck crew and blocked hits", () => {
    const [chain] = roundStrikes(round({ attacker_order: "fire_chain", attacker_hit: true, attacker_damage: 4, attacker_zone: "rigging", attacker_target: "ship", attacker_effect: "ship_speed", defender_order: "board" }));
    expect(chain).toMatchObject({ kind: "chain", effect: "ship_speed" });
    expect(inside(chain.point, sceneAnchors.sea.defender.rigging)).toBe(true);
    const [grape] = roundStrikes(round({ attacker_order: "fire_grape", attacker_hit: true, attacker_damage: 6, attacker_zone: "legs", attacker_target: "crew", defender_order: "board" }));
    expect(grape.kind).toBe("grape");
    expect(inside(grape.point, sceneAnchors.sea.defender.deck)).toBe(true);
    expect(strikeLabel(grape)).toBe("Crew · 6");
    const [blocked] = roundStrikes(round({ attacker_hit: true, attacker_damage: 0, attacker_zone: "hull", attacker_target: "ship", defender_order: "board" }));
    expect([strikeLabel(blocked), strikePopup(blocked), markTone(blocked)]).toEqual(["Blocked · Hull", "Blocked", "blocked"]);
  });
  it("uses the boarding figures for melee, firearms and thrown temporaries", () => {
    const base = { phase: "boarding" as const, attacker_target: "crew" as const, defender_target: "crew" as const };
    const [melee, shot] = roundStrikes(round({ ...base, attacker_order: "crew_attack", attacker_hit: true, attacker_damage: 9, attacker_zone: "head",
      defender_order: "crew_shoot", defender_hit: false }));
    expect(melee).toMatchObject({ kind: "melee", origin: null });
    expect(inside(melee.point, sceneAnchors.boarding.defender.head)).toBe(true);
    expect(shot).toMatchObject({ kind: "firearm", origin: sceneAnchors.boarding.defender.blade, area: "near" });
    expect(inside(shot.point, sceneAnchors.boarding.attacker.near)).toBe(true);
    // A missed swing is either parried between the blades, reported over the defender's head, or dodged beside them.
    const swings = Array.from({ length: 60 }, (_, sequence) => roundStrikes(round({ ...base, sequence, attacker_order: "crew_attack", defender_order: "disengage" }))[0]);
    for (const swing of swings) {
      expect(markTone(swing)).toBe("miss");
      if (swing.area === "parry") {
        expect(inside(swing.point, sceneAnchors.boarding.parry)).toBe(true);
        expect(swing.popup).toEqual(sceneAnchors.boarding.defender.head[0]);
      } else {
        expect(swing.area).toBe("near");
        expect(inside(swing.point, sceneAnchors.boarding.defender.near)).toBe(true);
        expect(swing.popup).toEqual(swing.point);
      }
    }
    expect(new Set(swings.map(swing => swing.area))).toEqual(new Set(["parry", "near"]));
    const [smoke] = roundStrikes(round({ ...base, attacker_order: "crew_throw", attacker_hit: true, attacker_weapon: "Smoke Pot", attacker_effect: "crew_accuracy", defender_order: "disengage" }));
    expect(smoke).toMatchObject({ kind: "smoke", origin: sceneAnchors.boarding.attacker.hand });
    expect(inside(smoke.point, sceneAnchors.boarding.defender.body)).toBe(true);
    expect([strikeLabel(smoke), markTone(smoke)]).toEqual(["Blinded", "effect"]);
    const [thrown] = roundStrikes(round({ ...base, attacker_order: "crew_throw", attacker_weapon: "Smoke Pot", defender_order: "disengage" }));
    expect(thrown.kind).toBe("smoke");
    expect(inside(thrown.point, sceneAnchors.boarding.defender.floor)).toBe(true);
    const [grenade] = roundStrikes(round({ ...base, attacker_order: "crew_throw", attacker_weapon: "Grenado", attacker_hit: true, attacker_damage: 20, attacker_zone: "body", defender_order: "disengage" }));
    expect(grenade.kind).toBe("grenade");
  });
  it("keeps earlier hits and misses of the viewer's rounds in the same phase as markers, newest first", () => {
    const events = [
      round({ sequence: 1, attacker_hit: true, attacker_damage: 10, attacker_zone: "hull", attacker_target: "ship",
        defender_hit: true, defender_damage: 5, defender_zone: "rigging", defender_target: "ship" }),
      round({ sequence: 2, actor_id: "b", attacker_hit: true, attacker_damage: 10, attacker_zone: "hull", attacker_target: "ship" }),
      round({ sequence: 3, phase: "boarding", attacker_order: "crew_attack", defender_order: "crew_attack", attacker_hit: true, attacker_damage: 8,
        attacker_zone: "head", attacker_target: "crew" }),
      round({ sequence: 4, attacker_hit: true, attacker_damage: 0, attacker_zone: "hull", attacker_target: "ship" }),
      round({ sequence: 5, attacker_hit: true, attacker_damage: 12, attacker_zone: "waterline", attacker_critical: true, attacker_target: "ship" }),
    ];
    const scars = sceneHistory(events, "a", "sea", 5);
    expect(scars.map(scar => [scar.key, scar.target, scar.tone, scar.age])).toEqual([
      ["4-attacker", "defender", "blocked", 0], ["4-defender", "attacker", "miss", 0], ["1-attacker", "defender", "hit", 2], ["1-defender", "attacker", "hit", 2]]);
    expect(scars[2].point).toEqual(roundStrikes(events[0])[0].point);
    expect(sceneHistory(events, "a", "boarding", 5).map(scar => [scar.key, scar.tone])).toEqual([["3-attacker", "hit"], ["3-defender", "miss"]]);
    expect(sceneHistory(events, "a", "sea", 1)).toEqual([]);
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
    expect(html).not.toContain("o-scene-scar");
    expect(html).toContain('class="o-scene-mark" data-tone="miss" data-zone="ship" data-target="attacker"');
    // An earlier hit and miss in the same phase stay as smaller markers beside the latest ones.
    const earlier = round({ sequence: 4, round: 2, attacker_hit: true, attacker_damage: 3, attacker_zone: "rigging", attacker_target: "ship" });
    const marked = renderToStaticMarkup(createElement(CombatScene, { phase: "sea", events: [earlier, ...events], attackerId: "a", defenderName: "Bo" }));
    expect(marked.match(/class="o-scene-scar"/g)).toHaveLength(2);
    expect(marked).toContain('class="o-scene-scar" data-tone="hit" data-target="defender"');
    expect(marked).toContain('class="o-scene-scar" data-tone="miss" data-target="attacker"');
    expect(marked.match(/class="o-scene-mark"/g)).toHaveLength(2);
    // The result of a finished fight waits for its final round to play out, so the first render never shows Leave.
    const finale = { title: "Victory", text: "The defending ship was sunk.", href: "/combatlog/test" };
    const finished = renderToStaticMarkup(createElement(CombatScene, { phase: "sea", events, attackerId: "a", defenderName: "Bo", finale }));
    expect(finished).not.toContain("o-scene-finale");
    expect(finished).not.toContain(">Leave<");
    const idle = renderToStaticMarkup(createElement(CombatScene, { phase: "boarding", attackerId: "a", defenderName: "Bo" }));
    expect(idle).toContain("Steel. Blood. Plunder.");
    expect(idle).not.toContain("o-scene-overlay");
  });
});
