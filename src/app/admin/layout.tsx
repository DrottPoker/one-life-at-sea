import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/player";
import { AdminRequestJournal } from "@/components/admin/request-journal";
import { requireAdmin } from "@/lib/admin-server";
import { AdminNavigation } from "@/components/admin/navigation";
import "./admin.css";

export const metadata = { title: "Administration" };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  const user = await requireUser();
  return <main id="main" className="admin-shell">
    <header className="admin-header"><h1>Administration</h1><Link href="/harbor">Return to game</Link></header>
    <AdminNavigation />
    <div className="admin-content"><AdminRequestJournal key={user.id} userId={user.id}>{children}</AdminRequestJournal></div>
  </main>;
}

