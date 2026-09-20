import type { ReactNode } from "react";
import { MarketShell } from "@/components/marketplace/market-shell";

export default function MarketplaceLayout({ children }: { children: ReactNode }) {
  return <MarketShell>{children}</MarketShell>;
}
