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

export function normalizeCharacterName(value: string) {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

export function validateCharacterName(value: string): string | undefined {
  const name = normalizeCharacterName(value);
  if (!name) return "Enter a character name.";
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
