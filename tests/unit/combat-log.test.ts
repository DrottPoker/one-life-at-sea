import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CombatEvents, CombatMatchup } from "../../src/components/combat/combat-log";
import { combatXp, combatXpLabel, type CombatEvent, type CombatPerson } from "../../src/lib/combat";

const base = { actor_id: "a", actor_name: "Ann", round: 1, attacker_hit: false, defender_hit: false, attacker_damage: 0, defender_damage: 0,
  transition: null, outcome: null, timed_out: false, participant_result: "active" as const };
const event = (overrides: Partial<CombatEvent>): CombatEvent => ({ kind: "round", sequence: 1, phase: "sea", attacker_order: "fire", defender_order: "fire",
  at: "2026-09-24T12:00:00Z", ...base, ...overrides });
const person = (overrides: Partial<CombatPerson>): CombatPerson => ({ id: "a", player_number: 100001, name: "Ann", role: "attacker", status: "victory",
  hits: 1, damage: 30, ship_damage: 30, crew_damage: 0, ship_health: 90, ship_health_max: 120, crew_health: 100, phase: null, ...overrides });

describe("combat log", () => {
  it("marks each entry by kind and phase and colours results by what happened", () => {
    const html = renderToStaticMarkup(createElement(CombatEvents, { defenderId: "d", defenderName: "Bo", people: [], events: [
      event({ kind: "started", sequence: 1 }),
      event({ sequence: 2, attacker_hit: true, attacker_damage: 30, attacker_zone: "waterline", attacker_critical: true, attacker_target: "ship" }),
      event({ sequence: 3, phase: "boarding", attacker_order: "crew_attack", defender_order: "crew_attack", attacker_hit: true, attacker_damage: 0, attacker_zone: "body",
        attacker_target: "crew", outcome: "boarding_victory", participant_result: "victory" }),
    ] }));
    expect(html).toContain('data-kind="started"');
    expect(html).toContain('data-phase="sea"');
    expect(html).toContain('data-phase="boarding" data-final="true"');
    expect(html).toContain('data-tone="critical">Waterline · 30 ship damage · Critical<');
    expect(html).toContain('data-tone="miss">Missed<');
    expect(html).toContain('data-tone="blocked">Body · Blocked · 0 damage<');
    expect(html).toContain("o-log-outcome\">The defending crew was overcome.<");
    expect(html.match(/class="o-log-marker"/g)).toHaveLength(3);
  });
  it("sets the attackers against the defender with the final blow, contributions and condition afterwards", () => {
    const html = renderToStaticMarkup(createElement(CombatMatchup, { winnerId: "b", people: [
      person({ id: "a", name: "Ann", status: "assist" }), person({ id: "b", name: "Ben", player_number: 100002 }),
      person({ id: "d", name: "Bo", role: "defender", status: "defeated", player_number: 100003, ship_health: 0, crew_health: 0, ship_health_max: 100 }),
    ] }));
    expect(html).toContain("People (3)");
    expect(html).toContain('<ul aria-label="Attackers">');
    expect(html).toContain('<ul aria-label="Defender">');
    expect(html.indexOf("Ann")).toBeLessThan(html.indexOf(">VS<"));
    expect(html.indexOf(">VS<")).toBeLessThan(html.indexOf(">Bo<"));
    expect(html).toContain('data-result="victory" data-final="true"');
    expect(html).toContain(">Final blow<");
    expect(html).toContain('aria-label="Bo Crew Health" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"');
    expect(html).toContain('aria-label="Ben Ship Health" aria-valuenow="90" aria-valuemin="0" aria-valuemax="120"');
  });
  it("shows each captain's own Crew Health maximum, falling back to the base for older reports", () => {
    const html = renderToStaticMarkup(createElement(CombatMatchup, { winnerId: null, people: [
      person({ id: "a", name: "Ann", crew_health: 90, crew_health_max: 154 }), person({ id: "d", name: "Bo", role: "defender", status: "survived" }),
    ] }));
    expect(html).toContain('aria-label="Ann Crew Health" aria-valuenow="90" aria-valuemin="0" aria-valuemax="154"');
    expect(html).toContain('aria-label="Bo Crew Health" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100"');
  });
});

describe("combat XP summary", () => {
  it("counts every own attacking order by phase, hit or miss", () => {
    const events = [
      event({ kind: "started", sequence: 1 }),
      event({ sequence: 2, attacker_order: "fire", attacker_hit: true }),
      event({ sequence: 3, attacker_order: "fire_grape" }),
      event({ sequence: 4, attacker_order: "board", defender_order: "fire" }),
      event({ sequence: 5, actor_id: "b", attacker_order: "fire" }),
      event({ sequence: 6, phase: "boarding", attacker_order: "crew_attack", defender_order: "crew_attack" }),
      event({ sequence: 7, phase: "boarding", attacker_order: "crew_throw", defender_order: "crew_attack" }),
      event({ sequence: 8, phase: "boarding", attacker_order: "retreat", defender_order: "crew_attack" }),
    ];
    expect(combatXp(events, "a")).toEqual({ ship_battling: 20, crew_battling: 20 });
    expect(combatXpLabel(events, "a")).toBe("+20 Ship Battling XP · +20 Crew Battling XP");
    expect(combatXpLabel(events, "b")).toBe("+10 Ship Battling XP");
    expect(combatXpLabel([event({ attacker_order: "retreat" })], "a")).toBeNull();
  });
});
