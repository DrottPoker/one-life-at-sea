import { isForumId } from "@/lib/forums";
import { isPlayerNumber, playerProfileUrl } from "@/lib/player-identity";
import { isUuid } from "@/lib/validation";

export type PlayerNotification = {
  id: string; kind: string; payload: Record<string, unknown>; created_at: string; read_at: string | null;
};
export type NotificationSummary = { unread_count: number; latest_id: string | null };
export type NotificationPage = NotificationSummary & { items: PlayerNotification[]; next_before: string | null };
export type NotificationContent = { actors: { name: string; href: string | null }[]; text: string; href: string | null; linkLabel?: string };

export function isNotificationId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}

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
