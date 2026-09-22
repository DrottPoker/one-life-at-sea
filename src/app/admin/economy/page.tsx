import { requireAdmin } from "@/lib/admin-server";
import { createClient } from "@/lib/supabase/server";
import { EconomyDashboardView } from "@/components/admin/economy-dashboard";

export default async function AdminEconomyPage() {
  await requireAdmin();
  const { data, error } = await (await createClient()).rpc("admin_economy");
  if (error || !data) throw new Error("The economy overview could not be loaded.");
  return <EconomyDashboardView initial={data} />;
}
