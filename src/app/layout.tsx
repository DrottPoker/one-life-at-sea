import { frontend } from "@/config/public";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { currentUserIsAdmin } from "@/lib/admin-server";
import { AppFrame } from "@/components/app-frame";
import { WorldClock } from "@/components/world-clock";
import { currentWorldTime } from "@/lib/world-time-server";
import { currentUser, characterForUser, gameStateForPlayer } from "@/lib/player";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: frontend.site.name, template: "%s | " + frontend.site.name },
  description: frontend.site.description,
  robots: { index: frontend.site.allowSearchIndexing, follow: frontend.site.allowSearchIndexing },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  const [isAdmin, character] = user
    ? await Promise.all([currentUserIsAdmin(), characterForUser(user.id)])
    : [false, null] as const;
  const state = character ? await gameStateForPlayer() : null;
  const worldTime = await currentWorldTime();
  return <html lang={frontend.site.language}><body data-day-period={worldTime.period}><WorldClock initialTime={worldTime} /><a href="#main" className="skip-link">Skip to content</a>
    <AppFrame accountId={user?.id ?? null} seaState={state?.sea.state ?? null} isAdmin={isAdmin} hospitalUntil={state?.hospital_until ?? null} characterId={character?.id ?? null} attack={state?.active_attack ?? null}>{children}</AppFrame>
  </body></html>;
}
