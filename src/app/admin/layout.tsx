import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/player";
import { AdminRequestJournal } from "@/components/admin/request-journal";
import { requireAdmin } from "@/lib/admin-server";
import "./admin.css";

export const metadata = { title: "Administration" };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  const user = await requireUser();
  return <main id="main" className="admin-shell">
    <header className="admin-header"><h1>Administration</h1><Link href="/harbor">Return to game</Link></header>
    <nav aria-label="Administration" className="admin-nav">
      <Link href="/admin">Overview</Link><Link href="/admin/players">Players</Link>
      <Link href="/admin/database/characters">Database</Link><Link href="/admin/database/admin_audit">Audit log</Link>
    </nav>
    <AdminRequestJournal userId={user.id}>{children}</AdminRequestJournal>
  </main>;
}

