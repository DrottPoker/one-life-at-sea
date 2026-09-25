import { gameplay } from "@/config/public";

export type Portrait = (typeof gameplay.portraits.catalog)[number];
export const PORTRAITS: readonly Portrait[] = gameplay.portraits.catalog;

export function isPortraitId(value: unknown): value is string {
  return typeof value === "string" && PORTRAITS.some(portrait => portrait.id === value);
}

// Config validation guarantees the default exists; an unknown ID shows the default portrait.
export function portraitFor(id: string | null | undefined): Portrait {
  return PORTRAITS.find(portrait => portrait.id === id) ?? PORTRAITS.find(portrait => portrait.id === gameplay.portraits.defaultId)!;
}
