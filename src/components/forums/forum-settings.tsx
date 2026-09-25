"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useNavigationActivity } from "@/components/game-refresh";
import { ForumTextArea, ForumToolbar } from "@/components/forums/forum-editor";
import { saveForumSettings } from "@/app/forum-actions";
import { gameplay } from "@/config/public";
import { normalizeForumBody, validForumSignature, type ForumSettings } from "@/lib/forums";

export function ForumSettingsForm({ characterId, settings }: { characterId: string; settings: ForumSettings }) {
  const [signature, setSignature] = useState(settings.signature), [show, setShow] = useState(settings.show_signatures), [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState<string | null>(null), [error, setError] = useState<string | null>(null), [pending, start] = useTransition();
  const textarea = useRef<HTMLTextAreaElement>(null), id = useId();
  useNavigationActivity(pending);
  const text = normalizeForumBody(signature), lines = text ? text.split("\n").length : 0;
  // A captain who may not sign can still clear the signature.
  const valid = validForumSignature(text) && (settings.can_sign || text === "" || text === settings.signature);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !valid) return;
    start(async () => {
      try {
        const result = await saveForumSettings(characterId, text, show);
        if (result.settings) { setSignature(result.settings.signature); setShow(result.settings.show_signatures); setError(null); setNotice("Settings saved."); }
        else { setNotice(null); setError(result.error ?? "Your settings could not be saved."); }
      } catch { setNotice(null); setError("Your settings could not be saved. Please try again."); }
    });
  }
  return <form className="o-forum-editor o-forum-settings" aria-label="Forum settings" aria-busy={pending} onSubmit={submit}>
    <div className="o-forum-field"><label htmlFor={id + "-signature"}>Signature</label>
      <ForumToolbar textarea={textarea} value={signature} onChange={setSignature} disabled={pending} preview={preview} onPreview={() => setPreview(!preview)} />
      <ForumTextArea id={id + "-signature"} textarea={textarea} value={signature} onChange={setSignature} readOnly={pending} preview={preview} rows={3} describedBy={id + "-limit"}
        placeholder="A short line under your posts, for example your ship or crew." required={false} />
      <small id={id + "-limit"}>{Array.from(text).length} / {gameplay.forum.signatureMaxLength} characters · {lines} / {gameplay.forum.signatureMaxLines} lines ·
        Shown once per page under your first post. Images are not shown in signatures.</small>
    </div>
    {!settings.can_sign && <p className="o-copy">{settings.ban ? "You cannot write a new signature while you are banned from posting." :
      `New captains can add a signature after ${gameplay.forum.newCharacterHours} hours.`} You can still remove your current one.</p>}
    <label className="o-forum-check"><input type="checkbox" checked={show} onChange={event => setShow(event.target.checked)} disabled={pending} />Show other captains&apos; signatures</label>
    <footer className="o-forum-editor-footer"><span />
      <button className="o-primary" type="submit" disabled={pending || !valid}>{pending ? "Saving..." : "Save settings"}</button></footer>
    {notice && <p role="status" className="o-forum-notice">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </form>;
}
