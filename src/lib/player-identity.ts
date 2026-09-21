import { isUuid } from "@/lib/validation";

export const FIRST_PLAYER_NUMBER = 100001;

export function isPlayerNumber(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{5,15}$/.test(value) &&
    Number.isSafeInteger(Number(value)) && Number(value) >= FIRST_PLAYER_NUMBER;
}

export function playerProfileUrl(playerNumber: number) {
  return "/players/" + playerNumber;
}

export function isPlayerProfilePath(pathname: string) {
  return (pathname.startsWith("/players/") && isPlayerNumber(pathname.slice("/players/".length))) ||
    (pathname.startsWith("/characters/") && isUuid(pathname.slice("/characters/".length)));
}

export function playerSearchUrl(query: string, page = 0) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 0) params.set("page", String(page));
  return "/players" + (params.size ? "?" + params.toString() : "");
}

export type PlayerSearchResult = { character_id: string; player_number: number; display_name: string };
export type PlayerSearchPage = { players: PlayerSearchResult[]; total: number; page: number; page_size: number };
