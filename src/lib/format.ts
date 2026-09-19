import { frontend } from "@/config/public";

const statFormatter = new Intl.NumberFormat(frontend.site.locale, { maximumFractionDigits: 6 });

export function formatStat(value: number): string {
  return statFormatter.format(value);
}
