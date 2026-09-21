import { describe, expect, it } from "vitest";
import { callbackDestination, normalizeCharacterName, validateCharacterName, validateEmail, validatePassword } from "../../src/lib/validation";

describe("character identity", () => {
  it("normalizes Unicode without silently removing forbidden whitespace", () => {
    expect(normalizeCharacterName("A\u030asa")).toBe("Åsa");
    expect(normalizeCharacterName(" Alva ")).toBe(" Alva ");
  });
  it.each(["Alva", "ÅsaO'Neill", "Anne-Marie", "Νίκος", "李小龍", "x", "x".repeat(80), "<script>", "🚢Captain", "-Alva", "Alva-", "Alva_Storm"])("accepts names without numbers or spaces: %s", name => {
    expect(validateCharacterName(name)).toBeUndefined();
  });
  it.each(["7", "Captain123", "Alva Storm", " Alva", "Alva ", "Alva\tStorm", "Alva\nStorm", "Alva\u00a0Storm",
    "Alva\u202fStorm", "Alva\u0085Storm", "Alva\uFEFFStorm", "Captain١", "Captain１", "Captain²", "CaptainⅣ"])("rejects numbers and whitespace: %j", name => {
    expect(validateCharacterName(name)).toBe("Use a character name without numbers or spaces.");
  });
  it.each(["", " ", "\t\n"])("rejects an empty name: %j", name => {
    expect(validateCharacterName(name)).toBe("Enter a character name.");
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
