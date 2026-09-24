import Image from "next/image";
import type { LucideIcon } from "lucide-react";

// Shared placeholder banner until each page gets its own artwork.
export const PLACEHOLDER_HERO = "/images/headers/harbor-placeholder.webp";

export function PageHero({ title, lead, image, icon: Icon }: { title: string; lead: string; image: string; icon: string | LucideIcon }) {
  return <header className="o-page-hero"><div className="o-page-hero-frame">
    <Image className="o-page-hero-image" src={image} alt="" fill sizes="(max-width: 760px) 100vw, 940px" preload />
    <div className="o-page-hero-content">{typeof Icon === "string" ? <Image src={Icon} alt="" width={82} height={82} /> : <Icon aria-hidden="true" />}
      <div><h1>{title}</h1><p>{lead}</p></div>
    </div>
  </div></header>;
}
