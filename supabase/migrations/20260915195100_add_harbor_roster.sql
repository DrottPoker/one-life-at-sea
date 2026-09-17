-- Publish only the captain identity needed by the harbor directory.
create table public.harbor_players (
  character_id uuid primary key references public.characters(id) on delete cascade,
  display_name text not null
);
create index harbor_players_name_order on public.harbor_players(display_name, character_id);
alter table public.harbor_players enable row level security;
revoke all on public.harbor_players from public, anon, authenticated;
grant select on public.harbor_players to authenticated;
create policy harbor_players_read on public.harbor_players
for select to authenticated using ((select private.is_registered_player()));

create function private.sync_harbor_player()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.location = 'the_harbor' then
    insert into public.harbor_players(character_id, display_name)
    values (new.id, new.display_name)
    on conflict (character_id) do update set display_name = excluded.display_name
    where harbor_players.display_name is distinct from excluded.display_name;
  else
    delete from public.harbor_players where character_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_harbor_player() from public, anon, authenticated;

create trigger characters_sync_harbor_player
after insert or update of display_name, location on public.characters
for each row execute function private.sync_harbor_player();

insert into public.harbor_players(character_id, display_name)
select id, display_name from public.characters where location = 'the_harbor';

create function public.list_harbor_players(requested_page integer default 0)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with totals as (
    select count(*)::integer as total from public.harbor_players
  ), paging as (
    select total, least(greatest(coalesce(requested_page, 0), 0),
      greatest(0, (total - 1) / 20)) as page from totals
  )
  select jsonb_build_object(
    'total', total, 'page', page,
    'players', coalesce((
      select jsonb_agg(to_jsonb(player) order by player.display_name, player.character_id)
      from (
        select character_id, display_name from public.harbor_players
        order by display_name, character_id limit 20 offset paging.page * 20
      ) player
    ), '[]'::jsonb)
  ) from paging;
$$;
revoke all on function public.list_harbor_players(integer) from public, anon;
grant execute on function public.list_harbor_players(integer) to authenticated;

alter publication supabase_realtime add table public.harbor_players;
comment on table public.harbor_players is 'Server-maintained harbor directory. Contains no account identifiers, email, resources or stats.';
