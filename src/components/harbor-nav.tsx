"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Anchor, Store, Hammer, Swords, Ship, type LucideIcon } from "lucide-react";

const locations = [
  { href: "/harbor", label: "The Harbor", Icon: Anchor },
  { href: "/harbor/crew-training", label: "Crew Training", Icon: Swords },
  { href: "/harbor/ship-upgrades", label: "Ship Upgrades", Icon: Ship },
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
  return <nav className="o-location-nav" aria-label="Harbor locations">{locations.map(({ href, label, Icon }) =>
    <Link className="o-nav" key={href} href={href} prefetch="auto" aria-current={pathname === href ? "page" : undefined}>
      <NavigationIcon Icon={Icon} />{label}<span className="o-nav-tail" aria-hidden="true">›</span>
    </Link>)}
  </nav>;
}
