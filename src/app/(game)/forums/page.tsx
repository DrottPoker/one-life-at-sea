import { ForumBoardList } from "@/components/forums/forum-lists";
import { ForumMarkRead } from "@/components/forums/forum-mark-read";
import { requireCharacter } from "@/lib/player";
import { loadForumIndex } from "@/lib/forums-server";

export default async function ForumsPage() {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  const data = await loadForumIndex();
  return <div className="o-forum-content">
    <div className="o-forum-toolbar-row"><p className="o-copy">Choose a board to read and join the discussion.</p><ForumMarkRead characterId={character.id} boardId={null} /></div>
    <ForumBoardList boards={data.boards} />
  </div>;
}
