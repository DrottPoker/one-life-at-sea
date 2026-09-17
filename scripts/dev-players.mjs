import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function localGameUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username || url.password) {
    throw new Error("Test windows require a local URL, such as http://127.0.0.1:3000.");
  }
  return new URL("/login", url).href;
}

export async function openPlayerWindow({ player, url, headless = false, directory = resolve(projectRoot, ".local", "player-browsers") }) {
  if (!Number.isInteger(player) || player < 1 || player > 6) throw new Error("Choose player 1-6.");
  const destination = localGameUrl(url);
  const profile = resolve(directory, "player-" + player);
  await mkdir(profile, { recursive: true });
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: "msedge",
      headless,
      viewport: null,
      ignoreDefaultArgs: ["--hide-scrollbars"],
      timeout: 15000,
    });
  } catch (cause) {
    throw new Error("Player " + player + " could not open. Close its existing test window and check that Microsoft Edge is installed.", { cause });
  }
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(destination, { waitUntil: "domcontentloaded", timeout: 20000 });
    return { context, page, player };
  } catch (cause) {
    await context.close();
    throw new Error("Player " + player + " could not load the game. Start npm run dev first.", { cause });
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    count: { type: "string", short: "c", default: "3" },
    url: { type: "string", default: "http://127.0.0.1:3000" },
    help: { type: "boolean", short: "h", default: false },
  } });
  if (values.help) {
    console.log("npm run dev:players -- [--count 1-6] [--url http://127.0.0.1:3000]");
    console.log("Opens independent Edge windows with saved local test profiles.");
    return;
  }
  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1 || count > 6) throw new Error("Choose between 1 and 6 test windows.");
  const url = localGameUrl(values.url);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "error" });
    if (!response.ok) throw new Error("Unavailable");
  } catch {
    throw new Error("The local game is unavailable. Start npm run dev first.");
  }

  const windows = [];
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    await Promise.allSettled(windows.map(window => window.context.close()));
  }
  const onSignal = () => { void close(); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  try {
    for (let player = 1; player <= count && !closing; player++) {
      const window = await openPlayerWindow({ player, url });
      windows.push(window);
      if (closing) await window.context.close();
      else console.log("Player " + player + " ready. Log in with a separate account.");
    }
    console.log("Each window keeps its own login. Close the windows or press Ctrl+C to finish.");
    await Promise.all(windows.map(window => window.context.isClosed() ? undefined :
      new Promise(resolveClose => window.context.once("close", resolveClose))));
  } finally {
    await close();
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
