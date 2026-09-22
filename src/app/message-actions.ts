"use server";

import { revalidatePath } from "next/cache";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { withDatabaseRetry } from "@/lib/database-retry";
import { isUuid } from "@/lib/validation";
import { isPlayerNumber } from "@/lib/player-identity";
import { gameplay } from "@/config/public";
import { MAX_MAIL_REQUEST_RECIPIENTS, isMessageId, normalizeMessage, validMessage, validSubject, validRecipients, type PendingMail, type MailResult, type MailOperation } from "@/lib/messages";

const changedAccount = "Your signed-in character changed. Reload Messages.";
export async function sendMail(characterId: string, mail: PendingMail): Promise<MailResult> {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  if (character.id !== characterId) return { error: changedAccount, retry: true };
  if (!mail || !isUuid(mail.id) || !validRecipients(mail.recipients, MAX_MAIL_REQUEST_RECIPIENTS) || typeof mail.body !== "string" || !validSubject(mail.subject) ||
    (mail.replyTo !== null && !isMessageId(mail.replyTo))) return { error: "Check the recipients, subject and message." };
  const body = normalizeMessage(mail.body);
  if (!validMessage(body)) return { error: "Enter a message within the character limit." };
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("send_mail", {
    target_numbers: mail.recipients.map(person => person.player_number), mail_subject: mail.subject.trim(), mail_body: body,
    request_id: mail.id, ...(mail.replyTo ? { reply_to_id: mail.replyTo } : {}),
  }));
  if (error || !data) {
    const errors: Record<string, string> = {
      RECIPIENT_UNAVAILABLE: "One or more recipients cannot receive this mail. No mail was sent.", SELF_MESSAGE: "You cannot message yourself.",
      TOO_MANY_RECIPIENTS: `Select up to ${gameplay.messages.maxRecipients} recipients. No mail was sent.`,
      INVALID_MAIL: "Check the recipients, subject and message.", INVALID_REPLY: "This mail can no longer be replied to. Compose a new mail.",
      MESSAGE_RATE_LIMIT: "You have sent too many mails. Please wait a minute.",
      REQUEST_MISMATCH: "This saved mail does not match its original request. Reload Messages.",
    };
    const known = error && Object.hasOwn(errors, error.message) ? errors[error.message] : undefined;
    return { error: known ?? "Sending could not be confirmed. Retry to check the same mail.", retry: !known || error?.message === "REQUEST_MISMATCH" };
  }
  revalidatePath("/", "layout");
  return { receipt: data };
}

export async function updateMail(characterId: string, ids: string[], operation: MailOperation): Promise<string | null> {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  if (character.id !== characterId) return changedAccount;
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every(isMessageId) || !["read","unread","save","unsave","delete"].includes(operation)) return "Reload Messages and try again.";
  const client = await createClient();
  const { error } = await withDatabaseRetry(() => client.rpc("update_mail", { mail_ids: ids, operation }));
  if (error) return "Mail could not be updated. Please try again.";
  revalidatePath("/", "layout");
  return null;
}

export async function setMailIgnored(characterId: string, playerNumber: number, ignored: boolean): Promise<string | null> {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  if (character.id !== characterId) return changedAccount;
  if (!isPlayerNumber(String(playerNumber)) || typeof ignored !== "boolean") return "Choose a valid player.";
  const client = await createClient();
  const { error } = await withDatabaseRetry(() => client.rpc("set_mail_ignored", { target_player_number: playerNumber, ignored }));
  if (error) return "Your ignore list could not be updated. Please try again.";
  revalidatePath("/", "layout");
  return null;
}
