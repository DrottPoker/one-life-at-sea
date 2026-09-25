"use client";

import { useState, useTransition } from "react";
import { BellOff } from "lucide-react";
import { GameLink as Link } from "@/components/game-navigation";
import { useNavigationActivity } from "@/components/game-refresh";
import { MessageTime } from "@/components/messages/message-time";
import { ForumPersonLink } from "@/components/forums/forum-person";
import { setForumSubscription } from "@/app/forum-actions";
import { forumBoardUrl, forumPermalink, forumThreadUrl, forumUnreadUrl, type ForumSubscription } from "@/lib/forums";

export function ForumSubscriptionList({ characterId, items }: { characterId: string; items: ForumSubscription[] }) {
  const [error, setError] = useState<string | null>(null), [pending, start] = useTransition();
  useNavigationActivity(pending);
  function unsubscribe(threadId: string) {
    start(async () => {
      try { setError(await setForumSubscription(characterId, threadId, false)); } catch { setError("Your subscription could not be changed. Please try again."); }
    });
  }
  return <>
    {error && <p role="alert" className="o-field-error">{error}</p>}
    <ol className="o-forum-results" aria-label="Subscribed threads">{items.map(item => <li key={item.id}>
      <span><Link href={item.new_posts ? forumUnreadUrl(item.id) : forumThreadUrl(item.id)} prefetch={false}>{item.title}</Link>
        {item.new_posts > 0 && <span className="o-forum-count">{item.new_posts} new</span>}</span>
      <small>In <Link href={forumBoardUrl(item.board.id)}>{item.board.name}</Link> · {item.replies} {item.replies === 1 ? "reply" : "replies"}
        {item.last_post && <> · last post <Link href={forumPermalink(item.last_post.post_id)} prefetch={false}>#{item.last_post.post_number}</Link> by <ForumPersonLink person={item.last_post.author} />, <MessageTime value={item.last_post.posted_at} compact /></>}</small>
      <span><button type="button" className="o-text-button" disabled={pending} onClick={() => unsubscribe(item.id)} aria-label={"Unsubscribe from " + item.title}><BellOff size={14} aria-hidden="true" /> Unsubscribe</button></span>
    </li>)}</ol>
  </>;
}
