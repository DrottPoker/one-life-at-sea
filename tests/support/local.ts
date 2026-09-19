import server from "../../config/server.json" with { type: "json" };
const host = server.local.host.includes(":") ? "[" + server.local.host + "]" : server.local.host;
export const localAppUrl = "http://" + host + ":" + server.local.testPort;
export const localMailUrl = "http://" + host + ":" + server.local.supabaseMailPort;
export const localDatabaseContainer = "supabase_db_" + server.local.supabaseProjectId;
export function isLocalTestApi(value: string) {
  const url = new URL(value);
  return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && Number(url.port) === server.local.supabaseApiPort;
}
