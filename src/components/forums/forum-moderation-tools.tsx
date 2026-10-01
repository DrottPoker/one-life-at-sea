"use client";

import { useId, useState, type FormEvent } from "react";
import { Ban, CircleCheck, ShieldOff, Trash2, Undo2 } from "lucide-react";
import { GameLink as Link } from "@/components/game-navigation";
import { MessageTime } from "@/components/messages/message-time";
import { ForumModerationDialog, type ForumModerationPrompt } from "@/components/forums/forum-dialog";
import { ForumPersonLink } from "@/components/forums/forum-person";
import { plainForumText } from "@/lib/forum-markup";
import { forumPermalink, forumReportReasons, forumThreadUrl, type ForumModerationOverview, type ForumReportPage } from "@/lib/forums";
import { isPlayerNumber } from "@/lib/player-identity";

const actionLabels: Record<string, string> = {
  pin_thread: "Pinned thread", unpin_thread: "Unpinned thread", lock_thread: "Locked thread", unlock_thread: "Unlocked thread", move_thread: "Moved thread",
  grave_thread: "Moved thread to the graveyard", remove_thread: "Removed thread", restore_thread: "Restored thread", remove_post: "Removed post",
  restore_post: "Restored post", edit_post: "Edited post", dismiss_reports: "Dismissed reports", ban_player: "Banned captain", unban_player: "Lifted ban",
  grant_moderator: "Appointed moderator", revoke_moderator: "Removed moderator", close_poll: "Closed poll", remove_poll: "Removed poll", restore_poll: "Restored poll",
  remove_image: "Hid image", restore_image: "Restored image", purge_image: "Deleted image file", clear_signature: "Cleared signature",
};
const reasonLabel = (reason: string) => forumReportReasons.find(item => item.id === reason)?.label ?? reason;
const excerpt = (body: string) => { const text = plainForumText(body); return text.length > 280 ? text.slice(0, 280).trimEnd() + "…" : text; };
const banPrompt = (playerNumber: string, name: string): ForumModerationPrompt => ({ action: "ban_player", payload: { player_number: playerNumber },
  title: "Ban " + name + " from posting?", description: "The captain can still read the forums and delete their own posts. Choose how long the ban lasts.",
  confirm: "Ban", banLength: true, reasonLabel: "Reason (shown to the player)" });

// A player ID field that opens the confirming dialog; the database checks the target again.
function PlayerAction({ label, button, onSubmit }: { label: string; button: string; onSubmit: (playerNumber: string) => void }) {
  const [value, setValue] = useState(""), [error, setError] = useState<string | null>(null), id = useId();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const playerNumber = value.trim().replace(/^#/, "");
    if (!isPlayerNumber(playerNumber)) { setError("Enter a player ID such as 100001."); return; }
    setError(null); onSubmit(playerNumber);
  }
  return <form className="o-forum-player-action" onSubmit={submit}>
    <label htmlFor={id}>{label}</label>
    <div><input id={id} value={value} inputMode="numeric" maxLength={17} placeholder="Player ID" onChange={event => setValue(event.target.value)} />
      <button type="submit" className="o-primary">{button}</button></div>
    {error && <span role="alert" className="o-field-error">{error}</span>}
  </form>;
}

export function ForumModerationTools({ characterId, view, overview, reports }: {
  characterId: string; view: "reports" | "resolved" | "dismissed" | "people" | "log"; overview: ForumModerationOverview; reports: ForumReportPage | null;
}) {
  const [prompt, setPrompt] = useState<ForumModerationPrompt | null>(null), [notice, setNotice] = useState<string | null>(null);
  return <>
    {notice && <p className="o-forum-notice" role="status">{notice}</p>}
    {reports && (reports.items.length ? <ol className="o-forum-results o-forum-queue" aria-label="Reported posts">{reports.items.map(entry => <li key={entry.post.id}>
      <span><Link href={forumPermalink(entry.post.id)} prefetch={false}>{entry.thread.title}</Link> <small>#{entry.post.number} in {entry.board.name} by <ForumPersonLink person={entry.post.author} /></small></span>
      {entry.post.removed && <small>This post was {entry.post.removed === "author" ? "deleted by its author" : "removed by a moderator"}.</small>}
      {entry.thread.removed && <small>The thread was removed.</small>}
      <p>{excerpt(entry.post.excerpt)}</p>
      <ul className="o-forum-report-list">{entry.reports.map(report => <li key={report.id}>
        <strong>{reasonLabel(report.reason)}</strong> by <ForumPersonLink person={report.reporter} />, <MessageTime value={report.created_at} compact />
        {report.note && <span className="o-forum-plain">: {report.note}</span>}
        {report.handled_by && <small> {report.status === "dismissed" ? "Dismissed" : "Resolved"} by {report.handled_by}{report.handled_at && <>, <MessageTime value={report.handled_at} compact /></>}</small>}
      </li>)}</ul>
      {view === "reports" && <div className="o-forum-moderation" role="group" aria-label={"Moderate post #" + entry.post.number}>
        {!entry.post.can_moderate && <small>Only an administrator can moderate this post.</small>}
        {entry.post.can_moderate && !entry.post.removed && <button type="button" onClick={() => setPrompt({ action: "remove_post", payload: { post_id: entry.post.id }, title: "Remove this post?",
          description: "Players will see that a moderator removed the post, and its reports are resolved.", confirm: "Remove post" })}><Trash2 aria-hidden="true" />Remove post</button>}
        {entry.post.can_moderate && <button type="button" onClick={() => setPrompt({ action: "dismiss_reports", payload: { post_id: entry.post.id }, title: "Dismiss these reports?",
          description: "The post stays as it is and the reports leave the queue.", confirm: "Dismiss reports" })}><CircleCheck aria-hidden="true" />Dismiss</button>}
        {entry.post.can_moderate && !entry.post.author.deleted && <button type="button" onClick={() => setPrompt(banPrompt(String(entry.post.author.player_number), entry.post.author.display_name))}><Ban aria-hidden="true" />Ban author</button>}
        <Link href={forumThreadUrl(entry.thread.id)} prefetch={false}>Open thread</Link>
      </div>}
    </li>)}</ol> : <p className="o-copy">{view === "reports" ? "No open reports. The queue is clear." : "Nothing here yet."}</p>)}

    {view === "people" && <>
      <section className="o-forum-tool" aria-label="Active bans"><h3>Active bans</h3>
        {overview.bans.length ? <ul className="o-forum-report-list">{overview.bans.map(ban => <li key={ban.player.player_number}>
          <ForumPersonLink person={ban.player} /> [{ban.player.player_number}] {ban.ends_at ? <>until <MessageTime value={ban.ends_at} /></> : "permanently"}, by {ban.banned_by}.
          <span className="o-forum-plain"> Reason: {ban.reason}</span>
          {ban.can_lift && <button type="button" className="o-text-button" onClick={() => setPrompt({ action: "unban_player", payload: { player_number: String(ban.player.player_number) },
            title: "Lift the ban on " + ban.player.display_name + "?", description: "The captain can post, react and report again.", confirm: "Lift ban" })}><Undo2 size={14} aria-hidden="true" /> Lift ban</button>}
        </li>)}</ul> : <p className="o-copy">Nobody is banned.</p>}
        <PlayerAction label="Ban a captain" button="Ban" onSubmit={playerNumber => setPrompt(banPrompt(playerNumber, "captain " + playerNumber))} />
      </section>
      <section className="o-forum-tool" aria-label="Forum moderators"><h3>Moderators</h3>
        <p className="o-copy">Administrators always moderate. Appointed moderators handle reports, content and bans, but only administrators appoint moderators or act on moderators&apos; and administrators&apos; content and bans.</p>
        {overview.moderators.length ? <ul className="o-forum-report-list">{overview.moderators.map(moderator => <li key={moderator.player.player_number}>
          <ForumPersonLink person={moderator.player} /> [{moderator.player.player_number}], appointed <MessageTime value={moderator.granted_at} compact />{moderator.granted_by && " by " + moderator.granted_by}
          {overview.can_manage_moderators && <button type="button" className="o-text-button" onClick={() => setPrompt({ action: "revoke_moderator", payload: { player_number: String(moderator.player.player_number) },
            title: "Remove " + moderator.player.display_name + " as moderator?", description: "They keep their account but lose the moderation tools.", confirm: "Remove moderator" })}><ShieldOff size={14} aria-hidden="true" /> Remove</button>}
        </li>)}</ul> : <p className="o-copy">No player moderators yet.</p>}
        {overview.can_manage_moderators && <PlayerAction label="Appoint a moderator" button="Appoint" onSubmit={playerNumber => setPrompt({ action: "grant_moderator",
          payload: { player_number: playerNumber }, title: "Appoint captain " + playerNumber + " as moderator?", description: "They can handle reports, moderate content and ban players.", confirm: "Appoint" })} />}
      </section>
    </>}

    {view === "log" && (overview.log.length ? <ol className="o-forum-results" aria-label="Moderation log">{overview.log.map(entry => <li key={entry.id}>
      <span><strong>{actionLabels[entry.action] ?? entry.action}</strong> by {entry.actor} <small><MessageTime value={entry.created_at} compact /></small></span>
      <small>{entry.thread ? <Link href={entry.post_id ? forumPermalink(entry.post_id) : forumThreadUrl(entry.thread.id)} prefetch={false}>{entry.thread.title}</Link>
        : entry.payload.player_number && "Captain " + entry.payload.player_number}{entry.payload.hours && " for " + entry.payload.hours + " hours"}</small>
      <p className="o-forum-plain">{entry.reason}</p>
    </li>)}</ol> : <p className="o-copy">No moderator actions yet.</p>)}
    <ForumModerationDialog characterId={characterId} prompt={prompt} onClose={message => { setPrompt(null); if (message) setNotice(message); }} />
  </>;
}
