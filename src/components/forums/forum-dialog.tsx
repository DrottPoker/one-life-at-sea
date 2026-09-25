"use client";

import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { DialogCloseButton } from "@/components/dialog-close-button";
import { useNavigationActivity } from "@/components/game-refresh";
import { moderateForum } from "@/app/forum-actions";
import { gameplay } from "@/config/public";
import { forumBanLengths, validModerationReason, type ForumModerationAction } from "@/lib/forums";

export function ForumDialog({ open, title, busy = false, onClose, children }: { open: boolean; title: string; busy?: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null), id = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);
  return <dialog ref={dialog} className="o-item-dialog o-forum-dialog" aria-labelledby={id} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <DialogCloseButton onClose={onClose} disabled={busy} />
    <h2 id={id} className="o-dialog-title">{title}</h2>
    {open && children}
  </dialog>;
}

export type ForumModerationPrompt = {
  action: ForumModerationAction; payload: Record<string, string>; title: string; description: string; confirm: string; boardId?: string;
  banLength?: boolean; reasonLabel?: string;
};

// A retried request keeps its ID and reason so the database can confirm it exactly once.
export function ForumModerationDialog({ characterId, prompt, onClose }: { characterId: string; prompt: ForumModerationPrompt | null; onClose: (message?: string) => void }) {
  const [reason, setReason] = useState(""), [board, setBoard] = useState(""), [hours, setHours] = useState("24"), [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition(), [retrying, setRetrying] = useState(false), request = useRef<string | null>(null), id = useId();
  useNavigationActivity(pending);
  const boards = gameplay.forum.boards.filter(item => item.id !== prompt?.boardId && item.posting !== "closed");
  const moving = prompt?.action === "move_thread";
  function close(message?: string) {
    if (pending) return;
    setReason(""); setBoard(""); setHours("24"); setError(null); setRetrying(false); request.current = null;
    onClose(message);
  }
  function confirm() {
    if (!prompt || pending || !validModerationReason(reason) || (moving && !board)) return;
    const requestId = request.current ??= crypto.randomUUID();
    start(async () => {
      try {
        const payload = moving ? { ...prompt.payload, board_id: board } : prompt.banLength && hours ? { ...prompt.payload, hours } : prompt.payload;
        const result = await moderateForum(characterId, { id: requestId, action: prompt.action, payload, reason });
        if (result.receipt) { request.current = null; setRetrying(false); close(result.receipt.message); return; }
        if (!result.retry) request.current = null;
        setRetrying(!!result.retry); setError(result.error ?? "The action failed.");
      } catch { setRetrying(true); setError("The action could not be confirmed. Retry to check the same request."); }
    });
  }
  return <ForumDialog open={!!prompt} title={prompt?.title ?? ""} busy={pending} onClose={() => close()}>
    <p>{prompt?.description}</p>
    {moving && <div className="o-forum-field"><label htmlFor={id + "-board"}>Move to</label>
      <select id={id + "-board"} value={board} disabled={pending || retrying} onChange={event => setBoard(event.target.value)}>
        <option value="">Choose a board</option>{boards.map(item => <option key={item.id} value={item.id}>{item.section}: {item.name}</option>)}
      </select></div>}
    {prompt?.banLength && <div className="o-forum-field"><label htmlFor={id + "-hours"}>Ban length</label>
      <select id={id + "-hours"} value={hours} disabled={pending || retrying} onChange={event => setHours(event.target.value)}>
        {forumBanLengths.map(length => <option key={length.label} value={length.hours ?? ""}>{length.label}</option>)}
      </select></div>}
    <div className="o-forum-field"><label htmlFor={id + "-reason"}>{prompt?.reasonLabel ?? "Reason (visible to moderators)"}</label>
      <textarea id={id + "-reason"} rows={3} maxLength={500} value={reason} readOnly={pending || retrying} onChange={event => setReason(event.target.value)} />
    </div>
    <div className="o-item-dialog-actions">
      <button type="button" className="o-text-button" disabled={pending} onClick={() => close()}>Cancel</button>
      <button type="button" className="o-primary" disabled={pending || !validModerationReason(reason) || (moving && !board)} onClick={confirm}>{pending ? "Working..." : retrying ? "Retry" : prompt?.confirm}</button>
    </div>
    {error && <p role="alert" className="o-field-error">{error}</p>}
  </ForumDialog>;
}
