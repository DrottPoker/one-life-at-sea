import { frontend } from "@/config/public";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppFrame } from "@/components/app-frame";
import { currentUser, characterForUser, gameStateForPlayer } from "@/lib/player";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: frontend.site.name, template: "%s | " + frontend.site.name },
  description: frontend.site.description,
  robots: { index: frontend.site.allowSearchIndexing, follow: frontend.site.allowSearchIndexing },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  const character = user ? await characterForUser(user.id) : null;
  const state = character ? await gameStateForPlayer() : null;
  return <html lang={frontend.site.language}><body><a href="#main" className="skip-link">Skip to content</a>
    <AppFrame characterId={character?.id ?? null} attack={state?.active_attack ?? null}>{children}</AppFrame>
  </body></html>;
}
