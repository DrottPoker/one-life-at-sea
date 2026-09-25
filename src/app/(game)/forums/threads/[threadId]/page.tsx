import { notFound, redirect } from "next/navigation";
import { ForumBreadcrumbs } from "@/components/forums/forum-lists";
import { ForumThreadView } from "@/components/forums/forum-thread-view";
import { requireCharacter } from "@/lib/player";
import { loadForumThread, locateForumPost } from "@/lib/forums-server";
import { forumBoardUrl, forumPostUrl, isForumId, parseForumPage } from "@/lib/forums";

type Props = { params: Promise<{ threadId: string }>; searchParams: Promise<{ page?: string | string[]; unread?: string | string[] }> };

export async function generateMetadata({ params, searchParams }: Props) {
  const [{ threadId }, { page, unread }] = await Promise.all([params, searchParams]);
  if (!isForumId(threadId) || unread) return { title: "Forums" };
  return { title: (await loadForumThread(threadId, parseForumPage(page))).thread.title + " - Forums" };
}

export default async function ForumThreadPage({ params, searchParams }: Props) {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  const [{ threadId }, { page, unread }] = await Promise.all([params, searchParams]);
  if (!isForumId(threadId)) notFound();
  if (unread === "1") {
    const location = await locateForumPost({ thread_id: threadId });
    redirect(forumPostUrl(location.thread_id, location.post_number));
  }
  const data = await loadForumThread(threadId, parseForumPage(page));
  return <div className="o-forum-content">
    <ForumBreadcrumbs trail={[{ label: data.thread.board.name, href: forumBoardUrl(data.thread.board.id) }, { label: data.thread.title }]} />
    <ForumThreadView key={data.thread.id + ":" + data.page} characterId={character.id} data={data} />
  </div>;
}
