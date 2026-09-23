import { frontend } from "@/config/public";

const format = new Intl.DateTimeFormat(frontend.site.locale, {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: frontend.site.logTimeZone, timeZoneName: "short",
});
const compactFormat = new Intl.DateTimeFormat(frontend.site.locale, {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: frontend.site.logTimeZone,
});
export function MessageTime({ value, compact = false }: { value: string; compact?: boolean }) {
  const date = new Date(value);
  return <time dateTime={value} title={date.toUTCString()}>{(compact ? compactFormat : format).format(date)}</time>;
}
