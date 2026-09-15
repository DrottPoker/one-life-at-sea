import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Masthead } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "One Life At Sea", template: "%s | One Life At Sea" },
  description: "A name to make. A life to remember. Your journey begins in The Harbor.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><a href="#main" className="skip-link">Skip to content</a>
    <div className="game-shell"><Masthead />{children}<footer className="o-bottom"><span>One Life At Sea</span><span>A life to remember.</span></footer></div>
  </body></html>;
}
