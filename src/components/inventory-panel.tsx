"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChartLine, Boxes, CircleDot, ChevronDown, ChevronLeft, ChevronRight, Compass, Cross, Crosshair, FlaskConical, Package, Search, Swords, Trash2, X, Zap } from "lucide-react";
import { ItemCirculationChart } from "@/components/item-circulation-chart";
import { formatCirculation } from "@/lib/circulation";
import { trashInventoryItem } from "@/app/inventory-actions";
import { useGameState } from "@/components/game-state";
import { formatItemCount, formatItemStat, inventoryCategories, inventoryCategoryName, inventoryEntryKey,
  inventoryHref, parseItemQuantity, type InventoryEntry, type InventoryFilters, type InventoryPage, type TrashResult } from "@/lib/inventory";

const categoryIcons: Record<string, typeof Package> = {
  swords: Swords, cannon: CircleDot, cross: Cross, flask: FlaskConical, boxes: Boxes, compass: Compass,
};

function ItemImage({ item, large = false }: { item: InventoryEntry; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <span className={large ? "o-item-art" : "o-item-thumb"}>
    {failed ? <Package aria-label="Item image unavailable" role="img" /> :
      <Image src={item.image_path} alt={large ? item.name : ""} width={large ? 280 : 64} height={large ? 190 : 48}
        sizes={large ? "280px" : "64px"} onError={() => setFailed(true)} />}
  </span>;
}

function ItemDetails({ item, onClose }: { item: InventoryEntry; onClose: () => void }) {
  const [showCirculation, setShowCirculation] = useState(false);
  const historyId = "circulation-" + inventoryEntryKey(item);
  return <section className="o-item-details" id={"details-" + inventoryEntryKey(item)} aria-label={item.name + " details"}>
    <div className="o-item-description"><p>{item.description}</p>
      <button type="button" className="o-item-icon-button" aria-label={"Close " + item.name + " details"} onClick={onClose}><X aria-hidden="true" /></button>
    </div>
    <p className="o-item-effect">{item.effect_description}</p>
    <div className="o-item-detail-grid">
      <ItemImage key={item.image_path} item={item} large />
      <dl className="o-item-properties">
        <div><dt>Category</dt><dd>{inventoryCategoryName(item.category_id)}</dd></div>
        <div><dt>Quantity</dt><dd>{formatItemCount(item.quantity)}</dd></div>
        {item.stats && <>
          <div><dt>Damage</dt><dd>{formatItemStat(item.stats.damage)}</dd></div>
          <div><dt>Accuracy</dt><dd>{formatItemStat(item.stats.accuracy)}</dd></div>
        </>}
        <div><dt title="Items of this type in the world">Circ.</dt><dd className="o-circulation-value">
          <span>{formatCirculation(item.circulation)}</span>
          <button type="button" className="o-item-icon-button" title="Circulation history"
            aria-label={(showCirculation ? "Hide" : "Show") + " circulation history for " + item.name}
            aria-expanded={showCirculation} aria-controls={showCirculation ? historyId : undefined}
            onClick={() => setShowCirculation(value => !value)}><ChartLine aria-hidden="true" /></button>
        </dd></div>
      </dl>
    </div>
    {showCirculation && <ItemCirculationChart id={historyId} itemId={item.item_id} name={item.name} circulation={item.circulation} />}
  </section>;
}

export function InventoryPanel({ inventory, filters }: { inventory: InventoryPage; filters: InventoryFilters }) {
  const router = useRouter();
  const state = useGameState();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<InventoryEntry | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<TrashResult>({});
  const [pending, startTrash] = useTransition();
  const [filterPending, startFilter] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<{ id: string; entry: InventoryEntry; amount: string } | null>(null);
  const blocked = !!state.hospital_until || !!state.active_attack;
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
    if (!selected || pending) return;
    const attempt = request.current ?? { id: crypto.randomUUID(), entry: selected, amount };
    request.current = attempt;
    const form = new FormData();
    form.set("entry_id", attempt.entry.id);
    form.set("entry_type", attempt.entry.entry_type);
    form.set("quantity", attempt.amount);
    form.set("request_id", attempt.id);
    startTrash(async () => {
      let response: TrashResult;
      try { response = await trashInventoryItem(form); }
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
    <p className="o-inventory-note">Equipping and using items will be available later.</p>
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
              <span className="o-item-name">{item.name}{item.entry_type === "stack" && <strong> x{formatItemCount(item.quantity)}</strong>}</span>
              <span className="o-item-stats">
                {item.stats && <>
                  <span title="Damage" aria-label={"Damage " + formatItemStat(item.stats.damage)}><Zap aria-hidden="true" />{formatItemStat(item.stats.damage)}</span>
                  <span title="Accuracy" aria-label={"Accuracy " + formatItemStat(item.stats.accuracy)}><Crosshair aria-hidden="true" />{formatItemStat(item.stats.accuracy)}</span>
                </>}
                <ChevronDown className="o-item-chevron" aria-hidden="true" />
              </span>
            </button>
            <div className="o-item-actions">
              {item.kind !== "passive" && <button className="o-item-action" type="button" disabled
                title={item.kind === "equipment" ? "Equipping will be available later" : "Item use will be available later"}>
                {item.kind === "equipment" ? "Equip" : "Use"}</button>}
              <button className="o-item-icon-button o-item-trash" type="button" title="Trash"
                aria-label={"Trash " + item.name} disabled={blocked || pending || !!result.retry} onClick={() => chooseTrash(item)}>
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
      {!dialogOpen && result.retry && <button type="button" className="o-text-button" onClick={() => setDialogOpen(true)}>Retry last trash action</button>}
    </div>
    <dialog ref={dialog} className="o-item-dialog" aria-labelledby="trash-title" aria-describedby="trash-warning"
      onCancel={event => { if (pending) event.preventDefault(); else setDialogOpen(false); }}
      onClose={() => setDialogOpen(false)}>
      {selected && <form onSubmit={destroy} aria-busy={pending}>
        <h2 id="trash-title">Destroy {selected.name}?</h2>
        <p id="trash-warning">These items will be permanently destroyed. You will not receive Gold Coins.</p>
        {selected.stats && <p className="o-copy">Damage {formatItemStat(selected.stats.damage)} · Accuracy {formatItemStat(selected.stats.accuracy)}</p>}
        {selected.entry_type === "stack" ? <div className="o-field">
          <label className="o-field-label" htmlFor="trash-quantity">Quantity to destroy</label>
          <input id="trash-quantity" type="text" inputMode="numeric" pattern="[0-9]+" maxLength={16} required
            value={amount} readOnly={pending || !!result.retry} onChange={event => setAmount(event.target.value)} aria-describedby="trash-available" />
          <span className="o-form-hint" id="trash-available" aria-live="polite">{formatItemCount(available)} currently available.</span>
        </div> : <p>Quantity: 1</p>}
        <div className="o-item-dialog-actions">
          <button type="button" className="o-item-action" data-cancel disabled={pending} onClick={() => setDialogOpen(false)}>{result.retry ? "Close" : "Cancel"}</button>
          <button className="o-primary o-item-destroy" type="submit" disabled={pending || (!result.retry && (blocked || quantity === null || quantity > available))}>
            {pending ? "Confirming..." : result.retry ? "Retry trash action" : "Destroy " + (quantity === null ? "items" : formatItemCount(quantity) + (quantity === 1 ? " item" : " items"))}
          </button>
        </div>
        {dialogOpen && <div role="status" aria-live="polite">
          {result.message && <p className="o-field-error">{result.message}</p>}
          {!available && !result.retry && <p className="o-field-error">This item is no longer available.</p>}
          {blocked && !result.retry && <p className="o-field-error">{state.hospital_until ? "You cannot destroy items while in hospital." : "Finish your current fight first."}</p>}
        </div>}
      </form>}
    </dialog>
  </div>;
}
