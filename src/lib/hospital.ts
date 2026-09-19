import { isUuid } from "@/lib/combat";

export type HospitalPatient = { character_id: string; display_name: string; hospital_until: string };
export type HospitalRoster = {
  patients: HospitalPatient[]; total: number; page: number; observed_at: string; next_discharge_at: string | null;
};

export type HospitalStatus = { hospital_until: string | null; observed_at: string };

export function isHospitalAccessiblePath(pathname: string) {
  return pathname === "/harbor/hospital" || pathname === "/inventory" ||
    (pathname.startsWith("/characters/") && isUuid(pathname.slice("/characters/".length)));
}
