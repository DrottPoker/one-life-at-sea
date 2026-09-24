import { Anchor, Users } from "lucide-react";
import { CREW_SLOTS, SHIP_SLOTS, SLOT_LABELS, fallbackWeapons, itemStatSummary, temporaryEffect, type EquipSlot, type EquipmentSlot, type Loadout } from "@/lib/equipment";
import { formatItemCount } from "@/lib/inventory";

const fallbackNames: Partial<Record<EquipmentSlot, string>> = { melee: fallbackWeapons.melee.name, cannons: fallbackWeapons.cannons.name };

export function LoadoutPanel({ loadout, shipHealthMax, disabled, pendingSlot, onUnequip }: {
  loadout: Loadout; shipHealthMax: number; disabled: boolean; pendingSlot: EquipSlot | null; onUnequip: (slot: EquipSlot) => void;
}) {
  return <section className="o-loadout" aria-labelledby="loadout-heading">
    <h2 id="loadout-heading" className="o-loadout-heading">Equipment</h2>
    {([["Crew", [...CREW_SLOTS, "temporary"], Users], ["Ship", SHIP_SLOTS, Anchor]] as const).map(([group, slots, Icon]) =>
      <div key={group} className="o-loadout-group">
        <header><h3><Icon aria-hidden="true" />{group}</h3>{group === "Ship" && <small>Max Ship Health {formatItemCount(shipHealthMax)}</small>}</header>
        <dl>{(slots as readonly EquipSlot[]).map(slot => {
          const temporary = slot === "temporary" ? loadout.temporary : undefined, item = slot === "temporary" ? temporary : loadout[slot];
          return <div key={slot} data-slot={slot} data-equipped={!!item}>
            <dt>{SLOT_LABELS[slot]}</dt>
            <dd>
              <span className="o-loadout-name">{item?.name ?? fallbackNames[slot as EquipmentSlot] ?? "Empty"}</span>
              {temporary ? <small>{"x" + formatItemCount(temporary.quantity ?? 0) + " · " + temporaryEffect(temporary)}</small>
                : item && slot !== "temporary" && <small>{itemStatSummary(loadout[slot as EquipmentSlot]!)}</small>}
            </dd>
            {item && <button type="button" className="o-item-action" disabled={disabled || pendingSlot !== null}
              aria-label={"Unequip " + item.name} onClick={() => onUnequip(slot)}>{pendingSlot === slot ? "Saving..." : "Unequip"}</button>}
          </div>;
        })}</dl>
        {group === "Ship" && <p className="o-loadout-note">Chain Shot and Grape Shot are chosen as cannon ammunition in battle and used from your Munitions.</p>}
      </div>)}
  </section>;
}
