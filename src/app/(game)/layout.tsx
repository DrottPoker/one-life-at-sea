import Link from "next/link";
import type { ReactNode } from "react";
import { requireCharacter, gameStateForPlayer } from "@/lib/player";
import { HarborNav } from "@/components/harbor-nav";
import { LogoutButton } from "@/components/logout-button";
import { GameStateProvider } from "@/components/game-state";
import { ResourceBars } from "@/components/resource-bars";
import { logOut } from "@/app/actions";

export default async function GameLayout({ children }: { children: ReactNode }) {
  const character = await requireCharacter();
  const state = await gameStateForPlayer();
  const created = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(character.created_at));
  return <GameStateProvider state={state}><div className="o-workspace">
    <aside className="o-sidebar" aria-label="Character and harbor navigation">
      <section className="o-side-module"><h2 className="o-side-title">Character</h2><div className="o-character">
        <span className="o-character-name">{character.display_name}</span><div className="o-character-caption"><Link href={`/characters/${character.id}`}>My Profile</Link></div>
        <dl className="o-side-data"><div><dt>Location</dt><dd>The Harbor</dd></div><div><dt>Created</dt><dd>{created}</dd></div></dl>
      </div></section>
      <ResourceBars />
      <section className="o-side-module"><h2 className="o-side-title">Harbor</h2><HarborNav /></section>
      <section className="o-side-module o-account-module"><h2 className="o-side-title">Account</h2><form action={logOut}><LogoutButton /></form></section>
    </aside><main id="main" className="o-main">{children}</main>
  </div><div className="mobile-account"><form action={logOut}><LogoutButton compact /></form></div></GameStateProvider>;
}
