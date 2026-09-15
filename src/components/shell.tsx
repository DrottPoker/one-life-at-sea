import Link from "next/link";
import Image from "next/image";
import { Anchor } from "lucide-react";
import type { ReactNode } from "react";

export function Masthead() {
  return <header className="o-masthead">
    <Link href="/" className="o-brand" aria-label="One Life At Sea home">
      <span className="o-brand-mark"><Anchor aria-hidden="true" /></span>
      <span><span className="o-brand-title">ONE LIFE</span><span className="o-brand-subtitle">AT SEA</span></span>
    </Link>
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
  return <div className="o-art-frame"><Image src="/images/harbor.webp" width={1672} height={941}
    className={`o-art ${short ? "o-short-art" : ""} ${className}`} priority={priority}
    sizes="(max-width: 760px) 100vw, 900px"
    alt="A sunlit Caribbean harbor with clear blue sea, a sandy beach, green palms and wooden sailing ships." /></div>;
}

export function AuthFrame({ children }: { children: ReactNode }) {
  return <div className="o-auth-grid">
    <Panel title="One Life At Sea"><HarborArt className="o-auth-art" priority /><div className="o-auth-caption">
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
