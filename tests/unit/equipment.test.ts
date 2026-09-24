import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LoadoutPanel } from "../../src/components/inventory/loadout-panel";
import { CombatantPanel } from "../../src/components/combat/combatant-panel";
import { equipmentSlotStats } from "../../scripts/config/core.mjs";
import { gameplay } from "../../src/config/public";
import { EQUIPMENT_SLOTS, SLOT_STATS, isEquipmentSlot, itemStatRows, itemStatSummary, zoneName } from "../../src/lib/equipment";

describe("equipment", () => {
  it("keeps the app slot rules equal to the config validation", () => {
    expect(SLOT_STATS).toEqual(equipmentSlotStats);
    expect([...EQUIPMENT_SLOTS].sort()).toEqual(Object.keys(equipmentSlotStats).sort());
    expect(isEquipmentSlot("melee")).toBe(true);
    expect(isEquipmentSlot("crew_weapon")).toBe(false);
  });
  it("keeps the default hit zones at the base damage on average", () => {
    for (const zones of Object.values(gameplay.equipment.zones)) {
      const weight = zones.reduce((sum, zone) => sum + zone.weight, 0);
      expect(zones.reduce((sum, zone) => sum + zone.weight * zone.multiplier, 0) / weight).toBeCloseTo(1, 10);
    }
  });
  it("formats the stats an item has in reading order", () => {
    expect(itemStatRows({ quality: 50, precision: 52, damage: 13.5 }).map(row => row.label + " " + row.text)).toEqual(["Damage 13.50", "Precision 52.00"]);
    expect(itemStatSummary({ quality: 100, armor: 10, health: 25 })).toBe("Quality 100.00% · Armor 10.00% · Ship Health +25");
    expect(itemStatSummary({ quality: 0, armor: 3, speed: 2 })).toBe("Quality 0.00% · Armor 3.00% · Speed +2.00%");
    expect(itemStatSummary({ quality: 25.5, damage: 19, precision: 48, shots: 2 })).toBe("Quality 25.50% · Damage 19.00 · Precision 48.00 · Shots 2");
  });
  it("names recorded hit zones and ignores older events without one", () => {
    expect(zoneName("crew", "head")).toBe("Head");
    expect(zoneName("ship", "rigging")).toBe("Sails and rigging");
    expect(zoneName("crew", null)).toBeNull();
  });
  it("shows fallbacks for empty weapon slots and the hull maximum in the loadout", () => {
    const html = renderToStaticMarkup(createElement(LoadoutPanel, {
      loadout: { hull: { quality: 100, armor: 10, health: 25, name: "Oak Hull Sheathing" } }, shipHealthMax: 125,
      disabled: false, pendingSlot: null, onUnequip: () => {},
    }));
    expect(html).toContain("Max Ship Health 125");
    expect(html).toContain("Fists");
    expect(html).toContain("Basic cannons");
    expect(html).toContain("Quality 100.00% · Armor 10.00% · Ship Health +25");
    expect(html).toContain('aria-label="Unequip Oak Hull Sheathing"');
    expect(html.match(/>Unequip</g)).toHaveLength(1);
  });
  it("shows own equipment stats but only names for a revealed opponent", () => {
    const captain = { id: "test", player_number: 100001, name: "Gear Captain", ship_health: 120, ship_health_max: 125, crew_health: 100,
      ammo: 10, shots: 2, ship: null, crew: null };
    const loadout = { firearm: { quality: 50, damage: 20, precision: 50, shots: 2, name: "Flintlock Pistol" }, body: { quality: 50, armor: 10, name: "Buff Coat" } };
    const own = renderToStaticMarkup(createElement(CombatantPanel, { own: true, phase: "boarding", captain: { ...captain, loadout } }));
    expect(own).toContain("2 shots remaining · Damage 20.00 · Precision 50.00");
    expect(own).toContain("Body 10.00%");
    const opponent = renderToStaticMarkup(createElement(CombatantPanel, { own: false, phase: "boarding",
      captain: { ...captain, loadout: { firearm: { name: "Flintlock Pistol" }, body: { name: "Buff Coat" } } } }));
    expect(opponent).toContain("Flintlock Pistol");
    expect(opponent).not.toContain("Damage");
    const sea = renderToStaticMarkup(createElement(CombatantPanel, { own: true, phase: "sea", captain: { ...captain, loadout } }));
    expect(sea).toContain("120 / 125");
    expect(sea).toContain("10 salvos remaining");
    const hidden = renderToStaticMarkup(createElement(CombatantPanel, { own: false, phase: "sea", captain: { ...captain, loadout: null } }));
    expect(hidden.match(/Unknown/g)).toHaveLength(3);
  });
});
