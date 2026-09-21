import { isPlayerProfilePath } from "@/lib/player-identity";

export type HospitalPatient = { character_id: string; player_number: number; display_name: string; hospital_until: string };
export type HospitalRoster = {
  patients: HospitalPatient[]; total: number; page: number; observed_at: string; next_discharge_at: string | null;
};

export type HospitalStatus = { hospital_until: string | null; observed_at: string };

export function isHospitalAccessiblePath(pathname: string) {
  return pathname === "/harbor/hospital" || pathname === "/inventory" ||
    pathname === "/players" || isPlayerProfilePath(pathname);
}
