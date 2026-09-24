import { ArrowUpFromLine, CookingPot, Hammer, House, Package, Compass } from "lucide-react";
import { frontend } from "@/config/public";
import { GameLink as Link } from "@/components/game-navigation";
import { Panel } from "@/components/shell";
import { PageHero, PLACEHOLDER_HERO } from "@/components/page-hero";
import { requireCharacter } from "@/lib/player";
import { ownSkillProgress } from "@/lib/skills-server";

export const metadata = { title: "Hideout" };

const workspaces = [
  { skillId: "cooking", name: "Cooking", room: "Kitchen", Icon: CookingPot,
    description: "A place to turn your catch and gathered ingredients into meals." },
  { skillId: "crafting", name: "Crafting", room: "Workshop", Icon: Hammer,
    description: "A place to work with your materials and craft useful items." },
];

export default async function HideoutPage() {
  const character = await requireCharacter();
  const progress = await ownSkillProgress();
  const format = new Intl.NumberFormat(frontend.site.locale);
  return <>
    <PageHero title="Hideout" lead="Your home ashore." image={PLACEHOLDER_HERO} icon={House} />
    <Panel>
      <div className="o-hideout-home">
        <div className="o-hideout-emblem" aria-hidden="true"><House /></div>
        <div><p className="o-hideout-eyebrow">A place of your own</p>
          <h2>Welcome home, {character.display_name}.</h2>
          <p>Modest quarters, a roof over your head, and room to grow. This is your corner of the harbor between voyages.</p>
        </div>
      </div>
      <section className="o-hideout-workspaces" aria-labelledby="hideout-workspaces-title">
        <header><h2 id="hideout-workspaces-title">Life at your hideout</h2><p>Cooking, crafting and future home activities will take place here.</p></header>
        <div className="o-hideout-workspace-grid">{workspaces.map(({ skillId, name, room, Icon, description }) => {
          const skill = progress.skills.find(entry => entry.id === skillId);
          return <article className="o-hideout-workspace" key={skillId} aria-labelledby={"hideout-" + skillId}>
            <div className="o-hideout-workspace-heading"><span className="o-hideout-workspace-icon" aria-hidden="true"><Icon /></span>
              <div><p className="o-hideout-eyebrow">{room}</p><h3 id={"hideout-" + skillId}>{skillId === "crafting" ? <Link href="/hideout/crafting">{name}</Link> : name}</h3></div>
            </div>
            <p className="o-hideout-description">{description}</p>
            {skill && <dl className="o-hideout-skill"><div><dt>Skill level</dt><dd><output aria-label={name + " level"}>{skill.level}</output></dd></div>
              <div><dt>Experience</dt><dd><output aria-label={name + " XP"}>{format.format(skill.xp)}</output> XP</dd></div></dl>}
            <p className="o-hideout-planned">{skillId === "crafting" ? "Open your workshop to browse recipes and craft items." : "Coming later"}</p>
          </article>;
        })}</div>
      </section>
      <section className="o-hideout-upgrades" aria-labelledby="hideout-upgrades-title">
        <ArrowUpFromLine aria-hidden="true" />
        <div><h2 id="hideout-upgrades-title">Make yourself at home</h2>
          <p>You will be able to upgrade your hideout and develop its workspaces as your life at sea grows.</p>
          <span className="o-hideout-planned">Hideout upgrades are coming later</span>
        </div>
      </section>
      <div className="o-panel-foot o-hideout-links">
        <Link href="/inventory"><Package aria-hidden="true" />View your inventory</Link>
        <Link href="/activities"><Compass aria-hidden="true" />Gather supplies</Link>
      </div>
    </Panel>
  </>;
}
