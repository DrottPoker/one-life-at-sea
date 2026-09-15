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
  if ([...name].length < 3 || [...name].length > 24) return "Use 3-24 characters for your name.";
  if (!/^[\p{L}][\p{L} '\-]*[\p{L}]$/u.test(name)) {
    return "Use letters, spaces, hyphens or apostrophes. Begin and end with a letter.";
  }
}

export function validateEmail(value: string): string | undefined {
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email address.";
}

export function validatePassword(password: string, confirmation: string): FieldErrors {
  const errors: FieldErrors = {};
  if (password.length < 12 || password.length > 128) errors.password = "Use a password with 12-128 characters.";
  if (confirmation !== password) errors.confirmPassword = "The passwords do not match.";
  return errors;
}

export function callbackDestination(value: string | null) {
  return value === "/reset-password" ? "/reset-password" : "/";
}
