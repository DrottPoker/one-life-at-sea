import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/config/public", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/config/public")>();
  return { ...actual, gameplay: { ...actual.gameplay,
    resources: { ...actual.gameplay.resources, energyMax: 200, healthMax: 250, energyRecoverySeconds: 45, shipRecoverySeconds: 15, crewRecoverySeconds: 5 },
    training: { energyCost: 9, statGain: 4 },
  } };
});
vi.mock("@/components/game-state", () => ({
  useGameState: () => ({
    energy: 50, ship_health: 50, crew_health: 125, health_next_at: "2026-09-17T00:00:00Z",
    crew_attack: 10, crew_defense: 10, crew_speed: 10, crew_accuracy: 10,
    active_attack: null, protected_until: null,
  }),
}));
vi.mock("@/app/training-actions", () => ({ trainStat: async () => ({}) }));

import { ResourceBars } from "../../src/components/resource-bars";
import { TrainingPanel } from "../../src/components/training-panel";
import { CombatantPanel } from "../../src/components/combatant-panel";

describe("configured interface", () => {
  it("renders resource capacities, percentages and recovery rates from config", () => {
    const html = renderToStaticMarkup(createElement(ResourceBars));
    expect(html).toContain('aria-valuemax="200"');
    expect(html).toContain('aria-valuemax="250"');
    expect(html).toContain('width:25%');
    expect(html).toContain('width:20%');
    expect(html).toContain('45 seconds');
    expect(html).toContain('15s');
    expect(html).toContain('5s');
  });
  it("uses the configured training cost and gain in buttons and explanatory copy", () => {
    const html = renderToStaticMarkup(createElement(TrainingPanel, { group: "crew" }));
    expect(html).toContain('aria-label="Train Attack for 9 Energy"');
    expect(html).toContain('9 Energy');
    expect(html).toContain('4 points');
    expect(html).not.toContain("5 Energy");
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
