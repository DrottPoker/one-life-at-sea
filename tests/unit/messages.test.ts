import { describe, expect, it, vi } from "vitest";
import { gameplay } from "../../src/config/public";
import { isMessageId, isMessagesPath, messageDraftKey, normalizeMessage, parsePendingMessage, validMessage, parsePendingMail, mailDraftKey, validRecipients, validSubject, replySubject, mailDetailUrl, parseMailView } from "../../src/lib/messages";
import { isHospitalAccessiblePath } from "../../src/lib/hospital";
import { isSeaAccessiblePath } from "../../src/lib/sea-travel";
import { navigationRedirect } from "../../src/lib/game-navigation";

const mocks = vi.hoisted(() => ({ requireCharacter: vi.fn(), createClient: vi.fn() }));
vi.mock("@/lib/player", () => ({ requireCharacter: mocks.requireCharacter }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { sendMail, updateMail, setMailIgnored } from "../../src/app/message-actions";

describe("private messages", () => {
  it("retains the folder, encoded search and page when opening a letter", () => {
    const url = new URL(mailDetailUrl("9223372036854775807", "saved", "ocean & harbor?", 3, true), "https://example.test");
    expect(url.pathname).toBe("/messages/mail/9223372036854775807");
    expect(Object.fromEntries(url.searchParams)).toEqual({ folder: "saved", q: "ocean & harbor?", page: "3", history: "1" });
    expect(parseMailView({ folder: ["saved"], q: ["private"], page: "-1" })).toEqual({ folder: "inbox", query: "", page: 0 });
    expect(parseMailView({ folder: "outbox", q: "x".repeat(250), page: "10000000" })).toEqual({ folder: "outbox", query: "x".repeat(200), page: 0 });
  });
  it("preserves multiline text and literal markup", () => {
    expect(normalizeMessage("  Hello\r\n<script>text</script> ")).toBe("Hello\n<script>text</script>");
    expect(validMessage("<script>text</script>")).toBe(true);
    expect(validMessage("Hej! ".repeat(3))).toBe(true);
  });
  it("enforces nonempty text, character limits and safe controls", () => {
    for (const value of [null, {}, " \n\t", "x".repeat(gameplay.messages.maxLength + 1), "\u0000", "\u0001", "\u007f"]) expect(validMessage(value)).toBe(false);
    expect(validMessage("x".repeat(gameplay.messages.maxLength))).toBe(true);
    expect(validMessage("\nA\tB")).toBe(true);
    expect(validMessage("\u{1F600}".repeat(gameplay.messages.maxLength))).toBe(true);
  });
  it("uses exact bigint cursors and strict routes", () => {
    for (const id of ["1", "9007199254740992", "9223372036854775807"]) expect(isMessageId(id)).toBe(true);
    for (const id of ["0", "01", "9223372036854775808", "1e2", null, 1]) expect(isMessageId(id)).toBe(false);
    for (const path of ["/messages", "/messages/compose", "/messages/ignore", "/messages/mail/9223372036854775807", "/messages/100001", "/messages/9007199254740991"]) {
      expect(isMessagesPath(path)).toBe(true);
      expect(isHospitalAccessiblePath(path)).toBe(true);
      expect(isSeaAccessiblePath(path, "at_sea")).toBe(true);
      expect(isSeaAccessiblePath(path, "traveling")).toBe(true);
    }
    for (const path of ["/messages/", "/messages/nope", "/messages/mail/0", "/messages/compose/edit", "/messages/100001/edit", "/messages-elsewhere"]) expect(isMessagesPath(path)).toBe(false);
    expect(navigationRedirect("/messages", { attack: { battle_id: "test", target_id: "target", target_player_number: 100002 }, hospital_until: null, sea_state: "in_harbor" })).toBe("/attack/100002");
  });
  it("binds pending retries to the character and recipient", () => {
    const value = { id: "afff0000-0000-4000-8000-000000000011", body: "Retry safely" };
    expect(parsePendingMessage(JSON.stringify(value))).toEqual(value);
    expect(parsePendingMessage(null)).toBeNull();
    for (const raw of ["unavailable", "{}", JSON.stringify({ ...value, id: "bad" }), JSON.stringify({ ...value, body: " " })]) expect(() => parsePendingMessage(raw)).toThrow();
    expect(messageDraftKey("first",100001)).not.toBe(messageDraftKey("second",100001));
    expect(messageDraftKey("first",100001)).not.toBe(messageDraftKey("first",100002));
  });
  it("rejects stale-account send and read actions before touching the database", async () => {
    mocks.requireCharacter.mockResolvedValue({ id: "new-character" });
    expect(await sendMail("old-character",{ id: "afff0000-0000-4000-8000-000000000011", recipients: [{ player_number: 100001, display_name: "Captain" }], subject: "Hello", body: "Hi", replyTo: null })).toMatchObject({ retry: true });
    expect(await updateMail("old-character",["1"],"read")).toContain("changed");
    expect(await setMailIgnored("old-character",100001,true)).toContain("changed");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("validates multi-recipient drafts and bounded reply subjects", () => {
    const value = { id: "afff0000-0000-4000-8000-000000000011", body: "Private", subject: "Subject", recipients: [{ player_number: 100001, display_name: "Captain" }], replyTo: null };
    expect(parsePendingMail(JSON.stringify(value))).toEqual(value);
    expect(parsePendingMail(null)).toBeNull();
    expect(mailDraftKey("first")).not.toBe(mailDraftKey("second"));
    for (const recipients of [[], [value.recipients[0], value.recipients[0]], [{ player_number: "100001", display_name: "Captain" }], Array.from({ length: gameplay.messages.maxRecipients + 1 }, (_, index) => ({ player_number: 100001 + index, display_name: "Captain" }))]) expect(validRecipients(recipients)).toBe(false);
    expect(validSubject("")).toBe(true);
    expect(validSubject("Two\nlines")).toBe(false);
    expect(validSubject("x".repeat(gameplay.messages.subjectMaxLength + 1))).toBe(false);
    expect(replySubject("Re: Existing")).toBe("Re: Existing");
    expect(replySubject("")).toBe("Re: No subject");
    expect(Array.from(replySubject("x".repeat(120))).length).toBeLessThanOrEqual(gameplay.messages.subjectMaxLength);
    for (const bad of [{ ...value, replyTo: "0" }, { ...value, recipients: [] }, { ...value, subject: "bad\nsubject" }]) expect(() => parsePendingMail(JSON.stringify(bad))).toThrow();
  });

  it("limits new mail to ten recipients while preserving older pending receipts", () => {
    const recipients = Array.from({ length: 20 }, (_, index) => ({ player_number: 100001 + index, display_name: "Captain" + index }));
    expect(validRecipients(recipients.slice(0, 10))).toBe(true);
    expect(validRecipients(recipients.slice(0, 11))).toBe(false);
    const pending = { id: "afff0000-0000-4000-8000-000000000011", body: "Already submitted", subject: "Older mail", recipients, replyTo: null };
    expect(parsePendingMail(JSON.stringify(pending))).toEqual(pending);
  });

});
