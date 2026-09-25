import { Bell, UserRound } from "lucide-react";
import { GameLink as Link } from "@/components/game-navigation";
import { ForumBoardList, ForumSearchForm } from "@/components/forums/forum-lists";
import { ForumMarkRead } from "@/components/forums/forum-mark-read";
import { requireCharacter } from "@/lib/player";
import { loadForumIndex } from "@/lib/forums-server";
import { forumSearchUrl, forumSubscriptionsUrl } from "@/lib/forums";

export default async function ForumsPage() {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  const data = await loadForumIndex();
  return <div className="o-forum-content">
    <ForumSearchForm />
    <div className="o-forum-toolbar-row"><div className="o-forum-links">
      <Link href={forumSubscriptionsUrl()}><Bell size={14} aria-hidden="true" /> Subscriptions</Link>
      <Link href={forumSearchUrl("by:" + character.player_number)}><UserRound size={14} aria-hidden="true" /> My posts</Link>
    </div><ForumMarkRead characterId={character.id} boardId={null} /></div>
    <ForumBoardList boards={data.boards} />
  </div>;
}
