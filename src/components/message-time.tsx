import { frontend } from "@/config/public";
const format = new Intl.DateTimeFormat(frontend.site.locale, {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: frontend.site.logTimeZone, timeZoneName: "short",
});
export function MessageTime({ value }: { value: string }) {
  return <time dateTime={value} title={new Date(value).toUTCString()}>{format.format(new Date(value))}</time>;
}
