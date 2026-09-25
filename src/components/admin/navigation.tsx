"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Package, Dices, Compass, Database, History, ChartNoAxesCombined, MessagesSquare } from "lucide-react";

const links = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/economy", label: "Economy", icon: ChartNoAxesCombined },
  { href: "/admin/players", label: "Players", icon: Users },
  { href: "/admin/items", label: "Items", icon: Package },
  { href: "/admin/loot", label: "Loot tables", icon: Dices },
  { href: "/admin/activities", label: "Activities", icon: Compass },
  { href: "/admin/database/characters", label: "Database", icon: Database },
  { href: "/admin/database/admin_audit", label: "Audit log", icon: History },
  // Forum moderation lives in the game so player moderators share the same tools.
  { href: "/forums/moderation", label: "Forum", icon: MessagesSquare },
];
export function AdminNavigation() {
  const path = usePathname();
  return <nav aria-label="Administration" className="admin-nav">{links.map(({ href, label, icon: Icon }) => {
    const active = href.endsWith("characters") ? path.startsWith("/admin/database/") && !path.endsWith("admin_audit") : href === "/admin" ? path === href : path.startsWith(href);
    return <Link key={href} href={href} aria-current={active ? "page" : undefined}><Icon size={18} aria-hidden="true" />{label}</Link>;
  })}</nav>;
}
