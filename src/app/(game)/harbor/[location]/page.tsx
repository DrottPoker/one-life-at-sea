import { GameLink as Link } from "@/components/game-navigation";
import { notFound } from "next/navigation";
import { requireCharacter } from "@/lib/player";
import { Panel, HarborArt } from "@/components/shell";

const places = {
  shipyard: { title: "Shipyard", heading: "The shipwright is not taking orders.", copy: "The smell of timber and tar hangs over the docks.", later: "Shipyard services will be added in a later update." },
};

function placeFor(value: string) {
  if (value !== "shipyard") notFound();
  return places[value];
}

export async function generateMetadata({ params }: { params: Promise<{ location: string }> }) {
  return { title: placeFor((await params).location).title };
}

export default async function HarborLocation({ params }: { params: Promise<{ location: string }> }) {
  await requireCharacter();
  const { location } = await params;
  const place = placeFor(location);
  return <>
    <Panel title={place.title} detail="Coming later"><HarborArt short className={location === "shipyard" ? "o-ship-art" : ""} priority />
      <div className="o-closed"><h2>{place.heading}</h2><p className="o-copy">{place.copy}</p><p>{place.later}</p></div>
      <div className="o-panel-foot"><Link href="/harbor">Back to The Harbor</Link></div>
    </Panel></>;
}
