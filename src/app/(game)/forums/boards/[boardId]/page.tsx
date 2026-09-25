import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { GameLink as Link } from "@/components/game-navigation";
import { Pagination } from "@/components/pagination";
import { ForumBreadcrumbs, ForumSearchForm, ForumThreadList } from "@/components/forums/forum-lists";
import { ForumMarkRead } from "@/components/forums/forum-mark-read";
import { ForumBanNotice } from "@/components/forums/forum-person";
import { requireCharacter } from "@/lib/player";
import { loadForumBoard } from "@/lib/forums-server";
import { forumBoardUrl, forumNewThreadUrl, isForumBoardId, parseForumPage } from "@/lib/forums";

type Props = { params: Promise<{ boardId: string }>; searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata({ params, searchParams }: Props) {
  const [{ boardId }, { page }] = await Promise.all([params, searchParams]);
  if (!isForumBoardId(boardId)) return { title: "Forums" };
  return { title: (await loadForumBoard(boardId, parseForumPage(page))).board.name + " - Forums" };
}

export default async function ForumBoardPage({ params, searchParams }: Props) {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  const [{ boardId }, { page }] = await Promise.all([params, searchParams]);
  if (!isForumBoardId(boardId)) notFound();
  const data = await loadForumBoard(boardId, parseForumPage(page));
  const pages = Math.max(1, Math.ceil(data.total / data.page_size));
  const pager = pages > 1 && <Pagination page={data.page} pages={pages} href={value => forumBoardUrl(boardId, value)} label="Board pages" />;
  return <div className="o-forum-content">
    <ForumBreadcrumbs trail={[{ label: data.board.name }]} />
    <div className="o-forum-board-head">
      <div><h2>{data.board.name}</h2><p className="o-copy">{data.board.description}</p></div>
      <div className="o-forum-board-actions"><ForumMarkRead characterId={character.id} boardId={boardId} />
        {data.board.can_post && <Link className="o-primary" href={forumNewThreadUrl(boardId)}><Plus size={16} aria-hidden="true" />New thread</Link>}</div>
    </div>
    {data.ban && <ForumBanNotice ban={data.ban} />}
    <ForumSearchForm board={boardId} />
    {data.board.posting === "moderators" && <p className="o-forum-closed">Only moderators start threads here.</p>}
    {data.board.posting === "closed" && <p className="o-forum-closed">Retired threads are kept here for reference. They cannot receive new posts.</p>}
    {pager}
    {data.items.length ? <ForumThreadList threads={data.items} /> : <p className="o-panel-body o-copy">No threads yet.{data.board.can_post && " Start the first one."}</p>}
    {pager}
  </div>;
}
