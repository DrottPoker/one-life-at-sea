"use client";

import { GameLink as Link } from "@/components/game-navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Boxes, CircleDot, ChevronDown, ChevronLeft, ChevronRight, Compass, Cross, Crosshair, FlaskConical, Gauge, HeartPulse, Package, Sailboat, Search, Shield, Swords, Target, Trash2, Wind, Zap } from "lucide-react";
import { DialogCloseButton } from "@/components/dialog-close-button";
import { ItemImage } from "@/components/inventory/item-image";
import { ItemDetails } from "@/components/inventory/item-details";
import { LoadoutPanel } from "@/components/inventory/loadout-panel";
import { equipItem, unequipItem } from "@/app/inventory-actions";
import { useEconomyRequests } from "@/components/economy-requests";
import { useGameState } from "@/components/game-state";
import { formatItemCount, inventoryCategories, inventoryCategoryName, inventoryEntryKey,
  inventoryHref, parseItemQuantity, type InventoryEntry, type InventoryFilters, type InventoryPage, type TrashResult } from "@/lib/inventory";
import { formatQuality, itemStatRows, itemStatSummary, SLOT_LABELS, type EquipmentSlot, type EquipResult } from "@/lib/equipment";
import { MAX_HEALTH } from "@/lib/game";

const categoryIcons: Record<string, typeof Package> = {
  swords: Swords, shield: Shield, cannon: CircleDot, sail: Sailboat, cross: Cross, flask: FlaskConical, boxes: Boxes, compass: Compass,
};
const statIcons = { damage: Zap, precision: Crosshair, shots: Target, armor: Shield, health: HeartPulse, speed: Wind };

export function InventoryPanel({ inventory, filters, characterId }: { inventory: InventoryPage; filters: InventoryFilters; characterId: string }) {
  const router = useRouter();
  const state = useGameState(), journal = useEconomyRequests();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<InventoryEntry | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<TrashResult>({});
  const [pending, startTrash] = useTransition();
  const [filterPending, startFilter] = useTransition();
  const [equipPending, startEquip] = useTransition();
  const [equipResult, setEquipResult] = useState<EquipResult>({});
  const [pendingEquip, setPendingEquip] = useState<string | null>(null);
  const equipRequest = useRef<{ id: string; target: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<{ id: string; entry: InventoryEntry; amount: string } | null>(null);
  const equipBlocked = !!state.hospital_until || !!state.active_combat_id || state.sea.state !== "in_harbor";
  const blocked = (journal.unconfirmed && !result.retry && !pending) || equipBlocked;
  const quantity = parseItemQuantity(amount);
  const available = selected ? inventory.items.find(item => inventoryEntryKey(item) === inventoryEntryKey(selected))?.quantity ?? 0 : 0;
  const pages = Math.max(1, Math.ceil(inventory.total / inventory.page_size));

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (dialogOpen && !element.open) {
      element.showModal();
      element.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
    } else if (!dialogOpen && element.open) {
      element.close();
      if (!selected && result.receipt?.remaining === 0) document.querySelector<HTMLAnchorElement>(".o-inventory-categories [aria-current=page]")?.focus();
    }
  }, [dialogOpen, selected, result.receipt?.remaining]);

  function chooseTrash(item: InventoryEntry) {
    if (!result.retry) {
      setSelected(item);
      setAmount("1");
      setResult({});
    }
    setDialogOpen(true);
  }

  function destroy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || pending || blocked) return;
    const attempt = request.current ?? { id: crypto.randomUUID(), entry: selected, amount };
    request.current = attempt;
    const form = new FormData();
    form.set("entry_id", attempt.entry.id);
    form.set("entry_type", attempt.entry.entry_type);
    form.set("quantity", attempt.amount);
    form.set("request_id", attempt.id);
    startTrash(async () => {
      let response: TrashResult;
      try { response = await journal.inventory(form); }
      catch { response = { error: true, retry: true, message: "The result could not be confirmed. Retry this action to check it safely." }; }
      setResult(response);
      if (!response.retry) request.current = null;
      if (!response.error) {
        setDialogOpen(false);
        setSelected(null);
        if (response.receipt?.remaining === 0) setExpanded(current => current === inventoryEntryKey(attempt.entry) ? null : current);
      }
    });
  }

  // A retried equipment change reuses its request ID so the server returns the same receipt.
  function changeEquipment(target: string, run: (requestId: string) => Promise<EquipResult>) {
    if (equipPending || equipBlocked) return;
    if (equipRequest.current?.target !== target) equipRequest.current = { id: crypto.randomUUID(), target };
    const attempt = equipRequest.current;
    setPendingEquip(target);
    setEquipResult({});
    startEquip(async () => {
      let response: EquipResult;
      try { response = await run(attempt.id); }
      catch { response = { error: true, retry: true, message: "The result could not be confirmed. Retry this action to check it safely." }; }
      setEquipResult(response);
      if (!response.retry) equipRequest.current = null;
      setPendingEquip(null);
    });
  }
  const equip = (item: InventoryEntry) => changeEquipment("equip:" + item.id, id => equipItem(item.id, id, characterId));
  const unequip = (slot: EquipmentSlot) => changeEquipment("unequip:" + slot, id => unequipItem(slot, id, characterId));

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("q") ?? "").trim().slice(0, 100);
    startFilter(() => router.push(inventoryHref(filters.category, query)));
  }

  return <div className="o-inventory">
    <div className="o-inventory-toolbar">
      <nav className="o-inventory-categories" aria-label="Item categories">
        <Link href={inventoryHref(null, filters.query)} title="All items" aria-label="All items"
          aria-current={filters.category === null ? "page" : undefined}><Package aria-hidden="true" /></Link>
        {inventoryCategories.map(category => {
          const Icon = categoryIcons[category.icon] ?? Package;
          return <Link key={category.id} href={inventoryHref(category.id, filters.query)}
            title={category.name} aria-label={category.name} aria-current={filters.category === category.id ? "page" : undefined}>
            <Icon aria-hidden="true" /></Link>;
        })}
      </nav>
      <form className="o-inventory-search" role="search" aria-label="Search inventory" onSubmit={search}>
        <input key={filters.query} name="q" type="search" aria-label="Search items" placeholder="Search items..."
          defaultValue={filters.query} maxLength={100} autoComplete="off" />
        <button type="submit" aria-label="Search" disabled={filterPending}><Search aria-hidden="true" /></button>
      </form>
    </div>
    <div className="o-inventory-caption">
      <span>{inventoryCategoryName(filters.category)} <span className="o-inventory-count">({formatItemCount(inventory.total)})</span></span>
      {filters.query && <Link href={inventoryHref(filters.category)}>Clear search</Link>}
      {filterPending && <span role="status">Searching...</span>}
    </div>
    <LoadoutPanel loadout={inventory.loadout ?? {}} shipHealthMax={inventory.ship_health_max ?? MAX_HEALTH} disabled={equipBlocked || equipPending}
      pendingSlot={pendingEquip?.startsWith("unequip:") ? pendingEquip.slice(8) as EquipmentSlot : null} onUnequip={unequip} />
    <div className="o-inventory-feedback" role="status" aria-live="polite">
      {equipResult.message && <p className={equipResult.error ? "o-field-error" : ""}>{equipResult.message}</p>}
    </div>
    <p className="o-inventory-note">Using consumables will be available later.</p>
    {state.active_combat_id && <p className="o-inventory-notice">Your inventory is read-only during combat. You can inspect items, but cannot change them.</p>}
    {state.sea.state !== "in_harbor" && <p className="o-inventory-notice">Your inventory is read-only at sea. Return to The Harbor to use it.</p>}
    {state.hospital_until && <p className="o-inventory-notice">You can view your inventory while in hospital. Items cannot be destroyed during your stay.</p>}
    <ul className="o-item-list" aria-label="Your items" aria-busy={filterPending}>
      {inventory.items.map(item => {
        const key = inventoryEntryKey(item);
        const open = expanded === key;
        return <li key={key} className="o-item" data-item-id={item.id}>
          <div className="o-item-row" data-expanded={open}>
            <button type="button" className="o-item-disclosure" aria-label={item.name + " details"}
              id={"item-" + key} aria-expanded={open} aria-controls={open ? "details-" + key : undefined} onClick={() => setExpanded(open ? null : key)}>
              <ItemImage key={item.image_path} item={item} />
              <span className="o-item-name">{item.name}{item.entry_type === "stack" && <strong> x{formatItemCount(item.quantity)}</strong>}
                {item.equipped_slot && <span className="o-item-equipped">Equipped</span>}</span>
              <span className="o-item-stats">
                {item.stats && <>
                  <span title="Quality" aria-label={"Quality " + formatQuality(item.stats.quality)}><Gauge aria-hidden="true" />{formatQuality(item.stats.quality)}</span>
                  {itemStatRows(item.stats).slice(0, 2).map(row => {
                    const Icon = statIcons[row.key];
                    return <span key={row.key} title={row.label} aria-label={row.label + " " + row.text}><Icon aria-hidden="true" />{row.text}</span>;
                  })}
                </>}
                <ChevronDown className="o-item-chevron" aria-hidden="true" />
              </span>
            </button>
            <div className="o-item-actions">
              {item.kind === "equipment" ? item.equipped_slot ?
                <button className="o-item-action" type="button" disabled={equipBlocked || equipPending} aria-label={"Unequip " + item.name}
                  onClick={() => unequip(item.equipped_slot!)}>{pendingEquip === "unequip:" + item.equipped_slot ? "Saving..." : "Unequip"}</button> :
                <button className="o-item-action" type="button" disabled={equipBlocked || equipPending} aria-label={"Equip " + item.name}
                  title={item.slot ? "Equip in the " + SLOT_LABELS[item.slot] + " slot" : undefined}
                  onClick={() => equip(item)}>{pendingEquip === "equip:" + item.id ? "Saving..." : "Equip"}</button> :
                item.kind === "consumable" && <button className="o-item-action" type="button" disabled title="Item use will be available later">Use</button>}
              <button className="o-item-icon-button o-item-trash" type="button" title={item.equipped_slot ? "Unequip before destroying" : "Trash"}
                aria-label={"Trash " + item.name} disabled={blocked || pending || !!result.retry || !!item.equipped_slot} onClick={() => chooseTrash(item)}>
                <Trash2 aria-hidden="true" /></button>
            </div>
          </div>
          {open && <ItemDetails item={item} onClose={() => { setExpanded(null); document.getElementById("item-" + key)?.focus(); }} />}
        </li>;
      })}
    </ul>
    {inventory.total === 0 && <div className="o-inventory-empty">
      <Package aria-hidden="true" />
      <p>{filters.category || filters.query ? "No items match this selection." : "Your inventory is empty."}</p>
      <span>{filters.category || filters.query ? "Try another category or clear your search." : "Items you acquire will appear here."}</span>
    </div>}
    <div className="o-inventory-footer">
      <span>{inventory.total ? formatItemCount(inventory.page * inventory.page_size + 1) + "-" +
        formatItemCount(Math.min((inventory.page + 1) * inventory.page_size, inventory.total)) + " of " + formatItemCount(inventory.total) : "0 items"}</span>
      {pages > 1 && <nav aria-label="Inventory pages">
        {inventory.page > 0 ? <Link href={inventoryHref(filters.category, filters.query, inventory.page - 1)} aria-label="Previous page"><ChevronLeft aria-hidden="true" /></Link> :
          <span aria-disabled="true"><ChevronLeft aria-hidden="true" /></span>}
        <span>Page {inventory.page + 1} of {pages}</span>
        {inventory.page + 1 < pages ? <Link href={inventoryHref(filters.category, filters.query, inventory.page + 1)} aria-label="Next page"><ChevronRight aria-hidden="true" /></Link> :
          <span aria-disabled="true"><ChevronRight aria-hidden="true" /></span>}
      </nav>}
    </div>
    <div className="o-inventory-feedback" role="status" aria-live="polite">
      {!dialogOpen && result.message && <p className={result.error ? "o-field-error" : ""}>{result.message}</p>}
      {!dialogOpen && result.retry && <button type="button" className="o-text-button" disabled={blocked} onClick={() => setDialogOpen(true)}>Retry last trash action</button>}
    </div>
    <dialog ref={dialog} className="o-item-dialog" aria-labelledby="trash-title" aria-describedby="trash-warning"
      onCancel={event => { if (pending) event.preventDefault(); else setDialogOpen(false); }}
      onClose={() => setDialogOpen(false)}>
      {selected && <form onSubmit={destroy} aria-busy={pending}>
        <DialogCloseButton onClose={() => setDialogOpen(false)} disabled={pending} />
        <h2 id="trash-title" className="o-dialog-title">Destroy {selected.name}?</h2>
        <p id="trash-warning">These items will be permanently destroyed. You will not receive Gold Coins.</p>
        {selected.stats && <p className="o-copy">{itemStatSummary(selected.stats)}</p>}
        {selected.entry_type === "stack" ? <div className="o-field">
          <label className="o-field-label" htmlFor="trash-quantity">Quantity to destroy</label>
          <input id="trash-quantity" type="text" inputMode="numeric" pattern="[0-9]+" maxLength={16} required
            value={amount} readOnly={blocked || pending || !!result.retry} onChange={event => setAmount(event.target.value)} aria-describedby="trash-available" />
          <span className="o-form-hint" id="trash-available" aria-live="polite">{formatItemCount(available)} currently available.</span>
        </div> : <p>Quantity: 1</p>}
        <div className="o-item-dialog-actions">
          <button type="button" className="o-item-action" data-cancel disabled={pending} onClick={() => setDialogOpen(false)}>{result.retry ? "Close" : "Cancel"}</button>
          <button className="o-primary o-item-destroy" type="submit" disabled={blocked || pending || (!result.retry && (quantity === null || quantity > available))}>
            {pending ? "Confirming..." : result.retry ? "Retry trash action" : "Destroy " + (quantity === null ? "items" : formatItemCount(quantity) + (quantity === 1 ? " item" : " items"))}
          </button>
        </div>
        {dialogOpen && <div role="status" aria-live="polite">
          {result.message && <p className="o-field-error">{result.message}</p>}
          {!available && !result.retry && <p className="o-field-error">This item is no longer available.</p>}
          {blocked && <p className="o-field-error">{state.hospital_until ? "You cannot destroy items while in hospital." : state.sea.state !== "in_harbor" ? "Return to The Harbor to destroy items." : "Finish your current fight first."}</p>}
        </div>}
      </form>}
    </dialog>
  </div>;
}
