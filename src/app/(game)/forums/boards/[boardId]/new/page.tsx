import { notFound } from "next/navigation";
import { ForumBreadcrumbs } from "@/components/forums/forum-lists";
import { ForumEditor } from "@/components/forums/forum-editor";
import { requireCharacter } from "@/lib/player";
import { loadForumBoard } from "@/lib/forums-server";
import { forumBoardUrl, isForumBoardId } from "@/lib/forums";

export const metadata = { title: "New thread - Forums" };

export default async function NewForumThreadPage({ params }: { params: Promise<{ boardId: string }> }) {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  const { boardId } = await params;
  if (!isForumBoardId(boardId)) notFound();
  const data = await loadForumBoard(boardId, 0);
  return <div className="o-forum-content">
    <ForumBreadcrumbs trail={[{ label: data.board.name, href: forumBoardUrl(boardId) }, { label: "New thread" }]} />
    <h2 className="o-forum-page-title">New thread in {data.board.name}</h2>
    {data.board.can_post ? <ForumEditor characterId={character.id} target={{ kind: "thread", boardId }} canUploadImages={data.board.can_upload_images} />
      : <p className="o-forum-closed">You cannot start threads in this board.</p>}
  </div>;
}
