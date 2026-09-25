import { GameLink as Link } from "@/components/game-navigation";
import { Pagination } from "@/components/pagination";
import { ForumBreadcrumbs } from "@/components/forums/forum-lists";
import { ForumModerationTools } from "@/components/forums/forum-moderation-tools";
import { requireCharacter } from "@/lib/player";
import { loadForumModeration, loadForumReports } from "@/lib/forums-server";
import { forumModerationUrl, parseForumPage } from "@/lib/forums";

export const metadata = { title: "Moderation - Forums" };

const views = ["reports", "resolved", "dismissed", "people", "log"] as const;
type View = (typeof views)[number];

export default async function ForumModerationPage({ searchParams }: { searchParams: Promise<{ view?: string | string[]; page?: string | string[] }> }) {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  const params = await searchParams;
  const view: View = views.find(item => item === params.view) ?? "reports";
  const page = parseForumPage(params.page);
  const overview = await loadForumModeration(view === "log" ? page : 0);
  const reports = view === "reports" || view === "resolved" || view === "dismissed" ? await loadForumReports(view === "reports" ? "open" : view, page) : null;
  const pages = reports ? Math.ceil(reports.total / reports.page_size) : view === "log" ? Math.ceil(overview.log_total / overview.page_size) : 1;
  const current = reports ? reports.page : overview.page;
  const tabs: { view: View; label: string }[] = [{ view: "reports", label: `Open reports (${overview.open_reports})` }, { view: "resolved", label: "Resolved" },
    { view: "dismissed", label: "Dismissed" }, { view: "people", label: "Bans and moderators" }, { view: "log", label: "Log" }];
  return <div className="o-forum-content">
    <ForumBreadcrumbs trail={[{ label: "Moderation" }]} />
    <nav className="o-forum-tabs" aria-label="Moderation views">{tabs.map(tab =>
      <Link key={tab.view} href={forumModerationUrl(tab.view)} aria-current={tab.view === view ? "page" : undefined}>{tab.label}</Link>)}</nav>
    <ForumModerationTools key={view + ":" + current} characterId={character.id} view={view} overview={overview} reports={reports} />
    {pages > 1 && <Pagination page={current} pages={pages} href={value => forumModerationUrl(view, value)} label="Moderation pages" />}
  </div>;
}
