import { Fragment } from "react";
import Form from "next/form";
import { BarChart3, ChevronRight, Flame, Lock, MessagesSquare, Pin, Search } from "lucide-react";
import { GameLink as Link } from "@/components/game-navigation";
import { MessageTime } from "@/components/messages/message-time";
import { ForumPersonLink } from "@/components/forums/forum-person";
import { gameplay } from "@/config/public";
import { forumBoardUrl, forumPageCount, forumPermalink, forumThreadUrl, forumUnreadUrl, forumUrl, type ForumBoardSummary, type ForumPopularThread, type ForumThreadSummary } from "@/lib/forums";

export function ForumSearchForm({ query = "", threads = false, board = null }: { query?: string; threads?: boolean; board?: string | null }) {
  return <Form action="/forums/search" className="o-forum-search" role="search" aria-label="Search the forums">
    <input name="q" defaultValue={query} maxLength={200} aria-label="Search the forums" placeholder="Search posts, or by:name" />
    {threads && <input type="hidden" name="threads" value="1" />}
    {board && <input type="hidden" name="board" value={board} />}
    <button className="o-primary" type="submit"><Search size={16} aria-hidden="true" />Search</button>
  </Form>;
}

export function ForumBreadcrumbs({ trail }: { trail: { label: string; href?: string }[] }) {
  return <nav className="o-forum-breadcrumbs" aria-label="Forum location"><ol>
    <li><Link href={forumUrl()}>Forums</Link></li>
    {trail.map((item, index) => <li key={index}><ChevronRight aria-hidden="true" />{item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}</li>)}
  </ol></nav>;
}

// Sections keep the configured board order.
export function ForumBoardList({ boards }: { boards: ForumBoardSummary[] }) {
  const sections = boards.reduce<{ name: string; boards: ForumBoardSummary[] }[]>((groups, board) => {
    const group = groups.find(item => item.name === board.section);
    if (group) group.boards.push(board); else groups.push({ name: board.section, boards: [board] });
    return groups;
  }, []);
  return <div className="o-forum-sections">{sections.map(section => <section key={section.name} className="o-forum-section" aria-label={section.name}>
    <table className="o-forum-table o-forum-boards">
      <thead><tr><th scope="col">{section.name}</th><th scope="col">Threads</th><th scope="col">Posts</th><th scope="col">Last post</th></tr></thead>
      <tbody>{section.boards.map(board => <tr key={board.id} data-unread={board.unread} data-inactive={!board.active}>
        <td className="o-forum-topic"><div><span className="o-forum-marker" aria-hidden="true"><MessagesSquare /></span>
          <span><Link className="o-forum-title" href={forumBoardUrl(board.id)}>{board.name}</Link>{board.unread && <span className="o-forum-new">New</span>}
            {!board.active && <span className="o-forum-flag">Hidden</span>}<small>{board.description}</small></span></div></td>
        <td data-label="Threads">{board.thread_count.toLocaleString("en-GB")}</td>
        <td data-label="Posts">{board.post_count.toLocaleString("en-GB")}</td>
        <td className="o-forum-last" data-label="Last post">{board.last_post ? <>
          <Link href={forumPermalink(board.last_post.post_id)} prefetch={false}>{board.last_post.title}</Link>
          <small>by <ForumPersonLink person={board.last_post.author} />, <MessageTime value={board.last_post.posted_at} compact /></small>
        </> : <small>No posts yet</small>}</td>
      </tr>)}</tbody>
    </table>
  </section>)}</div>;
}

function ThreadPages({ thread }: { thread: ForumThreadSummary }) {
  const pages = forumPageCount(thread.post_seq, gameplay.forum.postsPageSize);
  if (pages < 2) return null;
  const shown = pages <= 4 ? Array.from({ length: pages }, (_, page) => page) : [0, 1, pages - 2, pages - 1];
  return <span className="o-forum-thread-pages" aria-label="Thread pages">{shown.map((page, index) => <Fragment key={page}>
    {index > 0 && page > shown[index - 1] + 1 && <span aria-hidden="true">…</span>}
    <Link href={forumThreadUrl(thread.id, page)} prefetch={false} aria-label={"Page " + (page + 1) + " of " + thread.title}>{page + 1}</Link>
  </Fragment>)}</span>;
}

export function ForumThreadList({ threads }: { threads: ForumThreadSummary[] }) {
  return <table className="o-forum-table o-forum-threads">
    <thead><tr><th scope="col">Thread</th><th scope="col">Replies</th><th scope="col">Views</th><th scope="col">Rating</th><th scope="col">Last post</th></tr></thead>
    <tbody>{threads.map(thread => <tr key={thread.id} data-unread={thread.unread} data-pinned={thread.pinned}>
      <td className="o-forum-topic"><div><span className="o-forum-marker" aria-hidden="true">{thread.pinned ? <Pin /> : thread.locked ? <Lock /> : <MessagesSquare />}</span>
        <span><Link className="o-forum-title" href={forumThreadUrl(thread.id)}>{thread.title}</Link>
          {thread.pinned && <span className="o-forum-flag">Pinned</span>}{thread.locked && <span className="o-forum-flag">Locked</span>}
          {thread.poll && <span className="o-forum-flag"><BarChart3 aria-hidden="true" />Poll</span>}
          {thread.unread && <Link className="o-forum-new" href={forumUnreadUrl(thread.id)} prefetch={false} aria-label={"First unread post in " + thread.title}>New</Link>}
          <small>by <ForumPersonLink person={thread.author} />, <MessageTime value={thread.created_at} compact /></small><ThreadPages thread={thread} /></span></div></td>
      <td data-label="Replies">{thread.replies.toLocaleString("en-GB")}</td>
      <td data-label="Views">{thread.views.toLocaleString("en-GB")}</td>
      <td data-label="Rating">{thread.rating === null ? "-" : (thread.rating > 0 ? "+" : "") + thread.rating.toLocaleString("en-GB")}</td>
      <td className="o-forum-last" data-label="Last post">{thread.last_post && <>
        <Link href={forumPermalink(thread.last_post.post_id)} prefetch={false}>#{thread.last_post.post_number}</Link>
        <small>by <ForumPersonLink person={thread.last_post.author} />, <MessageTime value={thread.last_post.posted_at} compact /></small>
      </>}</td>
    </tr>)}</tbody>
  </table>;
}

// Ranked on a schedule from recent replies, repliers and likes; see docs/FORUMS.md.
export function ForumPopularList({ threads }: { threads: ForumPopularThread[] }) {
  if (!threads.length) return null;
  return <section className="o-forum-popular" aria-labelledby="forum-popular-title">
    <h2 id="forum-popular-title"><Flame aria-hidden="true" />Popular threads</h2>
    <ol>{threads.map(thread => <li key={thread.id} data-unread={thread.unread}>
      <Link className="o-forum-title" href={forumThreadUrl(thread.id)}>{thread.title}</Link>
      {thread.poll && <span className="o-forum-flag"><BarChart3 aria-hidden="true" />Poll</span>}
      {thread.unread && <Link className="o-forum-new" href={forumUnreadUrl(thread.id)} prefetch={false} aria-label={"First unread post in " + thread.title}>New</Link>}
      <small><Link href={forumBoardUrl(thread.board.id)}>{thread.board.name}</Link> · {thread.replies.toLocaleString("en-GB")} {thread.replies === 1 ? "reply" : "replies"}
        {thread.last_post && <> · <MessageTime value={thread.last_post.posted_at} compact /></>}</small>
    </li>)}</ol>
  </section>;
}
