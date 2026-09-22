"use client";

import { Fragment, useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useNavigationActivity } from "@/components/game-refresh";
import { Check } from "lucide-react";
import { GameLink as Link } from "@/components/game-navigation";
import { markNotificationsRead } from "@/app/notification-actions";
import { notificationContent, type NotificationPage, type PlayerNotification } from "@/lib/notifications";
import { frontend } from "@/config/public";

const dateFormat = new Intl.DateTimeFormat(frontend.site.locale, {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: frontend.site.logTimeZone, timeZoneName: "short",
});

export function NotificationInbox({ data, characterId, older }: { data: NotificationPage; characterId: string; older: boolean }) {
  const [pending, startTransition] = useTransition();
  useNavigationActivity(pending);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  function mark(id: string, all = false, destination?: string) {
    startTransition(async () => {
      try {
        const message = await markNotificationsRead(characterId, id, all);
        setError(message);
        if (!message && destination) router.push(destination);
      } catch { setError("Notifications could not be marked as read. Please try again."); }
    });
  }
  function view(event: MouseEvent<HTMLAnchorElement>, item: PlayerNotification, href: string) {
    if (item.read_at || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!pending) mark(item.id, false, href);
  }
  return <>
    <div className="o-panel-body o-notification-toolbar">
      <span role="status">{data.unread_count} unread {data.unread_count === 1 ? "notification" : "notifications"}</span>
      <button className="o-secondary" disabled={pending || !data.unread_count || !data.latest_id}
        onClick={() => data.latest_id && mark(data.latest_id, true)}>Mark all as read</button>
    </div>
    {error && <p className="o-panel-body" role="alert">{error}</p>}
    <ul className="o-notification-list" aria-label="Notifications" aria-busy={pending}>
      {data.items.map(item => {
        const content = notificationContent(item);
        return <li key={item.id} data-unread={!item.read_at}>
          <span className="o-notification-dot" role="img" aria-label={item.read_at ? "Read" : "Unread"} />
          <div className="o-notification-message">
            {content.actors.map((actor, index) => <Fragment key={index}>
              {index > 0 && (index === content.actors.length - 1 ? " and " : ", ")}
              {actor.href ? <Link href={actor.href} prefetch={false}>{actor.name}</Link> : actor.name}
            </Fragment>)}{content.actors.length > 0 && " "}{content.text}{" "}
            {content.href && <Link href={content.href} prefetch={false} onClick={event => view(event, item, content.href!)} aria-label={content.linkLabel ?? "View notification"}>[view]</Link>}
          </div>
          <time dateTime={item.created_at} title={new Date(item.created_at).toUTCString()}>{dateFormat.format(new Date(item.created_at))}</time>
          <button className="o-notification-read" disabled={pending || !!item.read_at} aria-label="Mark notification as read"
            title={item.read_at ? "Read" : "Mark as read"} onClick={() => mark(item.id)}><Check aria-hidden="true" /></button>
        </li>;
      })}
      {!data.items.length && <li className="o-notification-empty">{older ? "No older notifications." : "No notifications yet. Your events will appear here."}</li>}
    </ul>
    {(older || data.next_before) && <nav className="o-panel-foot o-notification-toolbar" aria-label="Notification pages">
      {older ? <Link href="/notifications">Latest notifications</Link> : <span />}
      {data.next_before && <Link href={"/notifications?before=" + data.next_before}>Older notifications</Link>}
    </nav>}
  </>;
}
