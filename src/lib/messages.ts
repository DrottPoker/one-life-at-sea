import { gameplay } from "@/config/public";
import { isPlayerNumber } from "@/lib/player-identity";
import { isUuid } from "@/lib/validation";

// Retain the supported request bound when confirming older, larger sends.
export const MAX_MAIL_REQUEST_RECIPIENTS = 50;

export type MessageSummary = { unread_count: number };
export type MailPerson = { player_number: number; display_name: string };
export type MailFolder = "inbox" | "outbox" | "saved";
export type MailOperation = "read" | "unread" | "save" | "unsave" | "delete";
export type MailSummary = MessageSummary & { inbox: number; outbox: number; saved: number; ignored: number };
export type MailItem = { id: string; subject: string; sender: MailPerson; recipients: MailPerson[]; direction: "inbox" | "outbox"; sent_at: string; read_at: string | null; saved: boolean; can_reply: boolean; reply_to_id: string | null };
export type MailDetail = MailItem & { body: string; history: (MailItem & { body: string })[] };
export type MailPage = { items: MailItem[]; total: number; page: number; page_size: number };
export type MailReceipt = { mail_id: string; recipient_count: number; sent_at: string };
export type PendingMessage = { id: string; body: string };
export type PendingMail = PendingMessage & { recipients: MailPerson[]; subject: string; replyTo: string | null };
export type MailResult = { error?: string; retry?: boolean; receipt?: MailReceipt };

export function isMessageId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}
export function isMessagesPath(path: string) {
  return ["/messages", "/messages/compose", "/messages/ignore"].includes(path) ||
    (path.startsWith("/messages/mail/") && isMessageId(path.slice(15))) ||
    (path.startsWith("/messages/") && isPlayerNumber(path.slice(10)));
}
export function normalizeMessage(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/^[ \t\n]+|[ \t\n]+$/g, "");
}
export function validMessage(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || Array.from(value).length > gameplay.messages.maxLength) return false;
  return !Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10) || code === 127;
  });
}
export function messageDraftKey(characterId: string, playerNumber: number) {
  return "pending-message:" + characterId + ":" + playerNumber;
}
export function parsePendingMessage(raw: string | null): PendingMessage | null {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !("id" in value) || !("body" in value) || !isUuid(value.id) || !validMessage(value.body)) throw new Error("Invalid saved message.");
  return { id: value.id, body: value.body };
}

export function validSubject(value: unknown): value is string {
  return typeof value === "string" && Array.from(value).length <= gameplay.messages.subjectMaxLength &&
    !Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}
export function validRecipients(value: unknown, limit = gameplay.messages.maxRecipients): value is MailPerson[] {
  return Array.isArray(value) && value.length > 0 && value.length <= limit &&
    value.every(item => item && typeof item.player_number === "number" && isPlayerNumber(String(item.player_number)) && typeof item.display_name === "string") &&
    new Set(value.map(item => item.player_number)).size === value.length;
}
export function mailDraftKey(characterId: string) { return "pending-mail:" + characterId; }
export function parsePendingMail(raw: string | null): PendingMail | null {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !("id" in value) || !isUuid(value.id) || !("body" in value) || !validMessage(value.body) ||
    !("subject" in value) || !validSubject(value.subject) || !("recipients" in value) || !validRecipients(value.recipients, MAX_MAIL_REQUEST_RECIPIENTS) ||
    !("replyTo" in value) || (value.replyTo !== null && !isMessageId(value.replyTo))) throw new Error("Invalid saved mail.");
  return { id: value.id, body: value.body, subject: value.subject, recipients: value.recipients, replyTo: value.replyTo };
}
export function mailUrl(folder: MailFolder = "inbox", query = "", page = 0) {
  const params = new URLSearchParams();
  if (folder !== "inbox") params.set("folder", folder);
  if (query) params.set("q", query);
  if (page > 0) params.set("page", String(page));
  return "/messages" + (params.size ? "?" + params.toString() : "");
}
export function replySubject(subject: string) {
  return Array.from(/^re:/i.test(subject) ? subject : "Re: " + (subject || "No subject")).slice(0, gameplay.messages.subjectMaxLength).join("");
}

export type MailViewParams = { folder?: string | string[] | null; q?: string | string[] | null; page?: string | string[] | null; history?: string | string[]; sent?: string | string[] };
export function parseMailView(params: MailViewParams) {
  const folder: MailFolder = params.folder === "outbox" || params.folder === "saved" ? params.folder : "inbox";
  const query = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const page = typeof params.page === "string" && /^\d{1,7}$/.test(params.page) ? Number(params.page) : 0;
  return { folder, query, page };
}
export function mailDetailUrl(id: string, folder: MailFolder, query = "", page = 0, history = false, sent = false) {
  const params = new URLSearchParams(mailUrl(folder, query, page).split("?")[1]);
  params.set("folder", folder);
  if (history) params.set("history", "1");
  if (sent) params.set("sent", "1");
  return "/messages/mail/" + id + "?" + params.toString();
}
