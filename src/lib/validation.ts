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
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email address.";
}

export function validatePassword(password: string, confirmation: string): FieldErrors {
  const errors: FieldErrors = {};
  if (password.length < 6) errors.password = "Use at least 6 characters.";
  else if (password.length > 128) errors.password = "Use no more than 128 characters.";
  if (confirmation !== password) errors.confirmPassword = "The passwords do not match.";
  return errors;
}

export function callbackDestination(value: string | null) {
  return value === "/reset-password" ? "/reset-password" : "/";
}
