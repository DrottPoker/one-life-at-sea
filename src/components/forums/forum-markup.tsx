import type { ReactNode } from "react";
import Image from "next/image";
import { GameLink } from "@/components/game-navigation";
import { parseForumMarkup, type ForumMarkupNode } from "@/lib/forum-markup";
import { forumImageUrl, type ForumImages } from "@/lib/forums";

// Without an image list (quotes, signatures) an image stays a placeholder. With one, only images
// the post is known to show are loaded; hidden ones are shown to moderators alone.
type Context = { images: ForumImages | null | undefined; moderator: boolean; inLink: boolean };

function ForumImage({ id, alt, context }: { id: string; alt: string; context: Context }) {
  const info = context.images?.[id];
  if (context.images === undefined) return <span className="o-forum-image-note">[image]</span>;
  if (!info) return <span className="o-forum-image-note">Image unavailable</span>;
  if (info.purged) return <span className="o-forum-image-note">Image deleted by an administrator</span>;
  if (info.removed && !context.moderator) return <span className="o-forum-image-note">Image removed by a moderator</span>;
  const url = forumImageUrl(id);
  const picture = <Image src={url} alt={alt || "Forum image"} width={info.width} height={info.height} unoptimized loading="lazy" />;
  return <span className="o-forum-image" data-hidden={info.removed || undefined}>
    {context.inLink ? picture : <a href={url} target="_blank" rel="noopener" title="Open full size">{picture}</a>}
    {info.removed && <small>Hidden from players. Only moderators can see it.</small>}
  </span>;
}

function render(nodes: ForumMarkupNode[], context: Context): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === "text") return node.text;
    if (node.type === "image") return <ForumImage key={index} id={node.id} alt={node.alt} context={context} />;
    if (node.type === "link") {
      const children = render(node.children, { ...context, inLink: true });
      return node.internal ? <GameLink key={index} href={node.href} prefetch={false}>{children}</GameLink>
        : <a key={index} href={node.href} target="_blank" rel="nofollow ugc noopener noreferrer">{children}</a>;
    }
    const children = render(node.children, context);
    if (node.type === "spoiler") return <details key={index} className="o-forum-spoiler"><summary>Spoiler</summary><span>{children}</span></details>;
    const Element = ({ bold: "strong", italic: "em", underline: "u", strike: "s" } as const)[node.type];
    return <Element key={index}>{children}</Element>;
  });
}

// React escapes every text node; the parser only ever yields known elements and checked links.
export function ForumMarkup({ source, className = "o-forum-body", images, moderator = false }: {
  source: string; className?: string; images?: ForumImages | null; moderator?: boolean;
}) {
  return <div className={className}>{render(parseForumMarkup(source), { images, moderator, inLink: false })}</div>;
}
