import { auth } from "@/config/public";
export type FieldErrors = Partial<Record<"email" | "password" | "confirmPassword" | "name", string>>;
export type FormState = {
  message?: string;
  errors?: FieldErrors;
  email?: string;
  name?: string;
  success?: boolean;
  retryAfter?: number;
};

// Positive bigint ids as the database sends them, as strings within PostgreSQL's bigint range.
export function isBigintId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}

// Unix line endings, trimmed spaces, tabs and newlines; the database applies the same rule to posts and mail.
export function normalizePlainText(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/^[ \t\n]+|[ \t\n]+$/g, "");
}

export function normalizeCharacterName(value: string) {
  return value.normalize("NFC");
}

export function validateCharacterName(value: string): string | undefined {
  const name = normalizeCharacterName(value);
  if (!name.trim()) return "Enter a character name.";
  if (/[\p{N}\p{White_Space}\uFEFF]/u.test(name)) return "Use a character name without numbers or spaces.";
}

export function validateEmail(value: string): string | undefined {
  if (value.length > auth.emailMaxLength || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email address.";
}

export function validatePassword(password: string, confirmation: string): FieldErrors {
  const errors: FieldErrors = {};
  if (password.length < auth.passwordMinLength) errors.password = `Use at least ${auth.passwordMinLength} characters.`;
  else if (password.length > auth.passwordMaxLength) errors.password = `Use no more than ${auth.passwordMaxLength} characters.`;
  if (confirmation !== password) errors.confirmPassword = "The passwords do not match.";
  return errors;
}

export function callbackDestination(value: string | null) {
  return value === "/reset-password" ? "/reset-password" : "/";
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
