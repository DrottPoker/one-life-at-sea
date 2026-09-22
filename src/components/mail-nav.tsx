"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { GameLink as Link } from "@/components/game-navigation";
import type { MailSummary } from "@/lib/messages";

export function MailNav({ summary }: { summary: MailSummary }) {
  const path = usePathname(), params = useSearchParams();
  const active = path === "/messages/compose" ? "compose" : path === "/messages/ignore" ? "ignore" : params.get("folder") || "inbox";
  const tabs = [
    { id: "inbox", label: `Inbox (${summary.inbox})`, href: "/messages" },
    { id: "compose", label: "Compose", href: "/messages/compose" },
    { id: "outbox", label: `Outbox (${summary.outbox})`, href: "/messages?folder=outbox" },
    { id: "saved", label: `Saved (${summary.saved})`, href: "/messages?folder=saved" },
    { id: "ignore", label: `Ignore list (${summary.ignored})`, href: "/messages/ignore" },
  ];
  return <nav className="o-mail-tabs" aria-label="Mail folders">{tabs.map(tab => <Link key={tab.id} href={tab.href} aria-current={tab.id === active ? "page" : undefined}>{tab.label}</Link>)}</nav>;
}
