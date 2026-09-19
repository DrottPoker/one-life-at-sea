"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Anchor, Store, Hammer, Swords, Ship, Landmark, HeartPulse, Package, type LucideIcon } from "lucide-react";

import { useGameState } from "@/components/game-state";
import { isHospitalAccessiblePath } from "@/lib/hospital";

const locations = [
  { href: "/harbor", label: "The Harbor", Icon: Anchor },
  { href: "/inventory", label: "Inventory", Icon: Package },
  { href: "/harbor/crew-training", label: "Crew Training", Icon: Swords },
  { href: "/harbor/ship-upgrades", label: "Ship Upgrades", Icon: Ship },
  { href: "/harbor/hospital", label: "Hospital", Icon: HeartPulse },
  { href: "/harbor/bank", label: "Bank", Icon: Landmark },
  { href: "/harbor/marketplace", label: "Marketplace", Icon: Store },
  { href: "/harbor/shipyard", label: "Shipyard", Icon: Hammer },
];

function NavigationIcon({ Icon }: { Icon: LucideIcon }) {
  const { pending } = useLinkStatus();
  return <span className="o-nav-symbol" data-pending={pending} aria-hidden="true">
    <Icon />
    {pending && <span className="o-spinner" />}
  </span>;
}

export function HarborNav() {
  const pathname = usePathname();
  const state = useGameState();
  return <nav className="o-location-nav" aria-label="Harbor locations">{locations.map(({ href, label, Icon }) =>
    state.hospital_until && !isHospitalAccessiblePath(href) ? <span className="o-nav" aria-disabled="true" key={href}><span className="o-nav-symbol"><Icon aria-hidden="true" /></span>{label}</span> :
    <Link className="o-nav" key={href} href={href} prefetch="auto" aria-current={pathname === href ? "page" : undefined}>
      <NavigationIcon Icon={Icon} />{label}<span className="o-nav-tail" aria-hidden="true">›</span>
    </Link>)}
  </nav>;
}
