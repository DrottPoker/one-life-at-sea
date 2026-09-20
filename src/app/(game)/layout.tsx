import { frontend } from "@/config/public";
import { GameLink as Link, GameNavigationProvider, GameContent } from "@/components/game-navigation";
import { seaLocationLabel } from "@/lib/sea-travel";
import type { ReactNode } from "react";
import { requireCharacter, gameStateForPlayer } from "@/lib/player";
import { HarborNav } from "@/components/harbor-nav";
import { LogoutButton } from "@/components/logout-button";
import { GameStateProvider } from "@/components/game-state";
import { EconomyRequests } from "@/components/economy-requests";
import { ResourceBars } from "@/components/resource-bars";
import { logOut } from "@/app/actions";

export default async function GameLayout({ children }: { children: ReactNode }) {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  const state = await gameStateForPlayer();
  const created = new Intl.DateTimeFormat(frontend.site.locale, { day: "numeric", month: "short", year: "numeric", timeZone: frontend.site.logTimeZone }).format(new Date(character.created_at));
  return <GameStateProvider state={state}><GameNavigationProvider key={character.id}><div className="o-workspace">
    <aside className="o-sidebar" aria-label="Character and harbor navigation">
      <section className="o-side-module"><h2 className="o-side-title">Character</h2><div className="o-character">
        <span className="o-character-name">{character.display_name}</span><div className="o-character-caption"><Link href={`/characters/${character.id}`}>My Profile</Link></div>
        <dl className="o-side-data"><div><dt>Location</dt><dd>{state.hospital_until ? "Hospital" : seaLocationLabel(state.sea)}</dd></div><div><dt>Created</dt><dd>{created}</dd></div></dl>
      </div></section>
      <ResourceBars />
      <section className="o-side-module"><h2 className="o-side-title">Harbor</h2><HarborNav /></section>
      <section className="o-side-module o-account-module"><h2 className="o-side-title">Account</h2><form action={logOut}><LogoutButton /></form></section>
    </aside><main id="main" className="o-main"><EconomyRequests key={character.id} characterId={character.id}><GameContent>{children}</GameContent></EconomyRequests></main>
  </div><div className="mobile-account"><form action={logOut}><LogoutButton compact /></form></div></GameNavigationProvider></GameStateProvider>;
}
