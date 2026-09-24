"use client";

import type { ReactNode } from "react";
import { Bomb, Boxes, Crosshair, Footprints, HardHat, Sailboat, Ship, Shirt, Shield, Swords, Target, type LucideIcon } from "lucide-react";
import { ItemImage } from "@/components/inventory/item-image";
import { ItemStatChips } from "@/components/inventory/item-stat-chips";
import { CREW_SLOTS, SHIP_SLOTS, SLOT_LABELS, fallbackWeapons, temporaryEffect, type EquipSlot, type EquipmentSlot, type Loadout } from "@/lib/equipment";
import { formatItemCount } from "@/lib/inventory";

const crewTiles: EquipSlot[] = [...CREW_SLOTS.slice(0, 2), "temporary", ...CREW_SLOTS.slice(2)];
const slotIcons: Record<EquipSlot, LucideIcon> = {
  firearm: Target, melee: Swords, temporary: Bomb, head: HardHat, body: Shirt, legs: Shield, feet: Footprints, cannons: Crosshair, hull: Ship, sails: Sailboat,
};
const fallback: Partial<Record<EquipSlot, { name: string; damage: number; precision: number }>> = fallbackWeapons;
const slotItem = (loadout: Loadout, slot: EquipSlot) => slot === "temporary" ? loadout.temporary : loadout[slot as EquipmentSlot];

// Stat chips and a short note for the selected slot; together they fit the focus box's fixed two-row grid.
function slotDetails(loadout: Loadout, slot: EquipSlot): { chips: ReactNode; note: string } {
  if (slot === "temporary") {
    const item = loadout.temporary;
    if (!item) return { chips: null, note: "Nothing equipped. Equip a Grenado or Smoke Pot." };
    return { chips: <><span title="Quantity" aria-label={"Quantity " + formatItemCount(item.quantity ?? 0)}><Boxes aria-hidden="true" />x{formatItemCount(item.quantity ?? 0)}</span>
      {item.damage !== undefined && <ItemStatChips stats={{ damage: item.damage, precision: item.precision }} />}</>,
      note: item.damage === undefined ? temporaryEffect(item) : "" };
  }
  const item = loadout[slot as EquipmentSlot], base = fallback[slot];
  if (item) return { chips: <ItemStatChips stats={item} />, note: "" };
  if (base) return { chips: <ItemStatChips stats={{ damage: base.damage, precision: base.precision }} />, note: "No equipment." };
  return { chips: null, note: "Nothing equipped. Equip one from your items." };
}

export function LoadoutPanel({ loadout, shipHealthMax, selected, onSelect, disabled, pendingSlot, onUnequip, feedback }: {
  loadout: Loadout; shipHealthMax: number; selected: EquipSlot; onSelect: (slot: EquipSlot) => void;
  disabled: boolean; pendingSlot: EquipSlot | null; onUnequip: (slot: EquipSlot) => void; feedback?: { message?: string; error?: boolean };
}) {
  const item = slotItem(loadout, selected), Icon = slotIcons[selected], details = slotDetails(loadout, selected);
  const name = item?.name ?? fallback[selected]?.name ?? "Empty";
  const tile = (slot: EquipSlot) => {
    const equipped = slotItem(loadout, slot), SlotIcon = slotIcons[slot];
    return <button key={slot} type="button" className="o-loadout-tile" data-slot={slot} data-equipped={!!equipped} aria-pressed={selected === slot}
      aria-label={SLOT_LABELS[slot] + ": " + (equipped?.name ?? fallback[slot]?.name ?? "Empty")} title={SLOT_LABELS[slot]} onClick={() => onSelect(slot)}>
      {equipped ? <ItemImage key={equipped.image_path} item={{ name: equipped.name, image_path: equipped.image_path ?? "" }} variant="tile" />
        : <><SlotIcon aria-hidden="true" /><small>{SLOT_LABELS[slot]}</small></>}
    </button>;
  };
  return <section className="o-panel o-loadout" aria-labelledby="loadout-heading">
    <header className="o-panel-title"><h2 id="loadout-heading"><Shield aria-hidden="true" />Equipment</h2><small>Max Ship Health {formatItemCount(shipHealthMax)}</small></header>
    <div className="o-loadout-body">
      <div className="o-loadout-focus" data-slot={selected} aria-live="polite">
        <div className="o-loadout-focus-art">{item ? <ItemImage key={item.image_path} item={{ name: item.name, image_path: item.image_path ?? "" }} variant="focus" />
          : <Icon aria-hidden="true" />}</div>
        <div className="o-loadout-focus-copy">
          <div className="o-loadout-focus-head"><span className="o-loadout-slot">{SLOT_LABELS[selected]}</span>
            {item && <button type="button" className="o-item-action" disabled={disabled || pendingSlot !== null} aria-label={"Unequip " + item.name}
              onClick={() => onUnequip(selected)}>{pendingSlot === selected ? "Saving..." : "Unequip"}</button>}</div>
          <strong title={name}>{name}</strong>
          <div className="o-loadout-stats" data-note-only={!details.chips || undefined}>
            {details.chips}{details.note && <small title={details.note}>{details.note}</small>}
          </div>
        </div>
      </div>
      <div className="o-loadout-rows">
        <div className="o-loadout-row" role="group" aria-label="Crew equipment"><span aria-hidden="true">Crew</span>{crewTiles.map(tile)}</div>
        <div className="o-loadout-row" role="group" aria-label="Ship equipment"><span aria-hidden="true">Ship</span>{SHIP_SLOTS.map(tile)}</div>
      </div>
    </div>
    {/* Success shows in the tiles and the live focus box, so only errors add a line. */}
    <div className="o-loadout-feedback" role="status" aria-live="polite">
      {feedback?.error && feedback.message && <p className="o-field-error">{feedback.message}</p>}
    </div>
  </section>;
}
