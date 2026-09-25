import { Bell, Settings, ShieldCheck, UserRound } from "lucide-react";
import { GameLink as Link } from "@/components/game-navigation";
import { ForumBoardList, ForumPopularList, ForumSearchForm } from "@/components/forums/forum-lists";
import { ForumMarkRead } from "@/components/forums/forum-mark-read";
import { ForumBanNotice } from "@/components/forums/forum-person";
import { requireCharacter } from "@/lib/player";
import { loadForumIndex } from "@/lib/forums-server";
import { forumModerationUrl, forumSearchUrl, forumSettingsUrl, forumSubscriptionsUrl } from "@/lib/forums";

export default async function ForumsPage() {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  const data = await loadForumIndex();
  return <div className="o-forum-content">
    {data.ban && <ForumBanNotice ban={data.ban} />}
    <ForumSearchForm />
    <div className="o-forum-toolbar-row"><div className="o-forum-links">
      <Link href={forumSubscriptionsUrl()}><Bell size={14} aria-hidden="true" /> Subscriptions</Link>
      <Link href={forumSearchUrl("by:" + character.player_number)}><UserRound size={14} aria-hidden="true" /> My posts</Link>
      <Link href={forumSettingsUrl()}><Settings size={14} aria-hidden="true" /> Settings</Link>
      {data.can_moderate && <Link href={forumModerationUrl()}><ShieldCheck size={14} aria-hidden="true" /> Moderation ({data.open_reports ?? 0})</Link>}
    </div><ForumMarkRead characterId={character.id} boardId={null} /></div>
    <ForumPopularList threads={data.popular} />
    <ForumBoardList boards={data.boards} />
  </div>;
}
