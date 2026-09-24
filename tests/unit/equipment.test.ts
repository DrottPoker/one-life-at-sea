import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LoadoutPanel } from "../../src/components/inventory/loadout-panel";
import { CombatantPanel } from "../../src/components/combat/combatant-panel";
import { temporaryEffect, isShotItem, isTemporaryItem, isEquipSlot } from "../../src/lib/equipment";
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
  it("shows the selected slot in the focus box and every slot as a tile", () => {
    const props = { loadout: { hull: { quality: 100, armor: 10, health: 25, name: "Oak Hull Sheathing", image_path: "/images/items/placeholder.svg" } },
      shipHealthMax: 125, onSelect: () => {}, disabled: false, pendingSlot: null, onUnequip: () => {} };
    const hull = renderToStaticMarkup(createElement(LoadoutPanel, { ...props, selected: "hull" }));
    expect(hull).toContain("Max Ship Health 125");
    for (const label of ["Quality 100.00%", "Armor 10.00%", "Ship Health +25"]) expect(hull).toContain('aria-label="' + label + '"');
    expect(hull).toContain('aria-label="Unequip Oak Hull Sheathing"');
    expect(hull.match(/class="o-loadout-tile"/g)).toHaveLength(10);
    expect(hull).toContain('aria-label="Melee: Fists"');
    expect(hull).toContain('aria-label="Cannons: Basic cannons"');
    expect(hull).toContain('aria-label="Hull: Oak Hull Sheathing" title="Hull"');
    const melee = renderToStaticMarkup(createElement(LoadoutPanel, { ...props, selected: "melee" }));
    expect(melee).toContain('aria-label="Damage 10.00"');
    expect(melee).toContain("No equipment.");
    expect(melee).not.toContain(">Unequip<");
    // Success is visible in the tiles, so only an error adds a line to the fixed-size panel.
    expect(renderToStaticMarkup(createElement(LoadoutPanel, { ...props, selected: "hull", feedback: { message: "Equipped Oak Hull Sheathing." } }))).not.toContain("Equipped Oak");
    expect(renderToStaticMarkup(createElement(LoadoutPanel, { ...props, selected: "hull", feedback: { message: "Try again.", error: true } }))).toContain("Try again.");
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
  it("describes temporaries and recognizes the stage 2 item types", () => {
    expect(temporaryEffect({ item_id: "grenado", name: "Grenado", damage: 25, precision: 60 })).toBe("Damage 25.00 · Precision 60.00");
    expect(temporaryEffect({ item_id: "smoke_pot", name: "Smoke Pot", precision: 100, debuff_multiplier: 0.33, debuff_rounds: 3 })).toBe("Accuracy -67% for 3 rounds");
    expect([isTemporaryItem("grenado"), isTemporaryItem("chain_shot"), isShotItem("grape_shot"), isEquipSlot("temporary"), isEquipSlot("pocket")]).toEqual([true, false, true, true, false]);
  });
});
