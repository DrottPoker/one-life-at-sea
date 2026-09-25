"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, useTransition, type ClipboardEvent, type FormEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Bold, Eye, EyeOff, ImagePlus, Italic, Link2, Send, Strikethrough, Underline, X, type LucideIcon } from "lucide-react";
import { useGameRefresh, useNavigationActivity } from "@/components/game-refresh";
import { ForumMarkup } from "@/components/forums/forum-markup";
import { ForumPollBuilder } from "@/components/forums/forum-poll";
import { useForumImageUpload } from "@/components/forums/forum-image-upload";
import { submitForumPost } from "@/app/forum-actions";
import { gameplay } from "@/config/public";
import { forumImageIds, insertForumImage, wrapForumSelection } from "@/lib/forum-markup";
import { forumDraftKey, forumPostUrl, forumThreadUrl, normalizeForumBody, normalizeForumPoll, parsePendingForumPost, validForumBody, validForumPoll, validForumTitle,
  type ForumImageInfo, type ForumImages, type ForumPollInput, type PendingForumPost } from "@/lib/forums";

export type ForumQuoteDraft = { postId: string; number: number; author: string };
type Target = { kind: "thread"; boardId: string } | { kind: "reply"; threadId: string };

const draftEvent = "pending-forum-changed";
function subscribe(listener: () => void) {
  window.addEventListener(draftEvent, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(draftEvent, listener); window.removeEventListener("storage", listener); };
}
function readDraft(key: string) { try { return sessionStorage.getItem(key); } catch { return "unavailable"; } }
function changed() { window.dispatchEvent(new Event(draftEvent)); }

const formats: { open: string; close: string; label: string; Icon: LucideIcon }[] = [
  { open: "[b]", close: "[/b]", label: "Bold", Icon: Bold }, { open: "[i]", close: "[/i]", label: "Italic", Icon: Italic },
  { open: "[u]", close: "[/u]", label: "Underline", Icon: Underline }, { open: "[s]", close: "[/s]", label: "Strikethrough", Icon: Strikethrough },
  { open: "[spoiler]", close: "[/spoiler]", label: "Spoiler", Icon: EyeOff },
];

// Formatting buttons wrap the current selection, so a tag is never left half written.
export function ForumToolbar({ textarea, value, onChange, disabled, preview, onPreview, onImage, imageBusy = false }: {
  textarea: RefObject<HTMLTextAreaElement | null>; value: string; onChange: (value: string) => void; disabled: boolean; preview: boolean; onPreview: () => void;
  onImage?: () => void; imageBusy?: boolean;
}) {
  function apply(open: string, close: string, select?: (start: number, end: number) => [number, number]) {
    const element = textarea.current;
    if (!element || disabled || preview) return;
    const next = wrapForumSelection(value, element.selectionStart, element.selectionEnd, open, close);
    const [start, end] = select ? select(element.selectionStart, element.selectionEnd) : [next.start, next.end];
    onChange(next.text);
    requestAnimationFrame(() => { element.focus(); element.setSelectionRange(start, end); });
  }
  function link() {
    const element = textarea.current;
    if (!element) return;
    const selected = value.slice(element.selectionStart, element.selectionEnd);
    if (/^https?:\/\/\S+$/i.test(selected)) apply("[url]", "[/url]");
    else apply("[url=https://]", "[/url]", start => [start + 5, start + 13]);
  }
  return <div className="o-forum-toolbar" role="toolbar" aria-label="Formatting">
    {formats.map(({ open, close, label, Icon }) => <button key={label} type="button" title={label} aria-label={label} disabled={disabled || preview} onClick={() => apply(open, close)}><Icon aria-hidden="true" /></button>)}
    <button type="button" title="Link" aria-label="Link" disabled={disabled || preview} onClick={link}><Link2 aria-hidden="true" /></button>
    {onImage && <button type="button" title="Add image" aria-label={imageBusy ? "Uploading image" : "Add image"} disabled={disabled || preview || imageBusy} onClick={onImage}>
      <ImagePlus aria-hidden="true" />{imageBusy && "Uploading..."}</button>}
    <button type="button" className="o-forum-preview-toggle" aria-pressed={preview} onClick={onPreview}><Eye aria-hidden="true" />{preview ? "Write" : "Preview"}</button>
  </div>;
}

export function ForumTextArea({ id, textarea, value, onChange, readOnly, preview, rows = 8, describedBy, images, onPasteImage, placeholder = "Write your post...", required = true }: {
  id: string; textarea: RefObject<HTMLTextAreaElement | null>; value: string; onChange: (value: string) => void; readOnly: boolean; preview: boolean; rows?: number;
  describedBy: string; images?: ForumImages; onPasteImage?: (file: File) => void; placeholder?: string; required?: boolean;
}) {
  // A pasted screenshot uploads like a chosen file.
  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const file = onPasteImage && !readOnly ? Array.from(event.clipboardData.files).find(item => item.type.startsWith("image/")) : undefined;
    if (!file) return;
    event.preventDefault();
    onPasteImage!(file);
  }
  return preview ? <div className="o-forum-preview" id={id} aria-describedby={describedBy}>{value.trim() ? <ForumMarkup source={value} images={images ?? null} /> : <p className="o-copy">Nothing to preview yet.</p>}</div>
    : <textarea id={id} ref={textarea} rows={rows} maxLength={gameplay.forum.postMaxLength * 2} value={value} readOnly={readOnly} required={required}
      aria-describedby={describedBy} onChange={event => onChange(event.target.value)} onPaste={paste} placeholder={placeholder} />;
}

// Images uploaded while writing are added to the preview list and inserted at the cursor.
export function useForumImageInsert(textarea: RefObject<HTMLTextAreaElement | null>, value: string, onChange: (value: string) => void, initial: ForumImages | null = null) {
  const [images, setImages] = useState<ForumImages>(initial ?? {});
  // The upload finishes later; it inserts into the text as it is then, not as it was.
  const current = useRef(value);
  useEffect(() => { current.current = value; });
  const upload = useForumImageUpload((imageId: string, info: ForumImageInfo) => {
    setImages(previous => ({ ...previous, [imageId]: info }));
    const element = textarea.current, text = current.current;
    const next = insertForumImage(text, element ? element.selectionEnd : text.length, imageId);
    onChange(next.text);
    requestAnimationFrame(() => { if (element) { element.focus(); element.setSelectionRange(next.position, next.position); } });
  });
  const count = forumImageIds(value).length;
  const tooMany = count > gameplay.forum.imagesPerPost;
  return { images, upload, count, tooMany };
}

export function ForumEditor({ characterId, target, quote = null, onClearQuote, textarea: sharedTextarea, canUploadImages = false }: {
  characterId: string; target: Target; quote?: ForumQuoteDraft | null; onClearQuote?: () => void; textarea?: RefObject<HTMLTextAreaElement | null>; canUploadImages?: boolean;
}) {
  const [title, setTitle] = useState(""), [body, setBody] = useState(""), [preview, setPreview] = useState(false), [poll, setPoll] = useState<ForumPollInput | null>(null);
  const [error, setError] = useState<string | null>(null), [sending, startSending] = useTransition();
  const inFlight = useRef(false), ownTextarea = useRef<HTMLTextAreaElement>(null), id = useId(), router = useRouter(), refresh = useGameRefresh();
  const textarea = sharedTextarea ?? ownTextarea;
  const key = forumDraftKey(characterId, target);
  const raw = useSyncExternalStore(subscribe, () => readDraft(key), () => null);
  let saved: PendingForumPost | null = null, unreadable = false;
  try { saved = parsePendingForumPost(raw); } catch { unreadable = true; }
  const { images, upload, count, tooMany } = useForumImageInsert(textarea, body, setBody);
  useNavigationActivity(sending);
  const locked = sending || !!saved || unreadable;
  const shownTitle = saved?.kind === "thread" ? saved.title : title, shownBody = saved?.body ?? body;
  const shownPoll = saved?.kind === "thread" ? saved.poll : poll;
  const quoted = saved ? saved.kind === "reply" && saved.quotedPostId !== null : !!quote;
  const valid = validForumBody(normalizeForumBody(shownBody)) && (target.kind === "reply" || validForumTitle(shownTitle.trim())) && !tooMany &&
    (shownPoll === null || validForumPoll(normalizeForumPoll(shownPoll)));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || unreadable || upload.uploading) return;
    const attempt: PendingForumPost = saved ?? (target.kind === "thread"
      ? { id: crypto.randomUUID(), kind: "thread", boardId: target.boardId, title: title.trim(), body: normalizeForumBody(body), poll: poll && normalizeForumPoll(poll) }
      : { id: crypto.randomUUID(), kind: "reply", threadId: target.threadId, body: normalizeForumBody(body), quotedPostId: quote?.postId ?? null });
    if (!validForumBody(attempt.body) || (attempt.kind === "thread" && (!validForumTitle(attempt.title) || (attempt.poll !== null && !validForumPoll(attempt.poll))))) {
      setError(attempt.kind === "thread" && attempt.poll !== null && !validForumPoll(attempt.poll) ? "Give the poll a question and at least two different options."
        : "Enter a title and a post within the character limits.");
      return;
    }
    inFlight.current = true;
    startSending(async () => {
      const release = refresh.hold();
      try {
        sessionStorage.setItem(key, JSON.stringify(attempt)); changed(); setError(null);
        const result = await submitForumPost(characterId, attempt);
        if (!result.retry) { sessionStorage.removeItem(key); changed(); }
        if (result.error) {
          setError(result.error);
          if (!result.retry) { setBody(attempt.body); if (attempt.kind === "thread") { setTitle(attempt.title); setPoll(attempt.poll); } }
        } else if (result.receipt) {
          setBody(""); setTitle(""); setPoll(null); setPreview(false); onClearQuote?.();
          router.push(attempt.kind === "thread" ? forumThreadUrl(result.receipt.thread_id) : forumPostUrl(result.receipt.thread_id, result.receipt.post_number));
        }
      } catch { setError("Posting could not be confirmed. Retry to check the same post."); }
      finally { inFlight.current = false; release(); }
    });
  }
  return <form className="o-forum-editor" aria-label={target.kind === "thread" ? "New thread" : "Reply"} aria-busy={sending} onSubmit={submit}>
    {target.kind === "thread" && <div className="o-forum-field"><label htmlFor={id + "-title"}>Title</label>
      <input id={id + "-title"} value={shownTitle} readOnly={locked} maxLength={gameplay.forum.threadTitleMaxLength * 2} required onChange={event => setTitle(event.target.value)} placeholder="Thread title" />
    </div>}
    {quoted && <div className="o-forum-quote-chip"><span>{quote && !saved ? `Quoting #${quote.number} by ${quote.author}` : "Quoting an earlier post"}</span>
      {!locked && onClearQuote && <button type="button" onClick={onClearQuote} aria-label="Remove quote" title="Remove quote"><X aria-hidden="true" /></button>}
    </div>}
    <div className="o-forum-field"><label htmlFor={id + "-body"}>{target.kind === "thread" ? "Opening post" : "Your reply"}</label>
      <ForumToolbar textarea={textarea} value={shownBody} onChange={setBody} disabled={locked} preview={preview} onPreview={() => setPreview(!preview)}
        onImage={canUploadImages ? upload.open : undefined} imageBusy={upload.uploading} />
      <ForumTextArea id={id + "-body"} textarea={textarea} value={shownBody} onChange={setBody} readOnly={locked} preview={preview} describedBy={id + "-limit"}
        images={images} onPasteImage={canUploadImages ? file => void upload.upload(file) : undefined} />
      {upload.picker}
    </div>
    {target.kind === "thread" && <ForumPollBuilder value={shownPoll} onChange={setPoll} disabled={locked} />}
    <footer className="o-forum-editor-footer">
      <small id={id + "-limit"}>{Array.from(shownBody).length} / {gameplay.forum.postMaxLength} characters{count > 0 && ` · ${count} / ${gameplay.forum.imagesPerPost} images`}
        {" · "}[b]bold[/b] [i]italic[/i] [url=https://…]link[/url] [spoiler]…[/spoiler]</small>
      <button className="o-primary" type="submit" disabled={sending || unreadable || !valid || upload.uploading}><Send size={16} aria-hidden="true" />
        {sending ? "Posting..." : saved ? "Retry post" : target.kind === "thread" ? "Create thread" : "Post reply"}</button>
    </footer>
    {tooMany && <p role="alert">A post can show at most {gameplay.forum.imagesPerPost} images.</p>}
    {upload.error && <p role="alert">{upload.error}</p>}
    {saved && !sending && <p className="o-copy">This post has not been confirmed. Retry to check whether it was posted.</p>}
    {unreadable && <p role="alert">The saved post is unavailable. Allow browser storage and reload this page.</p>}
    {error && <p role="alert">{error}</p>}
  </form>;
}
