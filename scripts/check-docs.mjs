import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = resolve(directory, entry.name);
  return entry.isDirectory() ? walk(path) : path.endsWith(".md") ? [path] : [];
});
const files = [resolve(root, "README.md"), resolve(root, "CLAUDE.md"), resolve(root, "config/README.md"), ...walk(resolve(root, "docs"))];
const withoutCode = content => content.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, "");

// Heading anchors as GitHub renders them, plus explicit <a id> anchors.
const anchorCache = new Map();
function anchors(file) {
  if (anchorCache.has(file)) return anchorCache.get(file);
  const found = new Set(), counts = new Map();
  const content = withoutCode(readFileSync(file, "utf8"));
  for (const [, text] of content.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const plain = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/<[^>]+>/g, "");
    const slug = plain.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");
    const seen = counts.get(slug) ?? 0;
    counts.set(slug, seen + 1);
    found.add(seen ? slug + "-" + seen : slug);
  }
  for (const [, id] of content.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) found.add(id);
  anchorCache.set(file, found);
  return found;
}

const errors = [];
let links = 0;
for (const file of files) {
  const content = withoutCode(readFileSync(file, "utf8"));
  const name = relative(root, file).replaceAll("\\", "/");
  if (!name.startsWith("docs/archive/") && (content.match(/^# .+$/gm) ?? []).length !== 1) {
    errors.push(name + ": expected one document title");
  }
  for (const match of content.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const href = match[1].replace(/^<|>$/g, "");
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue;
    const [path, fragment] = href.split("#");
    let target = file;
    if (path) {
      const local = path.split("?")[0];
      try { target = resolve(dirname(file), decodeURIComponent(local)); }
      catch { errors.push(name + ": invalid link " + href); continue; }
      links++;
      if (!existsSync(target)) { errors.push(name + ": missing target " + href); continue; }
      if (extname(target) === ".md" && !files.includes(target)) { errors.push(name + ": Markdown target outside the documentation inventory " + href); continue; }
    }
    if (fragment && extname(target) === ".md") {
      let anchor;
      try { anchor = decodeURIComponent(fragment); } catch { errors.push(name + ": invalid anchor " + href); continue; }
      if (!anchors(target).has(anchor)) errors.push(name + ": missing anchor " + href);
    }
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Documentation checked: " + files.length + " files, " + links + " local links and their anchors.");
}
