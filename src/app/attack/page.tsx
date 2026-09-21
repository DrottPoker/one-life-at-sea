import { notFound, redirect } from "next/navigation";
import { attackUrl } from "@/lib/combat";
import { isPlayerNumber } from "@/lib/player-identity";
import { isUuid } from "@/lib/validation";

export default async function LegacyAttackPage({ searchParams }: { searchParams: Promise<{ target?: string }> }) {
  const { target } = await searchParams;
  if (!target) redirect("/harbor");
  if (!isUuid(target) && !isPlayerNumber(target)) notFound();
  redirect(attackUrl(target));
}
