import { gameplay } from "@/config/public";
import { readAllAdminRows } from "@/lib/admin-server";
import { ActivityLootEditor } from "@/components/admin/activity-loot-editor";

export default async function AdminActivities() {
  const [tables, bindings] = await Promise.all([readAllAdminRows("loot_tables"), readAllAdminRows("activity_loot")]);
  return <><div className="admin-page-heading"><div><h2>Activities</h2><p>Choose rewards and difficulty for each activity. Tables can be reused across different locations.</p></div></div>
    {gameplay.activities.catalog.map(activity => { const binding = bindings.find(row => row.values.activity_id === activity.id); return <ActivityLootEditor key={activity.id + (binding?.version ?? "new")} activityId={activity.id} initial={binding} tables={tables} />; })}
  </>;
}
