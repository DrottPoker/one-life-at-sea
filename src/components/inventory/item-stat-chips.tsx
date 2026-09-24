import { Crosshair, Gauge, HeartPulse, Shield, Target, Wind, Zap } from "lucide-react";
import { formatQuality, itemStatRows, type ItemStats } from "@/lib/equipment";

const statIcons = { damage: Zap, precision: Crosshair, shots: Target, armor: Shield, health: HeartPulse, speed: Wind };

// Quality and stats as compact icon values; the full name is in the tooltip and accessible label.
export function ItemStatChips({ stats, limit }: { stats: Partial<ItemStats>; limit?: number }) {
  return <>
    {stats.quality !== undefined && <span title="Quality" aria-label={"Quality " + formatQuality(stats.quality)}><Gauge aria-hidden="true" />{formatQuality(stats.quality)}</span>}
    {itemStatRows(stats).slice(0, limit).map(row => {
      const Icon = statIcons[row.key];
      return <span key={row.key} title={row.label} aria-label={row.label + " " + row.text}><Icon aria-hidden="true" />{row.text}</span>;
    })}
  </>;
}
