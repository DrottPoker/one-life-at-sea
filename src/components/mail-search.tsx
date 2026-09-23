"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { useNavigationActivity } from "@/components/game-refresh";
import { mailUrl, parseMailView } from "@/lib/messages";

export function MailSearch() {
  const params = useSearchParams(), router = useRouter();
  const [pending, start] = useTransition();
  const { folder, query } = parseMailView({ folder: params.get("folder"), q: params.get("q") });
  useNavigationActivity(pending);
  function find(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("q");
    start(() => router.push(mailUrl(folder, typeof value === "string" ? value.trim() : "")));
  }
  return <form className="o-mail-search" onSubmit={find} role="search" aria-busy={pending}>
    <input key={folder + ":" + query} name="q" aria-label="Search mail" placeholder="Search mail..." maxLength={200} defaultValue={query} />
    <button type="submit" aria-label="Search" disabled={pending}><Search size={18} aria-hidden="true" /></button>
    {query && <Link href={mailUrl(folder)} aria-label="Clear search"><X size={16} aria-hidden="true" /></Link>}
  </form>;
}
