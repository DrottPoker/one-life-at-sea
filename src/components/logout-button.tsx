"use client";

import { useFormStatus } from "react-dom";
import { LogOut } from "lucide-react";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={compact ? "o-text-button" : "o-nav"} disabled={pending}>
    {!compact && <LogOut aria-hidden="true" />}{pending ? "Logging out..." : "Log out"}
  </button>;
}
