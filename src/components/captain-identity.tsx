"use client";

import { MapPin } from "lucide-react";
import { GameLink as Link } from "@/components/game-navigation";
import { CaptainPortrait } from "@/components/captain-portrait";
import { useGameState } from "@/components/game-state";
import { seaLocationLabel } from "@/lib/sea-travel";

export function CaptainIdentity({ name, profileUrl }: { name: string; profileUrl: string }) {
  const state = useGameState();
  return <div className="o-character">
    {/* The text link below is the accessible route; the portrait is a pointer shortcut. */}
    <Link href={profileUrl} className="o-captain-portrait" tabIndex={-1} aria-hidden="true"><CaptainPortrait sizes="64px" /></Link>
    <div className="o-character-summary">
      <span className="o-character-name">{name}</span>
      <span className="o-character-location"><MapPin aria-hidden="true" />{state.hospital_until ? "Hospital" : seaLocationLabel(state.sea)}</span>
      <Link className="o-character-profile" href={profileUrl}>My Profile</Link>
    </div>
  </div>;
}
