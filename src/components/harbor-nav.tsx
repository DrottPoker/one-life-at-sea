"use client";

import { GameLink as Link, useNavigationPathname } from "@/components/game-navigation";
import { Utensils, Anchor, Store, Hammer, Swords, Ship, Landmark, HeartPulse, Package, Compass, Users } from "lucide-react";

import { useGameState } from "@/components/game-state";
import { isHospitalAccessiblePath } from "@/lib/hospital";
import { isSeaAccessiblePath } from "@/lib/sea-travel";

const locations = [
  { href: "/players", label: "Players", Icon: Users },
  { href: "/sea", label: "At Sea", Icon: Compass },
  { href: "/harbor", label: "The Harbor", Icon: Anchor },
  { href: "/inventory", label: "Inventory", Icon: Package },
  { href: "/harbor/crew-training", label: "Crew Training", Icon: Swords },
  { href: "/harbor/ship-upgrades", label: "Ship Upgrades", Icon: Ship },
  { href: "/harbor/hospital", label: "Hospital", Icon: HeartPulse },
  { href: "/harbor/tavern", label: "Tavern", Icon: Utensils },
  { href: "/harbor/bank", label: "Bank", Icon: Landmark },
  { href: "/harbor/marketplace", label: "Marketplace", Icon: Store },
  { href: "/harbor/shipyard", label: "Shipyard", Icon: Hammer },
];

export function HarborNav() {
  const pathname = useNavigationPathname();
  const state = useGameState();
  return <nav className="o-location-nav" aria-label="Harbor locations">{locations.filter(item => item.href !== "/sea" || state.sea.state !== "in_harbor").map(({ href, label, Icon }) =>
    (state.hospital_until && !isHospitalAccessiblePath(href)) || !isSeaAccessiblePath(href, state.sea.state) ? <span className="o-nav" aria-disabled="true" key={href}><span className="o-nav-symbol"><Icon aria-hidden="true" /></span>{label}</span> :
    <Link className="o-nav" key={href} href={href} prefetch="auto" aria-current={pathname === href || (href === "/harbor/marketplace" && pathname.startsWith(href + "/")) ? "page" : undefined}>
      <span className="o-nav-symbol" aria-hidden="true"><Icon /></span>{label}<span className="o-nav-tail" aria-hidden="true">›</span>
    </Link>)}
  </nav>;
}
