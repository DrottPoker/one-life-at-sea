import { frontend } from "@/config/public";
import Link from "next/link";
import Image from "next/image";
import { Anchor } from "lucide-react";
import type { ReactNode } from "react";

export function Masthead({ isAdmin = false }: { isAdmin?: boolean }) {
  return <header className="o-masthead">
    <Link href="/" className="o-brand" aria-label={frontend.site.name + " home"}>
      <span className="o-brand-mark"><Anchor aria-hidden="true" /></span>
      <span><span className="o-brand-title">{frontend.site.brandTop}</span><span className="o-brand-subtitle">{frontend.site.brandBottom}</span></span>
    </Link>
    {isAdmin && <Link href="/admin">Admin panel</Link>}
    <p className="o-masthead-note">A name to make.<br />A life to remember.</p>
  </header>;
}

export function Panel({ title, detail, children, className = "" }: { title: string; detail?: string; children: ReactNode; className?: string }) {
  return <section className={`o-panel ${className}`}>
    <header className="o-panel-title"><h1>{title}</h1>{detail && <small>{detail}</small>}</header>
    {children}
  </section>;
}

export function HarborArt({ short = false, className = "", priority = false }: { short?: boolean; className?: string; priority?: boolean }) {
  return <div className="o-art-frame"><Image src={frontend.art.harborPath} width={frontend.art.width} height={frontend.art.height}
    className={`o-art ${short ? "o-short-art" : ""} ${className}`} priority={priority}
    sizes={`(max-width: ${frontend.layout.mobileBreakpointPx}px) 100vw, ${frontend.art.desktopDisplayWidth}px`}
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
