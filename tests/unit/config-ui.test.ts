import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/config/public", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/config/public")>();
  return { ...actual, gameplay: { ...actual.gameplay,
    resources: { ...actual.gameplay.resources, energyMax: 200, healthMax: 250, energyRecoverySeconds: 45, energyRecoveryAmount: 7, shipRecoverySeconds: 15, crewRecoverySeconds: 5 },
    training: { ...actual.gameplay.training, energyCost: 9, crewTiers: actual.gameplay.training.crewTiers.map((t, i) => i ? t : { ...t, statGain: 4 }) },
  } };
});
vi.mock("@/components/game-state", () => ({
  useGameState: () => ({
    training: { progress: { crew: { xp: 0, tier_id: "crew_1" } }, ship_job: null },
    gold_coins: 1234, bank_gold_coins: 500,
    energy: 50, ship_health: 50, crew_health: 125, health_next_at: "2026-09-17T00:00:00Z",
    crew_attack: 10, crew_defense: 10, crew_speed: 10, crew_accuracy: 10,
    active_attack: null, protected_until: null,
  }),
}));
vi.mock("@/app/training-actions", () => ({ trainingAction: async () => ({}) }));

import { ResourceBars } from "../../src/components/resource-bars";
import { CrewTrainingPanel } from "../../src/components/crew-training-panel";
import { CombatantPanel } from "../../src/components/combatant-panel";

describe("configured interface", () => {
  it("renders resource capacities, percentages and recovery rates from config", () => {
    const html = renderToStaticMarkup(createElement(ResourceBars));
    expect(html).toContain('aria-valuemax="200"');
    expect(html).toContain('aria-valuemax="250"');
    expect(html).toContain('width:25%');
    expect(html).toContain('width:20%');
    expect(html).toContain('Energy: +7 every 45 seconds');
    expect(html).toContain('15s');
    expect(html).toContain('5s');
  });
  it("uses the configured training cost and gain in buttons and explanatory copy", () => {
    const html = renderToStaticMarkup(createElement(CrewTrainingPanel));
    expect(html).toContain('aria-label="Train Attack for 9 Energy"');
    expect(html).toContain('9 Energy');
    expect(html).toContain('4 points');
    expect(html).not.toContain("5 Energy");
    expect(html).not.toMatch(/\bXP\b|earned|more XP required/);
    expect(html).toContain('aria-label="Crew progress" max="100" value="0"');
  });
  it("uses the health cap in combat panels as well as the sidebar", () => {
    const html = renderToStaticMarkup(createElement(CombatantPanel, {
      own: true, phase: "sea",
      captain: { id: "test", name: "Config Captain", ship_health: 50, crew_health: 125, ammo: 10,
        ship: null, crew: null, cannons: null, weapon: null },
    }));
    expect(html).toContain('aria-valuemax="250"');
    expect(html).toContain('width:20%');
    expect(html).toContain('width:50%');
  });
});
