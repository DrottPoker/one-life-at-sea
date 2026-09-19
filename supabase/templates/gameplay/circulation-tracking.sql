-- Circulation updates share the inventory transaction and never expose ownership.
create or replace function private.record_item_circulation_delta(target_item text,delta numeric)
returns void language plpgsql volatile security definer set search_path='' as $$
declare current_total numeric; recorded timestamptz;
begin
  if delta=0 then return; end if;
  update private.item_circulation
    set total=total+delta,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
    where item_id=target_item returning total,updated_at into current_total,recorded;
  if not found then raise exception 'CIRCULATION_NOT_INITIALIZED'; end if;
  insert into private.item_circulation_history(item_id,transaction_id,recorded_at,total)
    values(target_item,pg_current_xact_id(),recorded,current_total)
    on conflict(item_id,transaction_id) do update set recorded_at=excluded.recorded_at,total=excluded.total;
end;
$$;
revoke all on function private.record_item_circulation_delta(text,numeric) from public,anon,authenticated;

create or replace function private.initialize_item_circulation()
returns trigger language plpgsql security definer set search_path='' as $$
declare started timestamptz:=clock_timestamp();
begin
  insert into private.item_circulation(item_id,total,initial_total,tracked_since,updated_at)
    values(new.id,0,0,started,started);
  insert into private.item_circulation_history(item_id,transaction_id,recorded_at,total)
    values(new.id,pg_current_xact_id(),started,0);
  return new;
end;
$$;
revoke all on function private.initialize_item_circulation() from public,anon,authenticated;
drop trigger if exists initialize_item_circulation on private.item_definitions;
create trigger initialize_item_circulation after insert on private.item_definitions
  for each row execute function private.initialize_item_circulation();

create or replace function private.track_item_circulation()
returns trigger language plpgsql security definer set search_path='' as $$
declare change record;
begin
  if tg_op='INSERT' then
    for change in select n.item_id,sum(coalesce((to_jsonb(n)->>'quantity')::numeric,1)) delta
      from new_items n group by n.item_id order by n.item_id
    loop perform private.record_item_circulation_delta(change.item_id,change.delta); end loop;
  elsif tg_op='DELETE' then
    for change in select o.item_id,-sum(coalesce((to_jsonb(o)->>'quantity')::numeric,1)) delta
      from old_items o group by o.item_id order by o.item_id
    loop perform private.record_item_circulation_delta(change.item_id,change.delta); end loop;
  else
    for change in select item_id,sum(amount) delta from (
      select n.item_id,coalesce((to_jsonb(n)->>'quantity')::numeric,1) amount from new_items n
      union all select o.item_id,-coalesce((to_jsonb(o)->>'quantity')::numeric,1) from old_items o
    ) changes group by item_id having sum(amount)<>0 order by item_id
    loop perform private.record_item_circulation_delta(change.item_id,change.delta); end loop;
  end if;
  return null;
end;
$$;
revoke all on function private.track_item_circulation() from public,anon,authenticated;

drop trigger if exists circulation_insert on private.item_stacks;
drop trigger if exists circulation_update on private.item_stacks;
drop trigger if exists circulation_delete on private.item_stacks;
create trigger circulation_insert after insert on private.item_stacks
  referencing new table as new_items for each statement execute function private.track_item_circulation();
create trigger circulation_update after update on private.item_stacks
  referencing old table as old_items new table as new_items for each statement execute function private.track_item_circulation();
create trigger circulation_delete after delete on private.item_stacks
  referencing old table as old_items for each statement execute function private.track_item_circulation();
drop trigger if exists circulation_insert on private.item_instances;
drop trigger if exists circulation_update on private.item_instances;
drop trigger if exists circulation_delete on private.item_instances;
create trigger circulation_insert after insert on private.item_instances
  referencing new table as new_items for each statement execute function private.track_item_circulation();
create trigger circulation_update after update on private.item_instances
  referencing old table as old_items new table as new_items for each statement execute function private.track_item_circulation();
create trigger circulation_delete after delete on private.item_instances
  referencing old table as old_items for each statement execute function private.track_item_circulation();

