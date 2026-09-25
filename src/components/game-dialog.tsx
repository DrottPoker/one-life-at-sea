"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { DialogCloseButton } from "@/components/dialog-close-button";

// A modal with a title and close button. Escape and the close button are ignored while busy.
export function GameDialog({ open, title, busy = false, onClose, className = "", children }: {
  open: boolean; title: string; busy?: boolean; onClose: () => void; className?: string; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null), id = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);
  return <dialog ref={dialog} className={"o-item-dialog " + className} aria-labelledby={id} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <DialogCloseButton onClose={onClose} disabled={busy} />
    <h2 id={id} className="o-dialog-title">{title}</h2>
    {open && children}
  </dialog>;
}
