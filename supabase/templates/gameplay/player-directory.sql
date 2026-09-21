-- Search only the existing public projection, with its registered-player RLS.
create or replace function public.search_players(search_term text default '',requested_page integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare term text:=btrim(coalesce(search_term,'')); number_text text; number_id bigint;
  id_only boolean; pattern text; result jsonb; page_size integer:={{gameplay.harbor.pageSize}};
begin
  if length(term)>100 or requested_page is null or requested_page<0 then
    raise exception 'INVALID_FILTER' using errcode='22023';
  end if;
  id_only:=left(term,1)='#';
  number_text:=case when id_only then substr(term,2) else term end;
  if number_text ~ '^[0-9]{1,16}$' then
    if number_text::numeric between 100001 and 9007199254740991 then number_id:=number_text::bigint; end if;
  end if;
  pattern:='%' || replace(replace(replace(lower(term),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_') || '%';
  with matching as (
    select character_id,player_number,display_name from public.character_profiles
    where player_number=number_id or (not id_only and lower(display_name) like pattern escape E'\\')
  ), bounds as (
    select count(*)::integer total,least(requested_page,greatest(0,(count(*)-1)/page_size))::integer page from matching
  )
  select jsonb_build_object('total',b.total,'page',b.page,'page_size',page_size,
    'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.player_number) from (
      select * from matching order by player_number limit page_size offset b.page::bigint*page_size
    ) p),'[]'::jsonb)) into result from bounds b;
  return result;
end;
$$;
revoke all on function public.search_players(text,integer) from public,anon,authenticated;
grant execute on function public.search_players(text,integer) to authenticated;
