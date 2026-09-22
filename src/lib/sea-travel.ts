import { isPlayerNumber, isPlayerProfilePath } from "@/lib/player-identity";
import { isUuid } from "@/lib/validation";

export type SeaPhase = "in_harbor" | "at_sea" | "traveling";
export type SeaPlace = { id: string; name: string };
export type SeaRoute = { id: string; place_id: string; name: string };
export type SeaJourney = {
  id: string; kind: "depart" | "onward" | "return"; from_step: number; target_step: number;
  destination: SeaPlace; started_at: string; arrives_at: string;
};
export type SeaState = {
  state: SeaPhase; version: string; step: number; visit_id: string | null; scout_id: string | null;
  place: SeaPlace | null; options: SeaRoute[]; journey: SeaJourney | null;
};
export type TravelReceipt = { journey_id: string; kind: SeaJourney["kind"]; arrives_at: string };
export type TravelResult = { message?: string; error?: boolean; retry?: boolean };
export type CharacterStatus = {
  character_level: number;
  max_sea_distance: number;
  can_attack_here: boolean;
  location: "the_harbor" | "open_sea" | "traveling";
  arrives_at: string | null; hospital_until: string | null; observed_at: string;
};

export function isSeaAccessiblePath(pathname: string, state: SeaPhase) {
  if (state === "in_harbor") return true;
  if (pathname === "/sea") return true;
  return state === "at_sea" && (pathname === "/inventory" ||
    pathname === "/players" || isPlayerProfilePath(pathname) ||
    (pathname.startsWith("/attack/") && (isPlayerNumber(pathname.slice(8)) || isUuid(pathname.slice(8)))) ||
    (pathname.startsWith("/combatlog/") && isUuid(pathname.slice(11))));
}
export function seaLocationLabel(sea: SeaState) {
  if (sea.state === "traveling") return sea.journey?.kind === "return" ? "Returning to The Harbor" : "Traveling";
  return sea.state === "at_sea" ? sea.place?.name ?? "At sea" : "The Harbor";
}
