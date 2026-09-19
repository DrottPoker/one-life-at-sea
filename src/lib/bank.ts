import { frontend, gameplay } from "@/config/public";

export type BankDirection = "deposit" | "withdraw";
export type BankTransfer = {
  direction: BankDirection;
  amount: number;
  gold_coins: number;
  bank_gold_coins: number;
};
export type BankActionResult = { message?: string; error?: boolean; retry?: boolean };

export function isBankDirection(value: unknown): value is BankDirection {
  return value === "deposit" || value === "withdraw";
}

export function parseGoldAmount(value: unknown): number | null {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value) || value.length > 16) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= gameplay.economy.maxGoldCoins ? amount : null;
}

export function formatGold(amount: number): string {
  return new Intl.NumberFormat(frontend.site.locale, { maximumFractionDigits: 0 }).format(amount);
}
