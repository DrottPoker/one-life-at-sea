import { redirect } from "next/navigation";
import { requireUser, characterForUser } from "@/lib/player";
import { logOut } from "@/app/actions";
import { Panel, HarborArt } from "@/components/shell";
import { CharacterForm } from "@/components/character-form";

export const metadata = { title: "Create your character" };

export default async function CreateCharacter() {
  const user = await requireUser();
  if (await characterForUser(user.id)) redirect("/harbor");
  return <main id="main" className="o-public-space"><Panel title="Create your character"><HarborArt short priority />
    <div className="o-character-layout"><div className="o-character-intro"><h2>Who steps ashore?</h2><p>Choose the name other captains will know you by.</p><p className="o-copy">Your character begins here, in The Harbor.</p></div><CharacterForm /></div>
    <div className="o-panel-foot"><form action={logOut}><button className="o-text-button">Log out</button></form></div>
  </Panel></main>;
}
