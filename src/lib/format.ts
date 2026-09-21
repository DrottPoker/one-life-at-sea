import { frontend } from "@/config/public";

const decimalFormatter = new Intl.NumberFormat(frontend.site.locale, { maximumFractionDigits: 2 });
const wholeFormatter = new Intl.NumberFormat(frontend.site.locale, { maximumFractionDigits: 0 });

export function formatStat(value: number): string {
  return (value >= 10_000 ? wholeFormatter : decimalFormatter).format(value);
}

export function formatStatGain(value: number): string {
  return decimalFormatter.format(value);
}
