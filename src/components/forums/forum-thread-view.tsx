"use client";

import { useEffect, useId, useOptimistic, useRef, useState, useTransition } from "react";
import { Archive, BarChart3, Ban, Bell, BellOff, EyeOff, Flag, History, ImageOff, Lock, LockOpen, MoveRight, Pencil, Pin, PinOff, Quote, RotateCcw, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { GameLink as Link } from "@/components/game-navigation";
import { useNavigationActivity } from "@/components/game-refresh";
import { MessageTime } from "@/components/messages/message-time";
import { Pagination } from "@/components/pagination";
import { ForumMarkup } from "@/components/forums/forum-markup";
import { ForumBanNotice, ForumPersonLink } from "@/components/forums/forum-person";
import { ForumEditor, ForumTextArea, ForumToolbar, useForumImageInsert, type ForumQuoteDraft } from "@/components/forums/forum-editor";
import { ForumPollView } from "@/components/forums/forum-poll";
import { ForumDialog, ForumModerationDialog, type ForumModerationPrompt } from "@/components/forums/forum-dialog";
import { editForumPost, loadForumPostHistory, markForumThreadRead, moderateForum, reportForumPost, setForumReaction, setForumSubscription, withdrawForumPost } from "@/app/forum-actions";
import { gameplay } from "@/config/public";
import { subscribeToForeground } from "@/lib/browser-events";
import { forumPermalink, forumReportReasons, forumThreadUrl, normalizeForumBody, validForumBody, validForumTitle, validModerationReason, validReportNote,
  type ForumPost, type ForumReaction, type ForumReportReason, type ForumRevision, type ForumThread, type ForumThreadPage } from "@/lib/forums";

// Only a mounted, visible thread acknowledges reading, and only up to the posts it shows.
function useReadMarker(characterId: string, threadId: string, highest: number, lastRead: number | null) {
  useEffect(() => {
    if (highest <= (lastRead ?? 0)) return;
    let disposed = false, inFlight = false, done = false;
    const mark = () => {
      if (disposed || done || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      markForumThreadRead(characterId, threadId, highest).then(error => { done = !error; }, () => {}).finally(() => { inFlight = false; });
    };
    const unsubscribe = subscribeToForeground(mark); mark();
    return () => { disposed = true; unsubscribe(); };
  }, [characterId, threadId, highest, lastRead]);
}

// The server's counts stay authoritative; the pressed state and counts only lead them while saving.
function Reactions({ characterId, post, onError }: { characterId: string; post: ForumPost; onError: (message: string) => void }) {
  const [shown, setShown] = useOptimistic({ likes: post.likes ?? 0, dislikes: post.dislikes ?? 0, mine: post.my_reaction });
  const [pending, start] = useTransition();
  useNavigationActivity(pending);
  if (post.likes === null || post.dislikes === null) return null;
  function react(value: 1 | -1) {
    const next: ForumReaction = shown.mine === value ? 0 : value;
    start(async () => {
      setShown({ likes: shown.likes - (shown.mine === 1 ? 1 : 0) + (next === 1 ? 1 : 0), dislikes: shown.dislikes - (shown.mine === -1 ? 1 : 0) + (next === -1 ? 1 : 0), mine: next });
      try { const result = await setForumReaction(characterId, post.id, next); if (result.error) onError(result.error); }
      catch { onError("Your reaction could not be saved. Please try again."); }
    });
  }
  const dislikeHint = post.can_react && !post.can_dislike ? `New captains can dislike posts after ${gameplay.forum.newCharacterHours} hours.` : undefined;
  return <div className="o-forum-reactions" role="group" aria-label={"Reactions to post #" + post.number}>
    <button type="button" aria-pressed={shown.mine === 1} disabled={!post.can_react || pending} onClick={() => react(1)} aria-label={"Like (" + shown.likes + ")"}><ThumbsUp aria-hidden="true" />{shown.likes}</button>
    <button type="button" aria-pressed={shown.mine === -1} disabled={!post.can_dislike || pending} onClick={() => react(-1)} aria-label={"Dislike (" + shown.dislikes + ")"} title={dislikeHint}><ThumbsDown aria-hidden="true" />{shown.dislikes}</button>
  </div>;
}

function SubscribeButton({ characterId, thread }: { characterId: string; thread: ForumThread }) {
  const [error, setError] = useState<string | null>(null), [pending, start] = useTransition();
  useNavigationActivity(pending);
  return <span className="o-forum-subscribe">
    <button type="button" className="o-text-button" aria-pressed={thread.subscribed} disabled={pending} onClick={() => start(async () => {
      try { setError(await setForumSubscription(characterId, thread.id, !thread.subscribed)); } catch { setError("Your subscription could not be changed. Please try again."); }
    })}>{thread.subscribed ? <BellOff aria-hidden="true" /> : <Bell aria-hidden="true" />}{thread.subscribed ? "Unsubscribe" : "Subscribe"}</button>
    {error && <span role="alert" className="o-field-error">{error}</span>}
  </span>;
}

function PostEditor({ characterId, post, thread, asModerator, onDone }: {
  characterId: string; post: ForumPost; thread: ForumThread; asModerator: boolean; onDone: (message?: string) => void;
}) {
  const [body, setBody] = useState(post.body ?? ""), [title, setTitle] = useState(thread.title), [reason, setReason] = useState(""), [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null), [saving, start] = useTransition(), [retrying, setRetrying] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null), request = useRef<string | null>(null), id = useId();
  const { images, upload, tooMany } = useForumImageInsert(textarea, body, setBody, post.images);
  const uploads = !asModerator && thread.can_upload_images;
  useNavigationActivity(saving);
  const first = post.number === 1, newTitle = first && title.trim() !== thread.title ? title.trim() : null;
  const valid = validForumBody(normalizeForumBody(body)) && (newTitle === null || validForumTitle(newTitle)) && (!asModerator || validModerationReason(reason)) && !tooMany;
  function save() {
    if (saving || !valid) return;
    start(async () => {
      try {
        if (asModerator) {
          const requestId = request.current ??= crypto.randomUUID();
          const result = await moderateForum(characterId, { id: requestId, action: "edit_post", payload: { post_id: post.id, body, ...(newTitle === null ? {} : { title: newTitle }) }, reason });
          if (!result.retry) request.current = null;
          setRetrying(!!result.retry);
          if (result.receipt) onDone(result.receipt.message); else setError(result.error ?? "The post could not be saved.");
        } else {
          const result = await editForumPost(characterId, post.id, body, newTitle, post.edit_count);
          if (result.receipt) onDone("Post saved."); else setError(result.error ?? "The post could not be saved.");
        }
      } catch { setRetrying(asModerator); setError("Saving could not be confirmed. Try again."); }
    });
  }
  const locked = saving || retrying;
  return <div className="o-forum-inline-editor">
    {first && <div className="o-forum-field"><label htmlFor={id + "-title"}>Title</label>
      <input id={id + "-title"} value={title} readOnly={locked} maxLength={gameplay.forum.threadTitleMaxLength * 2} onChange={event => setTitle(event.target.value)} /></div>}
    <div className="o-forum-field"><label htmlFor={id + "-body"}>Post</label>
      <ForumToolbar textarea={textarea} value={body} onChange={setBody} disabled={locked} preview={preview} onPreview={() => setPreview(!preview)}
        onImage={uploads ? upload.open : undefined} imageBusy={upload.uploading} />
      <ForumTextArea id={id + "-body"} textarea={textarea} value={body} onChange={setBody} readOnly={locked} preview={preview} rows={6} describedBy={id + "-limit"}
        images={images} onPasteImage={uploads ? file => void upload.upload(file) : undefined} />
      {upload.picker}
      <small id={id + "-limit"}>{Array.from(body).length} / {gameplay.forum.postMaxLength} characters</small>
      {tooMany && <p role="alert" className="o-field-error">A post can show at most {gameplay.forum.imagesPerPost} images.</p>}
      {upload.error && <p role="alert" className="o-field-error">{upload.error}</p>}
    </div>
    {asModerator && <div className="o-forum-field"><label htmlFor={id + "-reason"}>Reason (visible to moderators)</label>
      <input id={id + "-reason"} value={reason} readOnly={locked} maxLength={500} onChange={event => setReason(event.target.value)} /></div>}
    <div className="o-forum-inline-actions">
      <button type="button" className="o-text-button" disabled={saving} onClick={() => onDone()}>Cancel</button>
      <button type="button" className="o-primary" disabled={saving || !valid || upload.uploading} onClick={save}>{saving ? "Saving..." : retrying ? "Retry" : "Save post"}</button>
    </div>
    {error && <p role="alert" className="o-field-error">{error}</p>}
  </div>;
}

function PostHistory({ characterId, post, onClose }: { characterId: string; post: ForumPost | null; onClose: () => void }) {
  const [revisions, setRevisions] = useState<{ postId: string; items: ForumRevision[] } | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!post) return;
    let active = true;
    loadForumPostHistory(characterId, post.id).then(result => {
      if (!active) return;
      if (result.history) setRevisions({ postId: post.id, items: result.history.revisions }); else setError(result.error ?? "The history could not be loaded.");
    }, () => { if (active) setError("The history could not be loaded."); });
    return () => { active = false; };
  }, [characterId, post]);
  const items = revisions && post && revisions.postId === post.id ? revisions.items : null;
  return <ForumDialog open={!!post} title={post ? `Earlier versions of post #${post.number}` : ""} onClose={() => { setRevisions(null); setError(null); onClose(); }}>
    {error ? <p role="alert">{error}</p> : !items ? <p className="o-copy">Loading...</p> : <ol className="o-forum-history">{items.map(item =>
      <li key={item.revision}><small>Version {item.revision + 1}, replaced <MessageTime value={item.replaced_at} />{item.editor && " by " + item.editor}</small>
        {item.title && <strong>{item.title}</strong>}<p className="o-forum-plain">{item.body}</p></li>)}</ol>}
  </ForumDialog>;
}

function ReportDialog({ characterId, post, open, onClose }: { characterId: string; post: ForumPost; open: boolean; onClose: (message?: string) => void }) {
  const [reason, setReason] = useState<ForumReportReason>("spam"), [note, setNote] = useState(""), [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition(), id = useId();
  useNavigationActivity(pending);
  function send() {
    if (pending || !validReportNote(note)) return;
    start(async () => {
      try {
        const result = await reportForumPost(characterId, post.id, reason, note);
        if (result.receipt) { setNote(""); setError(null); onClose(result.receipt.already ? "You have already reported this post." : "Thank you. The moderators will review this post."); }
        else setError(result.error ?? "The report could not be sent.");
      } catch { setError("The report could not be sent. Please try again."); }
    });
  }
  return <ForumDialog open={open} title={"Report post #" + post.number + "?"} busy={pending} onClose={() => onClose()}>
    <p>Moderators see your report and your name. The author does not.</p>
    <div className="o-forum-field"><label htmlFor={id + "-reason"}>Reason</label>
      <select id={id + "-reason"} value={reason} disabled={pending} onChange={event => setReason(event.target.value as ForumReportReason)}>
        {forumReportReasons.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></div>
    <div className="o-forum-field"><label htmlFor={id + "-note"}>Details (optional)</label>
      <textarea id={id + "-note"} rows={3} maxLength={500} value={note} readOnly={pending} onChange={event => setNote(event.target.value)} /></div>
    <div className="o-item-dialog-actions"><button type="button" className="o-text-button" disabled={pending} onClick={() => onClose()}>Cancel</button>
      <button type="button" className="o-primary" disabled={pending || !validReportNote(note)} onClick={send}>{pending ? "Sending..." : "Send report"}</button></div>
    {error && <p role="alert" className="o-field-error">{error}</p>}
  </ForumDialog>;
}

// Moderators act on each image a post shows; only administrators delete files for good.
function ImageModeration({ post, thread, onModerate }: { post: ForumPost; thread: ForumThread; onModerate: (prompt: ForumModerationPrompt) => void }) {
  const images = Object.entries(post.images ?? {});
  if (!thread.can_moderate || !images.length) return null;
  return <ul className="o-forum-image-tools" aria-label={"Images in post #" + post.number}>{images.map(([imageId, image], index) => <li key={imageId}>
    <span>Image {index + 1}{image.purged ? " (file deleted)" : image.removed ? " (hidden from players)" : ""}</span>
    {!image.removed && <button type="button" onClick={() => onModerate({ action: "remove_image", payload: { image_id: imageId }, title: "Hide image " + (index + 1) + " in post #" + post.number + "?",
      description: "Players see that a moderator removed the image. Moderators can still view and restore it.", confirm: "Hide image" })}><EyeOff aria-hidden="true" />Hide image</button>}
    {image.removed && !image.purged && <button type="button" onClick={() => onModerate({ action: "restore_image", payload: { image_id: imageId }, title: "Restore image " + (index + 1) + "?",
      description: "The image becomes visible to every player again.", confirm: "Restore image" })}><RotateCcw aria-hidden="true" />Restore image</button>}
    {thread.can_purge_images && !image.purged && <button type="button" onClick={() => onModerate({ action: "purge_image", payload: { image_id: imageId },
      title: "Delete image " + (index + 1) + " permanently?", description: "The file is deleted for everyone, including moderators. Use this for illegal content. This cannot be undone.",
      confirm: "Delete file" })}><ImageOff aria-hidden="true" />Delete file</button>}
  </li>)}</ul>;
}

function Signature({ post, signature, thread, onModerate }: { post: ForumPost; signature: string; thread: ForumThread; onModerate: (prompt: ForumModerationPrompt) => void }) {
  const author = post.author;
  return <div className="o-forum-signature">
    <ForumMarkup source={signature} className="o-forum-body o-forum-signature-body" />
    {thread.can_moderate && author && !post.own && <button type="button" className="o-text-button" onClick={() => onModerate({ action: "clear_signature",
      payload: { player_number: String(author.player_number) }, title: "Clear " + author.display_name + "'s signature?",
      description: "The signature is removed everywhere. The captain is told, and can write a new one.", confirm: "Clear signature" })}>Clear signature</button>}
  </div>;
}

function PostCard({ characterId, post, thread, fresh, signature, onQuote, onModerate, onHistory, onNotice }: {
  characterId: string; post: ForumPost; thread: ForumThread; fresh: boolean; signature: string | null; onQuote: () => void;
  onModerate: (prompt: ForumModerationPrompt) => void; onHistory: () => void; onNotice: (message: string) => void;
}) {
  const [editing, setEditing] = useState<"author" | "moderator" | null>(null), [confirming, setConfirming] = useState(false);
  const [reporting, setReporting] = useState(false), [showIgnored, setShowIgnored] = useState(false);
  const [error, setError] = useState<string | null>(null), [deleting, startDeleting] = useTransition();
  useNavigationActivity(deleting);
  const author = post.author;
  function withdraw() {
    startDeleting(async () => {
      try {
        const result = await withdrawForumPost(characterId, post.id);
        if (result.receipt) { setConfirming(false); onNotice("Your post was deleted."); }
        else setError(result.error ?? "The post could not be deleted.");
      } catch { setError("The post could not be deleted. Please try again."); }
    });
  }
  const moderate = (action: ForumModerationPrompt["action"], title: string, description: string, confirm: string) =>
    onModerate({ action, payload: { post_id: post.id }, title, description, confirm });
  // Posts by captains on the reader's ignore list stay folded until the reader opens one.
  if (post.ignored && !showIgnored) {
    return <li id={"post-" + post.number} className="o-forum-post o-forum-post-ignored">
      <p>Post #{post.number} by {author?.display_name ?? "[deleted]"}, whom you ignore. <button type="button" className="o-text-button" onClick={() => setShowIgnored(true)}>Show post</button></p>
    </li>;
  }
  return <li id={"post-" + post.number} className="o-forum-post" data-removed={!!post.removed} data-new={fresh}>
    <aside className="o-forum-author" aria-label={"Posted by " + (author?.display_name ?? "a deleted post")}>
      <span className="o-forum-author-name"><ForumPersonLink person={author} />{author && <> <span className="o-forum-author-id">[{author.player_number}]</span></>}</span>
      {author?.role && <span className="o-forum-role">{author.role === "admin" ? "Admin" : "Moderator"}</span>}
      {author && !author.deleted && <dl><div><dt>Level</dt><dd>{author.level ?? "-"}</dd></div><div><dt>Posts</dt><dd>{author.posts ?? 0}</dd></div>
        <div><dt>Karma</dt><dd>{author.karma ?? 0}</dd></div></dl>}
    </aside>
    <article className="o-forum-post-main" aria-label={"Post #" + post.number}>
      <header className="o-forum-post-head"><Link href={forumPermalink(post.id)} prefetch={false} className="o-forum-post-number" title="Link to this post">#{post.number}</Link>
        <MessageTime value={post.created_at} />{fresh && <span className="o-forum-new">New</span>}</header>
      {post.quote && !post.removed && <blockquote className="o-forum-quote">
        <header>Quote from <ForumPersonLink person={post.quote.author} /> <Link href={forumPermalink(post.quote.post_id)} prefetch={false}>#{post.quote.number}</Link>
          {post.quote.edited_after && <small> (edited since)</small>}</header>
        {post.quote.removed && <p className="o-copy">{post.quote.body === null ? "This post has been deleted." : "Deleted for players; moderators can still read it."}</p>}
        {post.quote.body !== null && <ForumMarkup source={post.quote.body} className={"o-forum-body o-forum-quote-body" + (post.quote.removed ? " o-forum-removed-body" : "")} />}
      </blockquote>}
      {editing ? <PostEditor characterId={characterId} post={post} thread={thread} asModerator={editing === "moderator"} onDone={message => { setEditing(null); if (message) onNotice(message); }} />
        : post.removed ? <div className="o-forum-removed"><p>{post.removed.by === "author" ? "This post was deleted by its author." : "This post was removed by a moderator."}</p>
          {post.body !== null && <><small>Hidden from players. Only moderators can read it.</small>
            <ForumMarkup source={post.body} className="o-forum-body o-forum-removed-body" images={post.images} moderator={thread.can_moderate} /></>}</div>
        : post.body !== null && <ForumMarkup source={post.body} images={post.images} moderator={thread.can_moderate} />}
      {!editing && <ImageModeration post={post} thread={thread} onModerate={onModerate} />}
      {signature && !editing && !post.removed && <Signature post={post} signature={signature} thread={thread} onModerate={onModerate} />}
      {post.edited && !editing && <p className="o-forum-edited">Last edited by {post.edited.by ?? "a former captain"}{post.edited.moderator && " (moderator)"} on <MessageTime value={post.edited.at} /></p>}
      {!editing && <footer className="o-forum-post-actions">
        <Reactions characterId={characterId} post={post} onError={setError} />
        {thread.can_reply && !post.removed && <button type="button" onClick={onQuote}><Quote aria-hidden="true" />Quote</button>}
        {post.can_edit && <button type="button" onClick={() => setEditing("author")}><Pencil aria-hidden="true" />Edit</button>}
        {post.can_withdraw && <button type="button" onClick={() => setConfirming(true)}><Trash2 aria-hidden="true" />Delete</button>}
        {thread.can_moderate && !post.own && !post.removed && <button type="button" onClick={() => setEditing("moderator")}><Pencil aria-hidden="true" />Moderator edit</button>}
        {thread.can_moderate && !post.removed && <button type="button" onClick={() => moderate("remove_post", "Remove post #" + post.number + "?", "Players will see that a moderator removed this post. Moderators can still read and restore it.", "Remove post")}><Trash2 aria-hidden="true" />Remove</button>}
        {thread.can_moderate && post.removed?.by === "moderator" && <button type="button" onClick={() => moderate("restore_post", "Restore post #" + post.number + "?", "The post becomes visible to every player again.", "Restore post")}><RotateCcw aria-hidden="true" />Restore</button>}
        {thread.can_moderate && post.edited && <button type="button" onClick={onHistory}><History aria-hidden="true" />History</button>}
        {thread.can_moderate && author && !author.deleted && !post.own && <button type="button" onClick={() => onModerate({ action: "ban_player", payload: { player_number: String(author.player_number) },
          title: "Ban " + author.display_name + " from posting?", description: "The captain can still read the forums and delete their own posts. Choose how long the ban lasts.",
          confirm: "Ban", banLength: true, reasonLabel: "Reason (shown to the player)" })}><Ban aria-hidden="true" />Ban author</button>}
        {post.reported ? <button type="button" disabled><Flag aria-hidden="true" />Reported</button>
          : post.can_report && <button type="button" onClick={() => setReporting(true)}><Flag aria-hidden="true" />Report</button>}
      </footer>}
      {error && <p role="alert" className="o-field-error">{error}</p>}
    </article>
    <ReportDialog characterId={characterId} post={post} open={reporting} onClose={message => { setReporting(false); if (message) onNotice(message); }} />
    <ForumDialog open={confirming} title={"Delete post #" + post.number + "?"} busy={deleting} onClose={() => setConfirming(false)}>
      <p>Players will see that a post was deleted here, but not what it said or who wrote it. The thread stays. This cannot be undone.</p>
      <div className="o-item-dialog-actions"><button type="button" className="o-text-button" disabled={deleting} onClick={() => setConfirming(false)}>Cancel</button>
        <button type="button" className="o-primary" disabled={deleting} onClick={withdraw}>{deleting ? "Deleting..." : "Delete post"}</button></div>
    </ForumDialog>
  </li>;
}

function ThreadModeration({ thread, onModerate }: { thread: ForumThread; onModerate: (prompt: ForumModerationPrompt) => void }) {
  const payload = { thread_id: thread.id };
  const act = (action: ForumModerationPrompt["action"], title: string, description: string, confirm: string) =>
    onModerate({ action, payload, title, description, confirm, boardId: thread.board.id });
  if (thread.removed) {
    return <div className="o-forum-moderation" role="group" aria-label="Moderation">
      <button type="button" onClick={() => act("restore_thread", "Restore this thread?", "The thread returns to its board for every player.", "Restore thread")}><RotateCcw aria-hidden="true" />Restore thread</button></div>;
  }
  const closed = thread.board.posting === "closed", poll = thread.poll && "options" in thread.poll ? thread.poll : null;
  return <div className="o-forum-moderation" role="group" aria-label="Moderation">
    {!closed && (thread.pinned ? <button type="button" onClick={() => act("unpin_thread", "Unpin this thread?", "The thread is sorted by its latest post again.", "Unpin")}><PinOff aria-hidden="true" />Unpin</button>
      : <button type="button" onClick={() => act("pin_thread", "Pin this thread?", "Pinned threads stay at the top of the board.", "Pin")}><Pin aria-hidden="true" />Pin</button>)}
    {thread.locked ? <button type="button" onClick={() => act("unlock_thread", "Unlock this thread?", "Players can reply and edit their posts again.", "Unlock")}><LockOpen aria-hidden="true" />Unlock</button>
      : <button type="button" onClick={() => act("lock_thread", "Lock this thread?", "Players can no longer reply or edit their posts. They can still read and delete them.", "Lock")}><Lock aria-hidden="true" />Lock</button>}
    <button type="button" onClick={() => act("move_thread", "Move this thread?", "Choose the board that should hold this thread.", "Move thread")}><MoveRight aria-hidden="true" />Move</button>
    {!closed && <button type="button" onClick={() => act("grave_thread", "Move this thread to the graveyard?", "The thread is locked, unpinned and moved to the closed board. It stays readable.", "Move to graveyard")}><Archive aria-hidden="true" />Graveyard</button>}
    <button type="button" onClick={() => act("remove_thread", "Remove this thread?", "Players can no longer find or open the thread. Moderators can restore it.", "Remove thread")}><Trash2 aria-hidden="true" />Remove</button>
    {poll && !poll.closed && <button type="button" onClick={() => act("close_poll", "Close this poll?", "Nobody can vote after this, and everyone sees the results.", "Close poll")}><BarChart3 aria-hidden="true" />Close poll</button>}
    {poll && (poll.removed ? <button type="button" onClick={() => act("restore_poll", "Restore this poll?", "The poll becomes visible to every player again.", "Restore poll")}><RotateCcw aria-hidden="true" />Restore poll</button>
      : <button type="button" onClick={() => act("remove_poll", "Remove this poll?", "Players see that a moderator removed the poll and can no longer vote. Moderators can restore it.", "Remove poll")}><Trash2 aria-hidden="true" />Remove poll</button>)}
  </div>;
}

export function ForumThreadView({ characterId, data }: { characterId: string; data: ForumThreadPage }) {
  const { thread, posts } = data;
  const [quote, setQuote] = useState<ForumQuoteDraft | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<ForumModerationPrompt | null>(null), [history, setHistory] = useState<ForumPost | null>(null);
  // Posts newer than the reader's position when the page opened stay marked for this visit.
  const [readBefore] = useState(thread.last_read_number ?? 0);
  const editor = useRef<HTMLTextAreaElement>(null), replySection = useRef<HTMLElement>(null);
  const highest = posts.reduce((value, post) => Math.max(value, post.number), 0);
  useReadMarker(characterId, thread.id, highest, thread.last_read_number);
  // A signature appears once per page, under the author's first visible post, instead of under every post.
  const signed = new Set<string>();
  const signatures = new Map(posts.map(post => {
    const number = post.author ? String(post.author.player_number) : null;
    const signature = number && !post.removed && !post.ignored && !signed.has(number) ? data.signatures[number] ?? null : null;
    if (signature && number) signed.add(number);
    return [post.id, signature] as const;
  }));
  function quotePost(post: ForumPost) {
    setQuote({ postId: post.id, number: post.number, author: post.author?.display_name ?? "[deleted]" });
    replySection.current?.scrollIntoView({ block: "center" });
    editor.current?.focus();
  }
  const pages = data.page_count > 1 && <Pagination page={data.page} pages={data.page_count} href={page => forumThreadUrl(thread.id, page)} label="Thread pages" />;
  const closedReason = thread.removed || data.ban ? null : thread.board.posting === "closed" ? "This thread is closed." : thread.locked ? "This thread is locked. Only moderators can reply."
    : thread.board.posting === "moderators" ? "Only moderators can reply in this board." : null;
  return <div className="o-forum-thread">
    <header className="o-forum-thread-head">
      <h2>{thread.pinned && <Pin aria-label="Pinned" />}{thread.locked && <Lock aria-label="Locked" />}{thread.title}</h2>
      <p className="o-copy">Started by <ForumPersonLink person={thread.author} /> on <MessageTime value={thread.created_at} /> · {thread.post_count} {thread.post_count === 1 ? "post" : "posts"} · {thread.views} {thread.views === 1 ? "view" : "views"}</p>
      {!thread.removed && <SubscribeButton characterId={characterId} thread={thread} />}
      {thread.removed && <p className="o-forum-warning" role="status">A moderator removed this thread. Only moderators can open it.</p>}
      {thread.can_moderate && <ThreadModeration thread={thread} onModerate={setPrompt} />}
    </header>
    {data.ban && <ForumBanNotice ban={data.ban} />}
    {notice && <p className="o-forum-notice" role="status">{notice}</p>}
    {thread.poll && <ForumPollView characterId={characterId} threadId={thread.id} poll={thread.poll} />}
    {pages}
    <ol className="o-forum-posts">{posts.map(post => <PostCard key={post.id} characterId={characterId} post={post} thread={thread} fresh={post.number > readBefore && !post.own}
      signature={signatures.get(post.id) ?? null}
      onQuote={() => quotePost(post)} onModerate={setPrompt} onHistory={() => setHistory(post)} onNotice={setNotice} />)}</ol>
    {pages}
    {thread.can_reply ? <section className="o-forum-reply" ref={replySection} aria-label="Reply to this thread">
      <ForumEditor characterId={characterId} target={{ kind: "reply", threadId: thread.id }} quote={quote} onClearQuote={() => setQuote(null)} textarea={editor}
        canUploadImages={thread.can_upload_images} />
    </section> : closedReason && <p className="o-forum-closed">{closedReason}</p>}
    <ForumModerationDialog characterId={characterId} prompt={prompt} onClose={message => { setPrompt(null); if (message) setNotice(message); }} />
    <PostHistory characterId={characterId} post={history} onClose={() => setHistory(null)} />
  </div>;
}
