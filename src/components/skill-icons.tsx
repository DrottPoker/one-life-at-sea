import { Axe, CookingPot, Fish, Hammer, Leaf, Ship, Swords, type LucideIcon } from "lucide-react";

// One icon per skill, shared by the profile and the XP drop.
const icons: Record<string, LucideIcon> = { fishing: Fish, logging: Axe, cooking: CookingPot, crafting: Hammer,
  crew_battling: Swords, ship_battling: Ship, foraging: Leaf };

export function SkillIcon({ id, className }: { id: string; className?: string }) {
  const Icon = icons[id] ?? Hammer;
  return <Icon className={className} aria-hidden="true" />;
}
