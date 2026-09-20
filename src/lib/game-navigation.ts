import { attackUrl, type AttackLock } from "@/lib/combat";
import { isHospitalAccessiblePath } from "@/lib/hospital";
import { isSeaAccessiblePath, type SeaPhase } from "@/lib/sea-travel";

export type NavigationLock = { attack: AttackLock | null; hospital_until: string | null; sea_state: SeaPhase | null };

export function navigationRedirect(pathname: string, lock: NavigationLock | null) {
  if (!lock || pathname === "/reset-password" || pathname.startsWith("/auth/")) return null;
  if (lock.hospital_until) return isHospitalAccessiblePath(pathname) ? null : "/harbor/hospital";
  if (lock.attack) {
    const destination = attackUrl(lock.attack.target_id);
    return pathname === destination ? null : destination;
  }
  if (lock.sea_state && !isSeaAccessiblePath(pathname, lock.sea_state)) return "/sea";
  return null;
}
