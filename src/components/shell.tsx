import { frontend } from "@/config/public";
import Link from "next/link";
import Image from "next/image";
import { Anchor, Compass, Bell, Mail, type LucideIcon } from "lucide-react";
import type { MessageSummary } from "@/lib/messages";
import type { NotificationSummary } from "@/lib/notifications";
import type { ReactNode } from "react";

export function Masthead({ isAdmin = false, notifications, messages }: { messages?: MessageSummary | null; isAdmin?: boolean; notifications?: NotificationSummary | null }) {
  return <header className="o-masthead">
    <Link href="/" className="o-brand" aria-label={frontend.site.name + " home"}>
      <span className="o-brand-mark"><Compass aria-hidden="true" /><Anchor aria-hidden="true" /></span>
      <span className="o-brand-wordmark"><span className="o-brand-title">{frontend.site.brandTop}</span><span className="o-brand-subtitle">{frontend.site.brandBottom}</span></span>
    </Link>
    <div className="o-masthead-end">
      {messages !== undefined && <Link href="/messages" className="o-notification-bell" prefetch={false}
        aria-label={messages ? "Messages, " + messages.unread_count + " unread" : "Messages, count unavailable"}>
        <Mail aria-hidden="true" /><span>Messages</span>
        {(messages === null || messages.unread_count > 0) && <span className="o-notification-badge" aria-hidden="true">{messages ? messages.unread_count > 99 ? "99+" : messages.unread_count : "?"}</span>}
      </Link>}
      {notifications !== undefined && <Link href="/notifications" className="o-notification-bell" prefetch={false}
        aria-label={notifications ? "Notifications, " + notifications.unread_count + " unread" : "Notifications, count unavailable"}>
        <Bell aria-hidden="true" /><span>Notifications</span>
        {(notifications === null || notifications.unread_count > 0) && <span className="o-notification-badge" aria-hidden="true">{notifications ? notifications.unread_count > 99 ? "99+" : notifications.unread_count : "?"}</span>}
      </Link>}
      {isAdmin && <Link href="/admin" className="o-admin-link">Admin panel</Link>}
      <p className="o-masthead-note">A name to make.<br />A life to remember.</p>
    </div>
  </header>;
}

export function Panel({ title, detail, children, className = "", icon: Icon }: { title?: string; detail?: string; children: ReactNode; className?: string; icon?: LucideIcon }) {
  return <section className={"o-panel " + className}>
    {title && <header className="o-panel-title"><h1>{Icon && <Icon aria-hidden="true" />}{title}</h1>{detail && <small>{detail}</small>}</header>}
    {children}
  </section>;
}

export function HarborArt({ short = false, className = "", priority = false }: { short?: boolean; className?: string; priority?: boolean }) {
  return <div className="o-art-frame"><Image src={frontend.art.harborPath} width={frontend.art.width} height={frontend.art.height}
    className={"o-art " + (short ? "o-short-art " : "") + className} preload={priority}
    sizes={"(max-width: " + frontend.layout.mobileBreakpointPx + "px) 100vw, " + frontend.art.desktopDisplayWidth + "px"}
    alt={frontend.art.alt} /></div>;
}

export function AuthFrame({ children }: { children: ReactNode }) {
  return <div className="o-auth-grid">
    <Panel title={frontend.site.name}><HarborArt className="o-auth-art" priority /><div className="o-auth-caption">
      <h2>Your life at sea starts here.</h2><p>A harbor to call home. A name to make your own.</p>
    </div></Panel>
    {children}
  </div>;
}

export function Unconfigured() {
  return <Panel title="The harbor is being prepared"><div className="o-panel-body">
    <p>The game is not connected yet. Please return shortly.</p>
  </div></Panel>;
}
