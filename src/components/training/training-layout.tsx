import Image from "next/image";
import type { ReactNode } from "react";
import { BookOpen, type LucideIcon } from "lucide-react";
import { formatStat } from "@/lib/format";
import { STAT_LABELS, type Stat } from "@/lib/game";

export type TrainingOverviewItem = { label: string; value: ReactNode; Icon: LucideIcon };
export type TrainingGuideItem = { title: string; text: ReactNode; Icon: LucideIcon };

export function TrainingOverview({ label, items }: { label: string; items: TrainingOverviewItem[] }) {
  return <dl className="o-training-summary" aria-label={label}>{items.map(({ label, value, Icon }) =>
    <div key={label}><dt><Icon aria-hidden="true" /><span>{label}</span></dt><dd>{value}</dd></div>
  )}</dl>;
}

export function TrainingStatCard({ stat, value, description, image, label, selected, children }: {
  stat: Stat; value: number; description: string; image: string; label: string; selected?: boolean; children: ReactNode;
}) {
  return <section className="o-training-stat" data-stat={stat} data-selected={selected} aria-label={label}>
    <Image className="o-training-stat-art" src={image} alt="" width={110} height={110} />
    <h2>{STAT_LABELS[stat]}</h2>
    <output className="o-training-stat-value" aria-label={STAT_LABELS[stat] + " stat"}>{formatStat(value)}</output>
    <p className="o-training-stat-description">{description}</p>
    {children}
  </section>;
}

// Shared card body: cost note, a reserved one-line result slot and the card action, so every card keeps the same height.
export function TrainingStatBody({ note, resultLabel, result, children }: { note: string; resultLabel: string; result: ReactNode; children: ReactNode }) {
  return <>
    <small className="o-training-energy-cost">{note}</small>
    <div className="o-training-result" role="status" aria-label={resultLabel} aria-atomic="true">{result}</div>
    {children}
  </>;
}

export function TrainingGuide({ title, items }: { title: string; items: TrainingGuideItem[] }) {
  return <section className="o-training-guide" aria-label={title}>
    <header className="o-training-section-heading"><BookOpen aria-hidden="true" /><h2>{title}</h2></header>
    <ul>{items.map(({ title, text, Icon }) => <li key={title}><Icon aria-hidden="true" /><div><h3>{title}</h3><p>{text}</p></div></li>)}</ul>
  </section>;
}
