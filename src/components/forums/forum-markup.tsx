import type { ReactNode } from "react";
import { GameLink } from "@/components/game-navigation";
import { parseForumMarkup, type ForumMarkupNode } from "@/lib/forum-markup";

function render(nodes: ForumMarkupNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === "text") return node.text;
    const children = render(node.children);
    if (node.type === "link") return node.internal ? <GameLink key={index} href={node.href} prefetch={false}>{children}</GameLink>
      : <a key={index} href={node.href} target="_blank" rel="nofollow ugc noopener noreferrer">{children}</a>;
    if (node.type === "spoiler") return <details key={index} className="o-forum-spoiler"><summary>Spoiler</summary><span>{children}</span></details>;
    const Element = ({ bold: "strong", italic: "em", underline: "u", strike: "s" } as const)[node.type];
    return <Element key={index}>{children}</Element>;
  });
}

// React escapes every text node; the parser only ever yields known elements and checked links.
export function ForumMarkup({ source, className = "o-forum-body" }: { source: string; className?: string }) {
  return <div className={className}>{render(parseForumMarkup(source))}</div>;
}
