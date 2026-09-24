import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/config/public", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/config/public")>();
  return { ...actual, gameplay: { ...actual.gameplay,
    resources: { ...actual.gameplay.resources, energyMax: 200, healthMax: 250, energyRecoverySeconds: 45, energyRecoveryAmount: 7, shipRecoverySeconds: 15, crewRecoverySeconds: 5 },
    stamina: { ...actual.gameplay.stamina, maximum: 80, recoveryAmount: 2, recoverySeconds: 60 },
    training: { ...actual.gameplay.training, energyCost: 9, crewTiers: actual.gameplay.training.crewTiers.map((t, i) => i ? t : { ...t, efficiency: 4 }) },
  } };
});
vi.mock("@/components/game-state", () => ({
  useGameState: () => ({
    training: { progress: { crew: { xp: 0, tier_id: "crew_1" } }, ship_job: null },
    sea: { state: "in_harbor" },
    gold_coins: 1234, bank_gold_coins: 500,
    crew_morale: 0, morale_next_at: null,
    stamina: 20, stamina_next_at: null,
    energy: 50, ship_health: 50, crew_health: 125, health_next_at: "2026-09-17T00:00:00Z",
    crew_attack: 10, crew_defense: 9999.994, crew_speed: 10000.625, crew_accuracy: 10000000000.625,
    active_attack: null, protected_until: null,
  }),
}));
vi.mock("@/components/economy-requests", () => ({ useEconomyRequests: () => ({ unconfirmed: false, training: async () => ({}) }) }));

import { ResourceBars } from "../../src/components/resource-bars";
import { CrewTrainingPanel } from "../../src/components/training/crew-training-panel";
import { CombatantPanel } from "../../src/components/combat/combatant-panel";

describe("configured interface", () => {
  it("renders resource capacities, percentages and recovery rates from config", () => {
    const html = renderToStaticMarkup(createElement(ResourceBars));
    expect(html).toContain('aria-valuemax="80"');
    expect(html).toContain('Increases by 2 every 1 minute. Used for skill activities.');
    expect(html).toContain('aria-valuemax="200"');
    expect(html).toContain('aria-valuemax="250"');
    expect(html).toContain('width:25%');
    expect(html).toContain('width:20%');
    expect(html).toContain('Increases by 7 every 45 seconds.');
    expect(html).toContain('every 15 seconds outside combat.');
    expect(html).toContain('every 5 seconds outside combat.');
  });
  it("uses the same configured cost in each card without gain previews", () => {
    const html = renderToStaticMarkup(createElement(CrewTrainingPanel));
    for (const stat of ["Attack", "Defense", "Speed", "Accuracy"]) {
      expect(html).toContain('aria-label="Train ' + stat + ' for 9 Energy"');
    }
    expect(html.match(/9 Energy per drill/g)).toHaveLength(4);
    expect(html).toContain('Training efficiency</span></dt><dd>4x</dd>');
    expect(html).not.toContain("Expected Attack gain");
    expect(html).not.toContain("Gain per drill");
    expect(html).not.toContain("Attack gained");
    expect(html).toContain('Gains grow with that stat and your training efficiency.');
    expect(html).not.toContain("5 Energy");
    expect(html).not.toMatch(/\bXP\b|earned|more XP required/);
    expect(html).toContain('aria-label="Crew progress" max="100" value="0"');
  });
  it("formats owned stats without predicting training gains", () => {
    const html = renderToStaticMarkup(createElement(CrewTrainingPanel));
    expect(html).toContain('aria-label="Defense stat">9,999.99</output>');
    expect(html).toContain('aria-label="Speed stat">10,001</output>');
    expect(html).toContain('aria-label="Accuracy stat">10,000,000,001</output>');
    expect(html).not.toContain('Expected Accuracy gain');
    expect(html).not.toContain('Accuracy gained');
  });
  it("uses the health cap in combat panels as well as the sidebar", () => {
    const html = renderToStaticMarkup(createElement(CombatantPanel, {
      own: true, phase: "sea",
      captain: { id: "test", player_number: 100001, name: "Config Captain", ship_health: 50, crew_health: 125, ammo: 10,
        ship: null, crew: null, loadout: {} },
    }));
    expect(html).toContain('aria-valuemax="250"');
    expect(html).toContain('width:20%');
    expect(html).toContain('width:50%');
  });
});
