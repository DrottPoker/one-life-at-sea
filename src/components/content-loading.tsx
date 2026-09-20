"use client";

import { useNavigationActivity } from "@/components/game-refresh";

export function ContentLoading() {
  useNavigationActivity(true);
  return <div className="o-content-loading" role="status" aria-label="Loading view">
    <span className="o-spinner" aria-hidden="true" />
    <span>Loading...</span>
  </div>;
}
