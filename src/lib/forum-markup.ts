// Forum posts are plain text with a small BBCode subset. Parsing never produces HTML:
// the renderer turns these nodes into React elements, and anything unrecognized stays text.
export type ForumMarkupNode =
  | { type: "text"; text: string }
  | { type: "bold" | "italic" | "underline" | "strike" | "spoiler"; children: ForumMarkupNode[] }
  | { type: "link"; href: string; internal: boolean; children: ForumMarkupNode[] };
type Container = Exclude<ForumMarkupNode, { type: "text" }>["type"];
type Frame = { tag: string; raw: string; argument: string | undefined; children: ForumMarkupNode[] };

const containers: Record<string, Exclude<Container, "link">> = { b: "bold", i: "italic", u: "underline", s: "strike", spoiler: "spoiler" };
const tagPattern = /\[(\/?)(b|i|u|s|spoiler|url)(?:=([^\]\n]{1,2048}))?\]/gi;
const urlPattern = /https?:\/\/[^\s<>[\]"'`]+/gi;
export const FORUM_MARKUP_DEPTH = 8;

// Internal links are same-site paths; external links must be plain http(s) URLs without credentials.
export function forumLinkTarget(value: string): { href: string; internal: boolean } | null {
  const target = value.trim();
  if (target.length <= 300 && /^\/(?![/\\])[A-Za-z0-9\-._~/?#=&%+]*$/.test(target)) return { href: target, internal: true };
  if (target.length > 2048 || !/^https?:\/\/[^\s\\]+$/i.test(target)) return null;
  try {
    const url = new URL(target);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname && !url.username && !url.password ? { href: url.href, internal: false } : null;
  } catch { return null; }
}

function pushText(nodes: ForumMarkupNode[], text: string) {
  if (!text) return;
  const last = nodes[nodes.length - 1];
  if (last?.type === "text") last.text += text; else nodes.push({ type: "text", text });
}
function append(nodes: ForumMarkupNode[], items: ForumMarkupNode[]) {
  for (const item of items) if (item.type === "text") pushText(nodes, item.text); else nodes.push(item);
}
const count = (text: string, character: string) => text.split(character).length - 1;
// Trailing punctuation usually ends the sentence; a closing parenthesis stays when the address opened one.
function linkify(text: string, nodes: ForumMarkupNode[]) {
  let last = 0;
  for (const match of text.matchAll(urlPattern)) {
    let candidate = match[0];
    while (/[.,;:!?)]$/.test(candidate) && !(candidate.endsWith(")") && count(candidate, "(") >= count(candidate, ")"))) candidate = candidate.slice(0, -1);
    const target = forumLinkTarget(candidate);
    if (!target) continue;
    pushText(nodes, text.slice(last, match.index));
    nodes.push({ type: "link", href: target.href, internal: false, children: [{ type: "text", text: candidate }] });
    last = match.index + candidate.length;
  }
  pushText(nodes, text.slice(last));
}
function autolink(nodes: ForumMarkupNode[]): ForumMarkupNode[] {
  const result: ForumMarkupNode[] = [];
  for (const node of nodes) {
    if (node.type === "text") linkify(node.text, result);
    else if (node.type === "link") result.push(node);
    else result.push({ ...node, children: autolink(node.children) });
  }
  return result;
}
function plainText(nodes: ForumMarkupNode[]): string | null {
  return nodes.length === 0 ? "" : nodes.length === 1 && nodes[0].type === "text" ? nodes[0].text : null;
}

export function parseForumMarkup(source: string): ForumMarkupNode[] {
  const root: ForumMarkupNode[] = [], stack: Frame[] = [];
  const current = () => stack.length ? stack[stack.length - 1].children : root;
  // An unfinished tag is shown exactly as it was written.
  const unwrap = (frame: Frame, closing = "") => { const nodes = current(); pushText(nodes, frame.raw); append(nodes, frame.children); pushText(nodes, closing); };
  let last = 0;
  for (const match of source.matchAll(tagPattern)) {
    const [raw, closing, name, argument] = match, tag = name.toLowerCase();
    pushText(current(), source.slice(last, match.index));
    last = match.index + raw.length;
    if (!closing) {
      const invalid = stack.length >= FORUM_MARKUP_DEPTH || (tag === "url" ? stack.some(frame => frame.tag === "url") : argument !== undefined);
      if (invalid) pushText(current(), raw); else stack.push({ tag, raw, argument, children: [] });
      continue;
    }
    const index = stack.findLastIndex(frame => frame.tag === tag);
    if (argument !== undefined || index < 0) { pushText(current(), raw); continue; }
    while (stack.length - 1 > index) unwrap(stack.pop()!);
    const frame = stack.pop()!;
    if (tag !== "url") {
      if (frame.children.length) current().push({ type: containers[tag], children: frame.children });
      continue;
    }
    const text = plainText(frame.children);
    const target = forumLinkTarget(frame.argument ?? text ?? "");
    if (!target) { unwrap(frame, raw); continue; }
    current().push({ type: "link", href: target.href, internal: target.internal, children: frame.children.length ? frame.children : [{ type: "text", text: target.href }] });
  }
  pushText(current(), source.slice(last));
  while (stack.length) unwrap(stack.pop()!);
  return autolink(root);
}

// Toolbar helpers wrap the selection so the editor never produces an invalid tag.
export const forumFormats = [
  { tag: "b", label: "Bold" }, { tag: "i", label: "Italic" }, { tag: "u", label: "Underline" },
  { tag: "s", label: "Strikethrough" }, { tag: "spoiler", label: "Spoiler" },
] as const;
export function wrapForumSelection(text: string, start: number, end: number, open: string, close: string) {
  const next = text.slice(0, start) + open + text.slice(start, end) + close + text.slice(end);
  return { text: next, start: start + open.length, end: end + open.length };
}
