"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { gameplay } from "@/config/public";
import { adminLabel, changedValues, rowKey, type AdminResource, type AdminRow, type AdminValues } from "@/lib/admin";
import { DialogCloseButton } from "@/components/dialog-close-button";
import { MutationForm } from "@/components/admin/mutation-form";

function EditorDialog({ resource, row, close }: { resource: AdminResource; row: AdminRow; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<AdminValues>(() => Object.fromEntries(resource.editable.map(key => [key, row.values[key]])));
  useEffect(() => { dialog.current?.showModal(); }, []);
  const changes = changedValues(row.values, values);
  const resourceLimits: Record<string, number> = resource.name === "characters" ?
    { energy: gameplay.resources.energyStorageMax, stamina: gameplay.stamina.storageMaximum } : {};
  return <dialog ref={dialog} className="admin-dialog" onCancel={close} onClose={close}>
    <DialogCloseButton onClose={close} label="Close" />
    <div className="admin-header"><h2 className="o-dialog-title">{adminLabel(resource.name)}: {row.values.display_name ?? row.values.item_id ?? "Record"}</h2></div>
    <p>{resource.note}</p>
    {resource.editable.length > 0 && <MutationForm action="update" payload={{ resource: resource.name, key: rowKey(resource, row), version: row.version, changes }}
      label="Review changes" summary={"Update " + resource.name + ". Only the listed changed fields will be saved."} disabled={!Object.keys(changes).length}>
      <div className="admin-fields">{resource.columns.filter(column => resource.editable.includes(column.name)).map(column =>
        <label key={column.name}>{adminLabel(column.name)}
          <input aria-label={column.name} type={/^(integer|bigint|numeric|smallint)/.test(column.type) ? "number" : "text"} step={resourceLimits[column.name] ? 1 : "any"} min={resourceLimits[column.name] ? 0 : undefined} max={resourceLimits[column.name]} value={values[column.name] ?? ""} disabled={values[column.name] === null}
            onChange={event => setValues(previous => ({ ...previous, [column.name]: event.target.value }))} />
          {resourceLimits[column.name] && <small>Whole number, 0-{resourceLimits[column.name]}. Recovery stops at {column.name === "energy" ? gameplay.resources.energyMax : gameplay.stamina.maximum}.</small>}
          {column.nullable && <span className="admin-null"><input type="checkbox" aria-label={column.name + " is NULL"}
            checked={values[column.name] === null} onChange={event => setValues(previous => ({ ...previous, [column.name]: event.target.checked ? null : row.values[column.name] ?? "" }))} /> Clear value</span>}
        </label>)}</div>
    </MutationForm>}
    <details open={!resource.editable.length}><summary>All stored values</summary><dl className="admin-record">{resource.columns.map(column =>
      <div key={column.name}><dt>{column.name} <small>{column.type}</small></dt><dd><pre>{row.values[column.name] ?? "NULL"}</pre></dd></div>)}</dl></details>
    {resource.deletable && <section className="admin-danger"><h3>Delete inventory record</h3><p>This removes the entire stack or equipment instance.</p>
      <MutationForm action="delete" payload={{ resource: resource.name, key: rowKey(resource, row), version: row.version }}
        label="Review deletion" summary="Permanently remove this inventory record. The previous values remain in the audit log." />
    </section>}
  </dialog>;
}

export function RecordEditor({ resource, row, label = "Edit record" }: { resource: AdminResource; row: AdminRow; label?: string }) {
  const [snapshot, setSnapshot] = useState<AdminRow | null>(null);
  const router = useRouter();
  return <><button type="button" onClick={() => setSnapshot(structuredClone(row))}>{label}</button>
    {snapshot && <EditorDialog resource={resource} row={snapshot} close={() => { setSnapshot(null); router.refresh(); }} />}</>;
}

