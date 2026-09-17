import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppFrame } from "@/components/app-frame";
import { currentUser, characterForUser, gameStateForPlayer } from "@/lib/player";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "One Life At Sea", template: "%s | One Life At Sea" },
  description: "A name to make. A life to remember. Your journey begins in The Harbor.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  const character = user ? await characterForUser(user.id) : null;
  const state = character ? await gameStateForPlayer() : null;
  return <html lang="en"><body><a href="#main" className="skip-link">Skip to content</a>
    <AppFrame characterId={character?.id ?? null} attack={state?.active_attack ?? null}>{children}</AppFrame>
  </body></html>;
}
