import { notFound, redirect } from "next/navigation";
import { attackUrl, isUuid } from "@/lib/combat";

export default async function LegacyAttackPage({ searchParams }: { searchParams: Promise<{ target?: string }> }) {
  const { target } = await searchParams;
  if (!target) redirect("/harbor");
  if (!isUuid(target)) notFound();
  redirect(attackUrl(target));
}
