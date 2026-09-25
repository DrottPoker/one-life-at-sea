import { GameLink as Link } from "@/components/game-navigation";
import { MessageTime } from "@/components/messages/message-time";
import { Pagination } from "@/components/pagination";
import { ForumBreadcrumbs, ForumSearchForm } from "@/components/forums/forum-lists";
import { ForumPersonLink } from "@/components/forums/forum-person";
import { requireCharacter } from "@/lib/player";
import { searchForums } from "@/lib/forums-server";
import { plainForumText } from "@/lib/forum-markup";
import { forumBoard, forumBoardUrl, forumPermalink, forumSearchUrl, isForumBoardId, parseForumPage, parseForumSearch } from "@/lib/forums";

export const metadata = { title: "Search - Forums" };

type Params = { q?: string | string[]; page?: string | string[]; threads?: string | string[]; board?: string | string[] };

function excerpt(body: string) {
  const text = plainForumText(body);
  return text.length > 240 ? text.slice(0, 240).trimEnd() + "…" : text;
}

export default async function ForumSearchPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireCharacter({ allowHospital: true, allowSea: true });
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const threads = params.threads === "1";
  const board = typeof params.board === "string" && isForumBoardId(params.board) && forumBoard(params.board) ? params.board : null;
  const { text, author } = parseForumSearch(query);
  const data = text || author ? await searchForums({ query: text, author, board_id: board, threads_only: threads, page: parseForumPage(params.page) }) : null;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const scope = [threads ? "threads" : "posts", board ? "in " + forumBoard(board)!.name : ""].filter(Boolean).join(" ");
  return <div className="o-forum-content">
    <ForumBreadcrumbs trail={[{ label: "Search" }]} />
    <ForumSearchForm query={query} threads={threads} board={board} />
    <p className="o-copy">Search {scope}. Use &quot;quotes&quot; for a phrase, -word to leave a word out and by:name or by:ID for one captain.</p>
    {!data ? query && <p role="alert">Enter words to search, or by:name to list a captain&apos;s posts.</p>
      : <>
        <p role="status">{data.total} {data.total === 1 ? "result" : "results"}</p>
        {data.items.length > 0 && <ol className="o-forum-results" aria-label="Search results">{data.items.map(item => <li key={item.post_id}>
          <Link href={forumPermalink(item.post_id)} prefetch={false}>{item.thread.title}</Link>
          <small>#{item.post_number} in <Link href={forumBoardUrl(item.board.id)}>{item.board.name}</Link> by <ForumPersonLink person={item.author} />, <MessageTime value={item.created_at} compact /></small>
          <p>{excerpt(item.excerpt)}</p>
        </li>)}</ol>}
        {pages > 1 && <Pagination page={data.page} pages={pages} href={value => forumSearchUrl(query, { page: value, threads, board })} label="Search result pages" />}
      </>}
  </div>;
}
