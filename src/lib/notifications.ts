import { isForumId } from "@/lib/forums";
import { isPlayerNumber, playerProfileUrl } from "@/lib/player-identity";
import { isBigintId, isUuid } from "@/lib/validation";

export type PlayerNotification = {
  id: string; kind: string; payload: Record<string, unknown>; created_at: string; read_at: string | null;
};
export type NotificationSummary = { unread_count: number; latest_id: string | null };
export type NotificationPage = NotificationSummary & { items: PlayerNotification[]; next_before: string | null };
export type NotificationContent = { actors: { name: string; href: string | null }[]; text: string; href: string | null; linkLabel?: string };

export const isNotificationId = isBigintId;

// Forum notices link to the post through its permalink, built from a validated ID.
function forumNotice(payload: Record<string, unknown>, text: string): NotificationContent | null {
  const author = payload.author as { name?: unknown; player_number?: unknown } | null;
  if (payload.version !== 1 || !isForumId(payload.post_id) || typeof payload.title !== "string" || !payload.title || !author || typeof author !== "object" ||
    typeof author.name !== "string" || !author.name) return null;
  return {
    actors: [{ name: author.name, href: isPlayerNumber(String(author.player_number)) ? playerProfileUrl(Number(author.player_number)) : null }],
    text: text + " “" + payload.title + "”", href: "/forums/posts/" + payload.post_id, linkLabel: "View forum post",
  };
}

// New kinds add a renderer here and call private.emit_notification in their transaction.
const renderers: Record<string, (payload: Record<string, unknown>) => NotificationContent | null> = {
  "forum.moderation": payload => {
    if (payload.version === 1 && payload.action === "clear_signature") {
      return { actors: [], text: "A moderator cleared your forum signature.", href: "/forums/settings", linkLabel: "Open forum settings" };
    }
    if (payload.version !== 1 || typeof payload.title !== "string" || !payload.title || !isForumId(payload.thread_id)) return null;
    const text = payload.action === "remove_post" ? "A moderator removed your post in" : payload.action === "edit_post" ? "A moderator edited your post in"
      : payload.action === "remove_thread" ? "A moderator removed your thread" : payload.action === "remove_poll" ? "A moderator removed the poll in your thread"
      : payload.action === "remove_image" ? "A moderator removed your image in" : null;
    if (!text) return null;
    const href = payload.action === "remove_poll" ? "/forums/threads/" + payload.thread_id
      : ["edit_post", "remove_image"].includes(payload.action as string) && isForumId(payload.post_id) ? "/forums/posts/" + payload.post_id : null;
    return { actors: [], text: text + " \u201c" + payload.title + "\u201d", href, linkLabel: payload.action === "remove_poll" ? "View thread" : "View forum post" };
  },
  "forum.ban": payload => {
    if (payload.version !== 1 || typeof payload.reason !== "string" || (payload.ends_at !== null && (typeof payload.ends_at !== "string" || Number.isNaN(Date.parse(payload.ends_at))))) return null;
    const until = payload.ends_at === null ? "permanently" : "until " + new Date(payload.ends_at as string).toUTCString();
    return { actors: [], text: "You are banned from posting in the forums " + until + ". Reason: " + payload.reason, href: null };
  },
  "forum.unban": payload => payload.version === 1 ? { actors: [], text: "Your forum ban was lifted. You can post again.", href: null } : null,
  "forum.role": payload => payload.version === 1 && typeof payload.moderator === "boolean"
    ? { actors: [], text: payload.moderator ? "You are now a forum moderator." : "You are no longer a forum moderator.", href: payload.moderator ? "/forums/moderation" : null, linkLabel: "Open moderation" } : null,
  "forum.reply": payload => forumNotice(payload, "replied in"),
  "forum.quote": payload => forumNotice(payload, "quoted your post in"),
  "combat.attacked": payload => {
    if (payload.version !== 1 || !isUuid(payload.battle_id) || !Array.isArray(payload.attackers) || !payload.attackers.length ||
      typeof payload.hospitalized !== "boolean") return null;
    const actors: NotificationContent["actors"] = [];
    for (const actor of payload.attackers) {
      if (!actor || typeof actor !== "object" || typeof actor.name !== "string" || !actor.name) return null;
      actors.push({ name: actor.name, href: isPlayerNumber(String(actor.player_number)) ? playerProfileUrl(Number(actor.player_number)) : null });
    }
    const text = payload.hospitalized ? "attacked and hospitalized you"
      : payload.outcome === "defended" ? "attacked you but lost" : "attacked you";
    return { actors, text, href: "/combatlog/" + payload.battle_id, linkLabel: "View combat log" };
  },
};

export function notificationContent(notification: PlayerNotification): NotificationContent {
  return (Object.hasOwn(renderers, notification.kind) ? renderers[notification.kind](notification.payload) : null) ??
    { actors: [], text: "You have a new notification.", href: null };
}
