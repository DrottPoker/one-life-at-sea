import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCharacter } from "@/lib/player";
import { Panel, HarborArt } from "@/components/shell";

const places = {
  marketplace: { title: "Marketplace", heading: "The market is not open yet.", copy: "Canvas awnings shade the stalls along the sunlit waterfront.", later: "Trading will be added in a later update." },
  shipyard: { title: "Shipyard", heading: "The shipwright is not taking orders.", copy: "The smell of timber and tar hangs over the docks.", later: "Shipyard services will be added in a later update." },
};

function placeFor(value: string) {
  if (value !== "marketplace" && value !== "shipyard") notFound();
  return places[value];
}

export async function generateMetadata({ params }: { params: Promise<{ location: string }> }) {
  return { title: placeFor((await params).location).title };
}

export default async function HarborLocation({ params }: { params: Promise<{ location: string }> }) {
  await requireCharacter();
  const { location } = await params;
  const place = placeFor(location);
  return <><nav className="o-breadcrumb" aria-label="Breadcrumb"><Link href="/harbor">The Harbor</Link><span aria-hidden="true">/</span><span>{place.title}</span></nav>
    <Panel title={place.title} detail="Coming later"><HarborArt short className={location === "shipyard" ? "o-ship-art" : ""} priority />
      <div className="o-closed"><h2>{place.heading}</h2><p className="o-copy">{place.copy}</p><p>{place.later}</p></div>
      <div className="o-panel-foot"><Link href="/harbor">Back to The Harbor</Link></div>
    </Panel></>;
}
