import { describe, expect, it } from "vitest";
import { callbackDestination, normalizeCharacterName, validateCharacterName, validateEmail, validatePassword } from "../../src/lib/validation";

describe("character identity", () => {
  it("normalizes Unicode and whitespace before storage", () => {
    expect(normalizeCharacterName("  A\u030asa\t  O'Neill  ")).toBe("Åsa O'Neill");
  });
  it.each(["Alva Storm", "Åsa O'Neill", "Anne-Marie", "Νίκος", "李小龍"])("accepts names written with letters: %s", name => {
    expect(validateCharacterName(name)).toBeUndefined();
  });
  it.each(["7", "x".repeat(80), "Captain123", "<script>", "🚢 Captain", "-Alva", "Alva-", "Alva_Storm"])("accepts unrestricted names: %s", name => {
    expect(validateCharacterName(name)).toBeUndefined();
  });
  it.each(["", " ", "\t\n"])("rejects an empty name: %j", name => {
    expect(validateCharacterName(name)).toBeDefined();
  });
});

describe("account input", () => {
  it("rejects invalid email addresses and mismatched passwords", () => {
    expect(validateEmail("captain@example.com")).toBeUndefined();
    expect(validateEmail("captain@invalid")).toBeDefined();
    expect(validatePassword("short", "different")).toEqual({ password: expect.any(String), confirmPassword: expect.any(String) });
    expect(validatePassword("a-long-sea-passphrase", "a-long-sea-passphrase")).toEqual({});
    expect(validatePassword("abcdef", "abcdef")).toEqual({});
    expect(validatePassword("123456", "123456")).toEqual({});
    expect(validatePassword("", "")).toEqual({ password: expect.any(String) });
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/harbor?next=https://evil.example", null])("keeps callback redirects on the approved route: %s", next => {
    expect(callbackDestination(next)).toBe("/");
  });
  it("allows the password recovery destination", () => {
    expect(callbackDestination("/reset-password")).toBe("/reset-password");
  });
});
