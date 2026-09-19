import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { loadConfig, root } from "./config/core.mjs";

const config = loadConfig();
const [command, ...args] = process.argv.slice(2);
if (!["dev", "start"].includes(command)) throw new Error("Expected dev or start.");
const explicitPort = args.some(arg => arg === "--port" || arg === "-p" || arg.startsWith("--port="));
const child = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), command,
  "--hostname", config.server.local.host, ...(!explicitPort ? ["--port", String(config.server.local.appPort)] : []), ...args],
  { cwd: root, stdio: "inherit", windowsHide: true });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => { process.exitCode = code ?? 1; });
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
