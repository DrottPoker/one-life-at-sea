import { Bomb, Boxes, CircleDot, Compass, Cross, FlaskConical, Package, Sailboat, Shield, Swords, type LucideIcon } from "lucide-react";

// Icons for the configured item category icon names, shared by Inventory and Marketplace.
const icons: Record<string, LucideIcon> = {
  swords: Swords, shield: Shield, cannon: CircleDot, sail: Sailboat, bomb: Bomb, cross: Cross, flask: FlaskConical, boxes: Boxes, compass: Compass,
};
export const categoryIcon = (name: string) => icons[name] ?? Package;
