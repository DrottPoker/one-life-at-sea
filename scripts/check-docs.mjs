import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = resolve(directory, entry.name);
  return entry.isDirectory() ? walk(path) : path.endsWith(".md") ? [path] : [];
});
const files = [resolve(root, "README.md"), resolve(root, "config/README.md"), ...walk(resolve(root, "docs"))];
const errors = [];
let links = 0;
for (const file of files) {
  const content = readFileSync(file, "utf8").replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, "");
  const name = relative(root, file).replaceAll("\\", "/");
  if (!name.startsWith("docs/archive/") && (content.match(/^# .+$/gm) ?? []).length !== 1) {
    errors.push(name + ": expected one document title");
  }
  for (const match of content.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const href = match[1].replace(/^<|>$/g, "");
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) continue;
    const path = href.split(/[?#]/)[0];
    if (!path) continue;
    let target;
    try { target = resolve(dirname(file), decodeURIComponent(path)); }
    catch { errors.push(name + ": invalid link " + href); continue; }
    links++;
    if (!existsSync(target)) errors.push(name + ": missing target " + href);
    else if (extname(target) === ".md" && !files.includes(target)) errors.push(name + ": Markdown target outside the documentation inventory " + href);
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Documentation checked: " + files.length + " files, " + links + " local links.");
}
