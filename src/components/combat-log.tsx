import { gameplay, frontend } from "@/config/public";
import Link from "next/link";
import { ScrollText, Users } from "lucide-react";
import { ORDER_LABELS, type CombatEvent, type CombatOrder, type CombatPerson } from "@/lib/combat";

function CaptainName({ id, name }: { id: string; name: string }) {
  return <Link href={"/characters/" + id} prefetch={false}>{name}</Link>;
}

function EventAction({ id, name, order, hit, damage, phase }: { id: string; name: string; order: CombatOrder; hit: boolean; damage: number; phase: string }) {
  return <p><strong><CaptainName id={id} name={name} /></strong><span>{ORDER_LABELS[order]}</span>
    {(order === "fire" || order === "crew_attack") && <span className={hit ? "o-damage" : "o-copy"}>{hit ? damage === 0 ? "Blocked · 0 damage" : damage + " " + (phase === "sea" ? "ship" : "crew") + " damage" : "Missed"}</span>}
  </p>;
}

export function CombatEvents({ events, defenderId, defenderName, newestFirst = false }: { events: CombatEvent[]; defenderId: string; defenderName: string; newestFirst?: boolean }) {
  const ordered = newestFirst ? [...events].reverse() : events;
  return <section className="o-combat-log" aria-labelledby="combat-log-heading">
    <div className="o-section-bar"><h2 id="combat-log-heading"><ScrollText aria-hidden="true" />Combat log</h2><span>Server time ({frontend.site.logTimeZone})</span></div>
    {ordered.length ? <ol>{ordered.map(event => <li key={event.sequence}>
      <header><strong>{event.kind === "round" ? event.phase === "sea" ? "Cannon combat" : "Boarding" : event.kind === "admin_end" ? "Ended by administrator" : event.kind === "hospital" ? "Hospital admission" : event.kind === "started" ? "Battle started" : "Joined battle"}</strong>
        <time dateTime={event.at} title={new Date(event.at).toISOString()}>{new Date(event.at).toLocaleTimeString(frontend.site.locale, { timeZone: frontend.site.logTimeZone })} {frontend.site.logTimeZone}</time>
        {event.timed_out && <span>Automatic retreat</span>}
      </header>
      {event.kind === "round" ? <>
        <EventAction id={event.actor_id} name={event.actor_name} order={event.attacker_order} hit={event.attacker_hit} damage={event.attacker_damage} phase={event.phase} />
        <EventAction id={defenderId} name={defenderName} order={event.defender_order} hit={event.defender_hit} damage={event.defender_damage} phase={event.phase} />
        {event.transition && <p className="o-log-transition">
          {event.transition === "boarding_failed" ? "The boarding attempt failed." : <>
            <CaptainName id={event.actor_id} name={event.actor_name} />
            <span>{event.transition === "boarded" ? "boarded. Crew combat begins with their next order." : "returned to cannon combat."}</span>
          </>}
        </p>}
        {event.participant_result && event.participant_result !== "active" && <p className="o-log-transition">
          <CaptainName id={event.actor_id} name={event.actor_name} />
          <span>{event.participant_result === "victory" ? "Final blow" : event.participant_result}.</span>
        </p>}
        {event.outcome && <p className="o-log-transition">{outcomeLabel(event.outcome)}</p>}
      </> : event.kind === "admin_end" ? <p>An administrator ended this encounter in a draw. No additional damage was dealt.</p> : event.kind === "hospital" ? <p><CaptainName id={event.actor_id} name={event.actor_name} /> was admitted to hospital. The encounter ended.</p> : <p>
        <strong><CaptainName id={event.actor_id} name={event.actor_name} /></strong>
        <span>{event.kind === "started" ? "started an attack against" : "joined the attack against"} <CaptainName id={defenderId} name={defenderName} />.</span>
      </p>}
    </li>)}</ol> : <p className="o-panel-body o-copy">No orders have been resolved.</p>}
  </section>;
}

export function outcomeLabel(outcome: string | null) {
  switch (outcome) {
    case "hull_victory": return "The defending ship was sunk.";
    case "boarding_victory": return "The defending crew was overcome.";
    case "defended": return "The defender held off the attack.";
    case "draw": return "The encounter ended in a draw.";
    default: return "The attackers withdrew.";
  }
}

export function CombatPeople({ people, winnerId }: { people: CombatPerson[]; winnerId: string | null }) {
  return <section className="o-combat-people" aria-labelledby="people-heading">
    <div className="o-section-bar"><h2 id="people-heading"><Users aria-hidden="true" />People ({people.length})</h2><span>Combat contributions</span></div>
    <ul>{people.map(person => <li key={person.id} data-result={person.status}>
      <div><strong><CaptainName id={person.id} name={person.name} /></strong><span className="o-person-result">{person.id === winnerId && person.role === "attacker" ? "Final blow" : person.status === "active" ? person.role === "defender" ? "Defending" : person.phase === "sea" ? "At sea" : "Boarding" : person.status}</span></div>
      <dl><div><dt>Hits</dt><dd>{person.hits}</dd></div><div><dt>Ship damage</dt><dd>{person.ship_damage}</dd></div><div><dt>Crew damage</dt><dd>{person.crew_damage}</dd></div></dl>
      <div className="o-person-condition"><span>Ship {person.ship_health}/{gameplay.resources.healthMax}</span><span>Crew {person.crew_health}/{gameplay.resources.healthMax}</span></div>
    </li>)}</ul>
  </section>;
}
