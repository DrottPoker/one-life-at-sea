"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Archive, History, Lock, LockOpen, MoveRight, Pencil, Pin, PinOff, Quote, RotateCcw, Trash2 } from "lucide-react";
import { GameLink as Link } from "@/components/game-navigation";
import { useNavigationActivity } from "@/components/game-refresh";
import { MessageTime } from "@/components/messages/message-time";
import { Pagination } from "@/components/pagination";
import { ForumMarkup } from "@/components/forums/forum-markup";
import { ForumPersonLink } from "@/components/forums/forum-person";
import { ForumEditor, ForumTextArea, ForumToolbar, type ForumQuoteDraft } from "@/components/forums/forum-editor";
import { ForumDialog, ForumModerationDialog, type ForumModerationPrompt } from "@/components/forums/forum-dialog";
import { editForumPost, loadForumPostHistory, markForumThreadRead, moderateForum, withdrawForumPost } from "@/app/forum-actions";
import { gameplay } from "@/config/public";
import { subscribeToForeground } from "@/lib/browser-events";
import { forumPermalink, forumThreadUrl, normalizeForumBody, validForumBody, validForumTitle, validModerationReason,
  type ForumPost, type ForumRevision, type ForumThread, type ForumThreadPage } from "@/lib/forums";

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

function PostEditor({ characterId, post, thread, asModerator, onDone }: {
  characterId: string; post: ForumPost; thread: ForumThread; asModerator: boolean; onDone: (message?: string) => void;
}) {
  const [body, setBody] = useState(post.body ?? ""), [title, setTitle] = useState(thread.title), [reason, setReason] = useState(""), [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null), [saving, start] = useTransition(), [retrying, setRetrying] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null), request = useRef<string | null>(null), id = useId();
  useNavigationActivity(saving);
  const first = post.number === 1, newTitle = first && title.trim() !== thread.title ? title.trim() : null;
  const valid = validForumBody(normalizeForumBody(body)) && (newTitle === null || validForumTitle(newTitle)) && (!asModerator || validModerationReason(reason));
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
      <ForumToolbar textarea={textarea} value={body} onChange={setBody} disabled={locked} preview={preview} onPreview={() => setPreview(!preview)} />
      <ForumTextArea id={id + "-body"} textarea={textarea} value={body} onChange={setBody} readOnly={locked} preview={preview} rows={6} describedBy={id + "-limit"} />
      <small id={id + "-limit"}>{Array.from(body).length} / {gameplay.forum.postMaxLength} characters</small>
    </div>
    {asModerator && <div className="o-forum-field"><label htmlFor={id + "-reason"}>Reason (visible to moderators)</label>
      <input id={id + "-reason"} value={reason} readOnly={locked} maxLength={500} onChange={event => setReason(event.target.value)} /></div>}
    <div className="o-forum-inline-actions">
      <button type="button" className="o-text-button" disabled={saving} onClick={() => onDone()}>Cancel</button>
      <button type="button" className="o-primary" disabled={saving || !valid} onClick={save}>{saving ? "Saving..." : retrying ? "Retry" : "Save post"}</button>
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

function PostCard({ characterId, post, thread, fresh, onQuote, onModerate, onHistory, onNotice }: {
  characterId: string; post: ForumPost; thread: ForumThread; fresh: boolean; onQuote: () => void;
  onModerate: (prompt: ForumModerationPrompt) => void; onHistory: () => void; onNotice: (message: string) => void;
}) {
  const [editing, setEditing] = useState<"author" | "moderator" | null>(null), [confirming, setConfirming] = useState(false);
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
  return <li id={"post-" + post.number} className="o-forum-post" data-removed={!!post.removed} data-new={fresh}>
    <aside className="o-forum-author" aria-label={"Posted by " + (author?.display_name ?? "a deleted post")}>
      <span className="o-forum-author-name"><ForumPersonLink person={author} />{author && <> <span className="o-forum-author-id">[{author.player_number}]</span></>}</span>
      {author?.role === "admin" && <span className="o-forum-role">Admin</span>}
      {author && !author.deleted && <dl><div><dt>Level</dt><dd>{author.level ?? "-"}</dd></div><div><dt>Posts</dt><dd>{author.posts ?? 0}</dd></div></dl>}
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
          {post.body !== null && <><small>Hidden from players. Only moderators can read it.</small><ForumMarkup source={post.body} className="o-forum-body o-forum-removed-body" /></>}</div>
        : post.body !== null && <ForumMarkup source={post.body} />}
      {post.edited && !editing && <p className="o-forum-edited">Last edited by {post.edited.by ?? "a former captain"}{post.edited.moderator && " (moderator)"} on <MessageTime value={post.edited.at} /></p>}
      {!editing && <footer className="o-forum-post-actions">
        {thread.can_reply && !post.removed && <button type="button" onClick={onQuote}><Quote aria-hidden="true" />Quote</button>}
        {post.can_edit && <button type="button" onClick={() => setEditing("author")}><Pencil aria-hidden="true" />Edit</button>}
        {post.can_withdraw && <button type="button" onClick={() => setConfirming(true)}><Trash2 aria-hidden="true" />Delete</button>}
        {thread.can_moderate && !post.own && !post.removed && <button type="button" onClick={() => setEditing("moderator")}><Pencil aria-hidden="true" />Moderator edit</button>}
        {thread.can_moderate && !post.removed && <button type="button" onClick={() => moderate("remove_post", "Remove post #" + post.number + "?", "Players will see that a moderator removed this post. Moderators can still read and restore it.", "Remove post")}><Trash2 aria-hidden="true" />Remove</button>}
        {thread.can_moderate && post.removed?.by === "moderator" && <button type="button" onClick={() => moderate("restore_post", "Restore post #" + post.number + "?", "The post becomes visible to every player again.", "Restore post")}><RotateCcw aria-hidden="true" />Restore</button>}
        {thread.can_moderate && post.edited && <button type="button" onClick={onHistory}><History aria-hidden="true" />History</button>}
      </footer>}
      {error && <p role="alert" className="o-field-error">{error}</p>}
    </article>
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
  const closed = thread.board.posting === "closed";
  return <div className="o-forum-moderation" role="group" aria-label="Moderation">
    {!closed && (thread.pinned ? <button type="button" onClick={() => act("unpin_thread", "Unpin this thread?", "The thread is sorted by its latest post again.", "Unpin")}><PinOff aria-hidden="true" />Unpin</button>
      : <button type="button" onClick={() => act("pin_thread", "Pin this thread?", "Pinned threads stay at the top of the board.", "Pin")}><Pin aria-hidden="true" />Pin</button>)}
    {thread.locked ? <button type="button" onClick={() => act("unlock_thread", "Unlock this thread?", "Players can reply and edit their posts again.", "Unlock")}><LockOpen aria-hidden="true" />Unlock</button>
      : <button type="button" onClick={() => act("lock_thread", "Lock this thread?", "Players can no longer reply or edit their posts. They can still read and delete them.", "Lock")}><Lock aria-hidden="true" />Lock</button>}
    <button type="button" onClick={() => act("move_thread", "Move this thread?", "Choose the board that should hold this thread.", "Move thread")}><MoveRight aria-hidden="true" />Move</button>
    {!closed && <button type="button" onClick={() => act("grave_thread", "Move this thread to the graveyard?", "The thread is locked, unpinned and moved to the closed board. It stays readable.", "Move to graveyard")}><Archive aria-hidden="true" />Graveyard</button>}
    <button type="button" onClick={() => act("remove_thread", "Remove this thread?", "Players can no longer find or open the thread. Moderators can restore it.", "Remove thread")}><Trash2 aria-hidden="true" />Remove</button>
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
  function quotePost(post: ForumPost) {
    setQuote({ postId: post.id, number: post.number, author: post.author?.display_name ?? "[deleted]" });
    replySection.current?.scrollIntoView({ block: "center" });
    editor.current?.focus();
  }
  const pages = data.page_count > 1 && <Pagination page={data.page} pages={data.page_count} href={page => forumThreadUrl(thread.id, page)} label="Thread pages" />;
  const closedReason = thread.removed ? null : thread.board.posting === "closed" ? "This thread is closed." : thread.locked ? "This thread is locked. Only moderators can reply."
    : thread.board.posting === "moderators" ? "Only moderators can reply in this board." : null;
  return <div className="o-forum-thread">
    <header className="o-forum-thread-head">
      <h2>{thread.pinned && <Pin aria-label="Pinned" />}{thread.locked && <Lock aria-label="Locked" />}{thread.title}</h2>
      <p className="o-copy">Started by <ForumPersonLink person={thread.author} /> on <MessageTime value={thread.created_at} /> · {thread.post_count} {thread.post_count === 1 ? "post" : "posts"} · {thread.views} {thread.views === 1 ? "view" : "views"}</p>
      {thread.removed && <p className="o-forum-warning" role="status">A moderator removed this thread. Only moderators can open it.</p>}
      {thread.can_moderate && <ThreadModeration thread={thread} onModerate={setPrompt} />}
    </header>
    {notice && <p className="o-forum-notice" role="status">{notice}</p>}
    {pages}
    <ol className="o-forum-posts">{posts.map(post => <PostCard key={post.id} characterId={characterId} post={post} thread={thread} fresh={post.number > readBefore && !post.own}
      onQuote={() => quotePost(post)} onModerate={setPrompt} onHistory={() => setHistory(post)} onNotice={setNotice} />)}</ol>
    {pages}
    {thread.can_reply ? <section className="o-forum-reply" ref={replySection} aria-label="Reply to this thread">
      <ForumEditor characterId={characterId} target={{ kind: "reply", threadId: thread.id }} quote={quote} onClearQuote={() => setQuote(null)} textarea={editor} />
    </section> : closedReason && <p className="o-forum-closed">{closedReason}</p>}
    <ForumModerationDialog characterId={characterId} prompt={prompt} onClose={message => { setPrompt(null); if (message) setNotice(message); }} />
    <PostHistory characterId={characterId} post={history} onClose={() => setHistory(null)} />
  </div>;
}
