import { ForumBreadcrumbs } from "@/components/forums/forum-lists";
import { ForumSettingsForm } from "@/components/forums/forum-settings";
import { requireCharacter } from "@/lib/player";
import { loadForumSettings } from "@/lib/forums-server";

export const metadata = { title: "Settings - Forums" };

export default async function ForumSettingsPage() {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  const settings = await loadForumSettings();
  return <div className="o-forum-content">
    <ForumBreadcrumbs trail={[{ label: "Settings" }]} />
    <h2 className="o-forum-page-title">Forum settings</h2>
    <ForumSettingsForm characterId={character.id} settings={settings} />
  </div>;
}
