import { GameContent } from "@/components/game-navigation";
import { playerProfileUrl } from "@/lib/player-identity";
import type { ReactNode } from "react";
import { requireCharacter, gameStateForPlayer } from "@/lib/player";
import { HarborNav } from "@/components/harbor-nav";
import { LogoutButton } from "@/components/logout-button";
import { GameStateProvider } from "@/components/game-state";
import { EconomyRequests } from "@/components/economy-requests";
import { ResourceBars } from "@/components/resource-bars";
import { CaptainIdentity } from "@/components/captain-identity";
import { XpDrop } from "@/components/xp-drop";
import { ownSkillProgress } from "@/lib/skills-server";
import { logOut } from "@/app/actions";

export default async function GameLayout({ children }: { children: ReactNode }) {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  const [state, skills] = await Promise.all([gameStateForPlayer(), ownSkillProgress()]);
  return <GameStateProvider state={state}><div className="o-workspace">
    <aside className="o-sidebar" aria-label="Character and harbor navigation">
      <section className="o-side-module o-captain-card" aria-label="Your captain">
        <CaptainIdentity name={character.display_name} profileUrl={playerProfileUrl(character.player_number)} />
        <ResourceBars />
      </section>
      <section className="o-side-module o-navigation-module"><h2 className="o-side-title">Navigation</h2><HarborNav /></section>
      <section className="o-side-module o-account-module"><h2 className="o-side-title">Account</h2><form action={logOut}><LogoutButton /></form></section>
    </aside><main id="main" className="o-main"><EconomyRequests key={character.id} characterId={character.id}><GameContent>{children}</GameContent></EconomyRequests></main>
  </div><div className="mobile-account"><form action={logOut}><LogoutButton compact /></form></div><XpDrop skills={skills} /></GameStateProvider>;
}
