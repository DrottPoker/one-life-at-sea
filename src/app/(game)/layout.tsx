import type { ReactNode } from "react";
import { requireCharacter } from "@/lib/player";
import { HarborNav } from "@/components/harbor-nav";
import { LogoutButton } from "@/components/logout-button";
import { logOut } from "@/app/actions";

export default async function GameLayout({ children }: { children: ReactNode }) {
  const character = await requireCharacter();
  const created = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(character.created_at));
  return <><div className="o-workspace">
    <aside className="o-sidebar" aria-label="Character and harbor navigation">
      <section className="o-side-module"><h2 className="o-side-title">Character</h2><div className="o-character">
        <span className="o-character-name">{character.display_name}</span><div className="o-character-caption">Captain</div>
        <dl className="o-side-data"><div><dt>Location</dt><dd>The Harbor</dd></div><div><dt>Created</dt><dd>{created}</dd></div></dl>
      </div></section>
      <section className="o-side-module"><h2 className="o-side-title">Harbor</h2><HarborNav /></section>
      <section className="o-side-module o-account-module"><h2 className="o-side-title">Account</h2><form action={logOut}><LogoutButton /></form></section>
    </aside><main id="main" className="o-main">{children}</main>
  </div><div className="mobile-account"><form action={logOut}><LogoutButton compact /></form></div></>;
}
