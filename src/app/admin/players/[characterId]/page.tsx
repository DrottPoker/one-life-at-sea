import Link from "next/link";
import { notFound } from "next/navigation";
import { activeAdminItemDefinitions, adminCatalog, readAdminTable } from "@/lib/admin-server";
import { isUuid } from "@/lib/validation";
import { RecordEditor } from "@/components/admin/record-editor";
import { DatabaseTable } from "@/components/admin/database-table";
import { GrantItems } from "@/components/admin/grant-items";
import { MutationForm } from "@/components/admin/mutation-form";
import { adminLabel } from "@/lib/admin";

export default async function AdminPlayer({ params }: { params: Promise<{ characterId: string }> }) {
  const { characterId } = await params;
  if (!isUuid(characterId)) notFound();
  const [catalog, characters, training, stacks, instances, definitions, jobs, engagements, skills] = await Promise.all([
    adminCatalog(), readAdminTable("characters", "", 0, { id: characterId }),
    readAdminTable("character_training", "", 0, { character_id: characterId }),
    readAdminTable("item_stacks", "", 0, { character_id: characterId }),
    readAdminTable("item_instances", "", 0, { character_id: characterId }),
    activeAdminItemDefinitions(),
    readAdminTable("ship_upgrade_jobs", "", 0, { character_id: characterId, applied_at: null }),
    readAdminTable("combat_engagements", "", 0, { character_id: characterId }),
    readAdminTable("character_skills", "", 0, { character_id: characterId }),
  ]);
  const row = characters.rows[0];
  if (!row) notFound();
  const resource = (name: string) => catalog.find(entry => entry.name === name)!;
  const captain = row.values;
  const filteredLink = (name: string) => "/admin/database/" + name + "?field=character_id&value=" + characterId;
  return <>
    <Link href="/admin/players">Back to players</Link><h2>{captain.display_name}</h2>
    <p>Player ID: <strong>{captain.player_number}</strong><br />Character: <code>{characterId}</code><br />Account: <code>{captain.user_id}</code></p>
    <section className="admin-card"><h2>Character, stats and balances</h2>
      <dl className="admin-metrics">{["gold_coins","bank_gold_coins","energy","stamina","crew_morale","ship_health","crew_health"].map(key =>
        <div key={key}><dt>{adminLabel(key)}</dt><dd>{captain[key]}</dd></div>)}</dl>
      <RecordEditor resource={resource("characters")} row={row} label="Edit character" />
      <Link href={"/players/" + captain.player_number}>View game profile</Link>
      <p>Hospital until: {captain.hospital_until ?? "Not hospitalized"}</p>
      {captain.hospital_until && <MutationForm action="release_hospital" payload={{ character_id: characterId, version: row.version }}
        label="Review hospital release" summary="Release this captain from hospital and restore full ship and crew health, including equipment and battling level bonuses." />}
    </section>
    <GrantItems characterId={characterId} playerName={captain.display_name!} definitions={definitions} />
    <section className="admin-card"><h2>Skill progression</h2><p>Correct private skill XP here. Skill levels and public Character Level update automatically.</p><DatabaseTable resource={resource("character_skills")} data={skills} /></section>
    <section className="admin-card"><h2>Training progress</h2><DatabaseTable resource={resource("character_training")} data={training} />
      <Link href="/admin/database/training_tiers">View available tier IDs and requirements</Link></section>
    {[{ name: "item_stacks", label: "Item stacks", data: stacks }, { name: "item_instances", label: "Equipment instances", data: instances }].map(group =>
      <section key={group.name} className="admin-card"><h2>{group.label} ({group.data.total})</h2><DatabaseTable resource={resource(group.name)} data={group.data} />
        <Link href={filteredLink(group.name)}>Open all {group.label.toLowerCase()} with pagination</Link></section>)}
    <section className="admin-card"><h2>Combat and ship jobs</h2>
      {engagements.rows.map(entry => <MutationForm key={entry.version} action="end_combat" payload={{ character_id: characterId, combat_id: entry.values.combat_id }}
        label="Review end combat" summary="End the entire encounter in a draw. No additional damage is dealt; existing health and snapshots are preserved." />)}
      {!engagements.rows.length && <p>No active combat.</p>}
      {jobs.rows.filter(job => job.values.applied_at === null).map(job => <div key={job.values.id}><p>{job.values.workshop_name}: {job.values.stat}, finishes {job.values.finishes_at}</p>
        <MutationForm action="cancel_ship_job" payload={{ character_id: characterId, version: job.version }} label="Review job cancellation"
          summary="Cancel the pending ship job. No stats, XP or energy refund will be granted." /></div>)}
      <div className="admin-links">{["ship_upgrade_jobs", "combat_participants", "bank_transfers", "training_requests", "inventory_requests", "activity_requests"].map(name =>
        <Link key={name} href={filteredLink(name)}>{name.replaceAll("_", " ")}</Link>)}</div>
    </section>
  </>;
}

