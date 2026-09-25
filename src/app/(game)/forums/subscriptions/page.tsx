import { Pagination } from "@/components/pagination";
import { ForumBreadcrumbs } from "@/components/forums/forum-lists";
import { ForumSubscriptionList } from "@/components/forums/forum-subscriptions";
import { requireCharacter } from "@/lib/player";
import { loadForumSubscriptions } from "@/lib/forums-server";
import { forumSubscriptionsUrl, parseForumPage } from "@/lib/forums";

export const metadata = { title: "Subscriptions - Forums" };

export default async function ForumSubscriptionsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  const data = await loadForumSubscriptions(parseForumPage((await searchParams).page));
  const pages = Math.max(1, Math.ceil(data.total / data.page_size));
  return <div className="o-forum-content">
    <ForumBreadcrumbs trail={[{ label: "Subscriptions" }]} />
    <h2 className="o-forum-page-title">Subscribed threads</h2>
    <p className="o-copy">Threads you start or reply to are added automatically. You get one notification per thread until you read the new posts.</p>
    {data.items.length ? <ForumSubscriptionList characterId={character.id} items={data.items} /> : <p className="o-copy">You are not subscribed to any threads.</p>}
    {pages > 1 && <Pagination page={data.page} pages={pages} href={forumSubscriptionsUrl} label="Subscription pages" />}
  </div>;
}
