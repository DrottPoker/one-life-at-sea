import { gameplay, frontend } from "@/config/public";
import Link from "next/link";
import { Flag, HeartPulse, ScrollText, ShieldAlert, Ship, Swords, UserPlus, Users, type LucideIcon } from "lucide-react";
import { ORDER_LABELS, type CombatEvent, type CombatOrder, type CombatPerson } from "@/lib/combat";
import { SHOT_NAMES, zoneName } from "@/lib/equipment";

function CaptainName({ id, name, playerNumber }: { id: string; name: string; playerNumber?: number | null }) {
  return <Link href={playerNumber ? "/players/" + playerNumber : "/characters/" + id} prefetch={false}>{name}</Link>;
}

const effectLabels = { crew_accuracy: "Crew blinded", ship_speed: "Ship slowed" };
const attacking: CombatOrder[] = ["fire", "fire_chain", "fire_grape", "crew_shoot", "crew_throw", "crew_attack"];

// Each log entry gets a heading and a marker icon that tell its kind apart at a glance.
function eventMarker(event: CombatEvent): { label: string; Icon: LucideIcon } {
  if (event.kind === "round") return event.phase === "sea" ? { label: "Cannon combat", Icon: Ship } : { label: "Boarding", Icon: Swords };
  if (event.kind === "admin_end") return { label: "Ended by administrator", Icon: ShieldAlert };
  if (event.kind === "hospital") return { label: "Hospital admission", Icon: HeartPulse };
  return event.kind === "started" ? { label: "Battle started", Icon: Flag } : { label: "Joined battle", Icon: UserPlus };
}

// One captain's order in a round: who, what, and the result, laid out as aligned columns.
function EventAction({ id, name, playerNumber, order, hit, damage, phase, weapon, zone, critical, target, effect }: {
  id: string; name: string; playerNumber?: number | null; order: CombatOrder; hit: boolean; damage: number; phase: string;
  weapon?: string | null; zone?: string | null; critical?: boolean | null; target?: "ship" | "crew" | null; effect?: keyof typeof effectLabels | null;
}) {
  const struck = target ?? (phase === "sea" ? "ship" : "crew"), place = hit ? zoneName(struck, zone) : null;
  const result = effect && damage === 0 ? effectLabels[effect] : (damage === 0 ? "Blocked · 0 damage" : damage + " " + struck + " damage")
    + (critical && damage > 0 ? " · Critical" : "") + (effect ? " · " + effectLabels[effect] : "");
  const tone = !hit ? "miss" : effect && damage === 0 ? "effect" : damage === 0 ? "blocked" : critical ? "critical" : "hit";
  const shot = order === "fire_chain" ? SHOT_NAMES.chain : order === "fire_grape" ? SHOT_NAMES.grape : null;
  return <p className="o-log-action">
    <strong className="o-log-actor"><CaptainName id={id} name={name} playerNumber={playerNumber} /></strong>
    <span className="o-log-order">{ORDER_LABELS[order]}{weapon ? " · " + weapon : ""}{shot ? " · " + shot : ""}</span>
    {attacking.includes(order) && <span className="o-log-result" data-tone={tone}>{hit ? (place ? place + " · " : "") + result : "Missed"}</span>}
  </p>;
}

export function CombatEvents({ events, people, defenderId, defenderName, newestFirst = false }: { events: CombatEvent[]; people: CombatPerson[]; defenderId: string; defenderName: string; newestFirst?: boolean }) {
  const numbers = new Map(people.map(person => [person.id, person.player_number]));
  const ordered = newestFirst ? [...events].reverse() : events;
  return <section className="o-combat-log" aria-labelledby="combat-log-heading">
    <div className="o-section-bar"><h2 id="combat-log-heading"><ScrollText aria-hidden="true" />Combat log</h2><span>Server time ({frontend.site.logTimeZone})</span></div>
    {ordered.length ? <ol>{ordered.map(event => {
      const { label, Icon } = eventMarker(event);
      return <li key={event.sequence} data-kind={event.kind} data-phase={event.kind === "round" ? event.phase : undefined} data-final={!!event.outcome || undefined}>
        <span className="o-log-marker" aria-hidden="true"><Icon /></span>
        <header><strong>{label}</strong>{event.timed_out && <span className="o-log-tag">Automatic retreat</span>}
          <time dateTime={event.at} title={new Date(event.at).toISOString()}>{new Date(event.at).toLocaleTimeString(frontend.site.locale, { timeZone: frontend.site.logTimeZone })} {frontend.site.logTimeZone}</time>
        </header>
        {event.kind === "round" ? <>
          <div className="o-log-actions">
            <EventAction id={event.actor_id} name={event.actor_name} playerNumber={numbers.get(event.actor_id)} order={event.attacker_order} hit={event.attacker_hit} damage={event.attacker_damage} phase={event.phase}
              weapon={event.attacker_weapon} zone={event.attacker_zone} critical={event.attacker_critical} target={event.attacker_target} effect={event.attacker_effect} />
            <EventAction id={defenderId} name={defenderName} playerNumber={numbers.get(defenderId)} order={event.defender_order} hit={event.defender_hit} damage={event.defender_damage} phase={event.phase}
              weapon={event.defender_weapon} zone={event.defender_zone} critical={event.defender_critical} target={event.defender_target} effect={event.defender_effect} />
          </div>
          {event.transition && <p className="o-log-transition">
            {event.transition === "boarding_failed" ? "The boarding attempt failed." : <>
              <CaptainName id={event.actor_id} name={event.actor_name} playerNumber={numbers.get(event.actor_id)} />
              <span>{event.transition === "boarded" ? "boarded. Crew combat begins with their next order." : "returned to cannon combat."}</span>
            </>}
          </p>}
          {event.participant_result && event.participant_result !== "active" && <p className="o-log-transition">
            <CaptainName id={event.actor_id} name={event.actor_name} playerNumber={numbers.get(event.actor_id)} />
            <span>{event.participant_result === "victory" ? "Final blow" : event.participant_result}.</span>
          </p>}
          {event.outcome && <p className="o-log-transition o-log-outcome">{outcomeLabel(event.outcome)}</p>}
        </> : event.kind === "admin_end" ? <p className="o-log-note">An administrator ended this encounter in a draw. No additional damage was dealt.</p> : event.kind === "hospital" ? <p className="o-log-note"><CaptainName id={event.actor_id} name={event.actor_name} playerNumber={numbers.get(event.actor_id)} /> was admitted to hospital. The encounter ended.</p> : <p className="o-log-note">
          <strong><CaptainName id={event.actor_id} name={event.actor_name} playerNumber={numbers.get(event.actor_id)} /></strong>
          <span>{event.kind === "started" ? "started an attack against" : "joined the attack against"} <CaptainName id={defenderId} name={defenderName} playerNumber={numbers.get(defenderId)} />.</span>
        </p>}
      </li>;
    })}</ol> : <p className="o-panel-body o-copy">No orders have been resolved.</p>}
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

// A captain's standing in the encounter; unfinished statuses read as their current phase.
function personLabel(person: CombatPerson, winnerId: string | null) {
  if (person.id === winnerId && person.role === "attacker") return "Final blow";
  if (person.status !== "active") return person.status;
  return person.role === "defender" ? "Defending" : person.phase === "sea" ? "At sea" : "Boarding";
}

export function CombatPeople({ people, winnerId }: { people: CombatPerson[]; winnerId: string | null }) {
  return <section className="o-combat-people" aria-labelledby="people-heading">
    <div className="o-section-bar"><h2 id="people-heading"><Users aria-hidden="true" />People ({people.length})</h2><span>Combat contributions</span></div>
    <ul>{people.map(person => <li key={person.id} data-result={person.status}>
      <div><strong><CaptainName id={person.id} name={person.name} playerNumber={person.player_number} /></strong>{person.player_number && <small className="o-player-number"> [{person.player_number}]</small>}<span className="o-person-result">{personLabel(person, winnerId)}</span></div>
      <dl><div><dt>Hits</dt><dd>{person.hits}</dd></div><div><dt>Ship damage</dt><dd>{person.ship_damage}</dd></div><div><dt>Crew damage</dt><dd>{person.crew_damage}</dd></div></dl>
      <div className="o-person-condition"><span>Ship {person.ship_health}/{person.ship_health_max ?? gameplay.resources.healthMax}</span><span>Crew {person.crew_health}/{gameplay.resources.healthMax}</span></div>
    </li>)}</ul>
  </section>;
}

function PersonCard({ person, winnerId }: { person: CombatPerson; winnerId: string | null }) {
  const health = [
    { kind: "ship", label: "Ship", value: person.ship_health, max: person.ship_health_max ?? gameplay.resources.healthMax },
    { kind: "crew", label: "Crew", value: person.crew_health, max: gameplay.resources.healthMax },
  ];
  return <li className="o-log-person" data-result={person.status} data-final={person.id === winnerId || undefined}>
    <div className="o-log-person-head"><span>{person.role === "attacker" ? "Attacker" : "Defender"}</span><span className="o-person-result">{personLabel(person, winnerId)}</span></div>
    <p className="o-log-person-name"><CaptainName id={person.id} name={person.name} playerNumber={person.player_number} />{person.player_number && <small className="o-player-number">[{person.player_number}]</small>}</p>
    <dl><div><dt>Hits</dt><dd>{person.hits}</dd></div><div><dt>Ship damage</dt><dd>{person.ship_damage}</dd></div><div><dt>Crew damage</dt><dd>{person.crew_damage}</dd></div></dl>
    <div className="o-log-person-health">{health.map(({ kind, label, value, max }) => <div key={kind}>
      <span>{label}</span>
      <div className={"o-resource-track o-resource-" + kind} role="progressbar" aria-label={person.name + " " + label + " Health"} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <span style={{ width: Math.min(100, value / max * 100) + "%" }} />
      </div>
      <strong>{value}/{max}</strong>
    </div>)}</div>
  </li>;
}

// The public report sets the attackers against the defender, with each captain's contribution and condition afterwards.
export function CombatMatchup({ people, winnerId }: { people: CombatPerson[]; winnerId: string | null }) {
  const attackers = people.filter(person => person.role === "attacker"), defenders = people.filter(person => person.role === "defender");
  return <section className="o-log-matchup" aria-labelledby="people-heading">
    <div className="o-section-bar"><h2 id="people-heading"><Users aria-hidden="true" />People ({people.length})</h2><span>Contributions and condition after the fight</span></div>
    <div className="o-log-sides">
      <ul aria-label={attackers.length === 1 ? "Attacker" : "Attackers"}>{attackers.map(person => <PersonCard key={person.id} person={person} winnerId={winnerId} />)}</ul>
      <span className="o-log-versus" aria-hidden="true">VS</span>
      <ul aria-label="Defender">{defenders.map(person => <PersonCard key={person.id} person={person} winnerId={winnerId} />)}</ul>
    </div>
  </section>;
}
