"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Anchor, Store, Hammer } from "lucide-react";

const locations = [
  { href: "/harbor", label: "The Harbor", Icon: Anchor },
  { href: "/harbor/marketplace", label: "Marketplace", Icon: Store },
  { href: "/harbor/shipyard", label: "Shipyard", Icon: Hammer },
];

export function HarborNav() {
  const pathname = usePathname();
  return <nav className="o-location-nav" aria-label="Harbor locations">{locations.map(({ href, label, Icon }) =>
    <Link className="o-nav" key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
      <Icon aria-hidden="true" />{label}<span className="o-nav-tail" aria-hidden="true">›</span>
    </Link>)}
  </nav>;
}
