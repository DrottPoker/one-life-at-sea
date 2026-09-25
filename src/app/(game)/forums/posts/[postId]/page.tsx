import { notFound, redirect } from "next/navigation";
import { requireCharacter } from "@/lib/player";
import { locateForumPost } from "@/lib/forums-server";
import { forumPostUrl, isForumId } from "@/lib/forums";

// Permalinks survive page size changes because the page is found from the post number.
export default async function ForumPostPage({ params }: { params: Promise<{ postId: string }> }) {
  await requireCharacter({ allowHospital: true, allowSea: true });
  const { postId } = await params;
  if (!isForumId(postId)) notFound();
  const location = await locateForumPost({ post_id: postId });
  redirect(forumPostUrl(location.thread_id, location.post_number));
}
