-- Listing stock is escrow, so its circulation delta offsets the inventory transfer.
drop trigger if exists circulation_insert on private.market_listings;
drop trigger if exists circulation_update on private.market_listings;
drop trigger if exists circulation_delete on private.market_listings;
create trigger circulation_insert after insert on private.market_listings
  referencing new table as new_items for each statement execute function private.track_item_circulation();
create trigger circulation_update after update on private.market_listings
  referencing old table as old_items new table as new_items for each statement execute function private.track_item_circulation();
create trigger circulation_delete after delete on private.market_listings
  referencing old table as old_items for each statement execute function private.track_item_circulation();

create or replace function private.notify_market(target_item text)
returns void language sql volatile security invoker set search_path='' as $$
  insert into public.market_item_events(item_id,revision) values(target_item,1)
    on conflict(item_id) do update set revision=market_item_events.revision+1;
$$;
revoke all on function private.notify_market(text) from public,anon,authenticated;

-- Caller holds the character, listing and circulation locks.
create or replace function private.receive_market_item(listing private.market_listings,recipient_id uuid,amount bigint)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare held bigint;
begin
  if listing.entry_type='instance' then
    if amount<>1 then raise exception 'INVALID_QUANTITY' using errcode='22023'; end if;
    insert into private.item_instances(id,character_id,item_id,damage,accuracy,created_at)
      values(listing.original_entry_id,recipient_id,listing.item_id,listing.damage,listing.accuracy,listing.item_created_at);
  else
    select quantity into held from private.item_stacks where character_id=recipient_id and item_id=listing.item_id for update;
    if coalesce(held,0)>9007199254740991-amount then raise exception 'ITEM_QUANTITY_LIMIT'; end if;
    insert into private.item_stacks(character_id,item_id,quantity) values(recipient_id,listing.item_id,amount)
      on conflict(character_id,item_id) do update set quantity=item_stacks.quantity+excluded.quantity;
  end if;
end;
$$;
revoke all on function private.receive_market_item(private.market_listings,uuid,bigint) from public,anon,authenticated;

create or replace function private.list_market_items(category_id text default null,search_term text default '',requested_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare page_size integer:={{gameplay.marketplace.pageSize}}; observed timestamptz:=statement_timestamp(); result jsonb;
begin
  perform private.combat_captain();
  if requested_page is null or requested_page<0 or search_term is null or length(search_term)>100 then raise exception 'INVALID_FILTER' using errcode='22023'; end if;
  if category_id is not null and not exists(select 1 from private.item_categories c where c.id=category_id) then raise exception 'INVALID_CATEGORY' using errcode='22023'; end if;
  with sales as (
    select s.item_id,sum(s.quantity) sold from private.market_sales s
      where s.sold_at>observed-make_interval(hours=>{{gameplay.marketplace.popularityHours}}) and s.sold_at<=observed group by s.item_id
  ), offers as (
    select l.item_id,min(l.unit_price) minimum_price,sum(l.quantity) available from private.market_listings l where l.quantity>0 group by l.item_id
  ), matching as (
    select d.id item_id,d.name,d.category_id,d.kind,d.description,d.effect_description,d.image_path,
      c.total::text circulation,o.minimum_price,coalesce(o.available,0)::text available,
      coalesce(s.sold,0)::text sold,coalesce(s.sold,0) sold_order
      from private.item_definitions d join private.item_circulation c on c.item_id=d.id
      left join sales s on s.item_id=d.id left join offers o on o.item_id=d.id
      where d.active and d.tradable and (list_market_items.category_id is null or d.category_id=list_market_items.category_id)
        and strpos(lower(d.name),lower(btrim(search_term)))>0
  ), ordered as (
    select m.*,row_number() over(order by case when list_market_items.category_id is null then m.sold_order else 0 end desc,
      m.minimum_price nulls last,lower(m.name) collate "C",m.item_id) position from matching m
  ), bounds as (
    select count(*) total,least(requested_page,greatest(0,(count(*)-1)/page_size))::integer page from matching
  ), items as (
    select o.*,private.item_market_value_at(o.item_id,observed)::text market_value from ordered o
      order by position limit page_size offset(select page::bigint*page_size from bounds)
  )
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i)-'sold_order'-'position' order by position) from items i),'[]'::jsonb),
    'total',b.total,'page',b.page,'page_size',page_size,'observed_at',observed) into result from bounds b;
  return result;
end;
$$;

create or replace function private.list_market_listings(target_item text default null,own_only boolean default false,requested_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer uuid:=private.combat_captain(); page_size integer:={{gameplay.marketplace.listingsPageSize}}; result jsonb;
begin
  if requested_page is null or requested_page<0 or own_only is null or (not own_only and target_item is null) then raise exception 'INVALID_FILTER' using errcode='22023'; end if;
  with matching as (
    select l.id,l.item_id,l.entry_type,l.quantity,l.unit_price,l.seller_id,p.display_name seller_name,p.player_number seller_player_number,
      l.seller_id=viewer is_own,d.name,d.image_path,d.kind,d.category_id,l.created_at,l.fee_bps,
      d.active and d.tradable tradable,
      case when l.entry_type='instance' then jsonb_build_object('damage',l.damage,'accuracy',l.accuracy) end stats
      from private.market_listings l join private.item_definitions d on d.id=l.item_id
      join public.character_profiles p on p.character_id=l.seller_id
      where l.quantity>0 and (not own_only or l.seller_id=viewer)
        and (target_item is null or l.item_id=target_item) and (own_only or (d.active and d.tradable))
  ), ordered as (
    select m.*,row_number() over(order by case when own_only then m.created_at end desc,
      m.unit_price,m.created_at,m.id) position from matching m
  ), bounds as (
    select count(*) total,least(requested_page,greatest(0,(count(*)-1)/page_size))::integer page from matching
  ), items as (
    select * from ordered order by position
      limit(select (case when own_only then 1 else page::bigint+1 end)*page_size from bounds)
      offset(select case when own_only then page::bigint*page_size else 0 end from bounds)
  )
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i)-'position' order by position) from items i),'[]'::jsonb),
    'total',b.total,'page',b.page,'page_size',page_size,'observed_at',statement_timestamp()) into result from bounds b;
  return result;
end;
$$;

create or replace function private.list_market_inventory(category_id text default null,search_term text default '',requested_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer uuid:=private.combat_captain(); page_size integer:={{gameplay.inventory.pageSize}}; result jsonb;
begin
  if requested_page is null or requested_page<0 or search_term is null or length(search_term)>100 then raise exception 'INVALID_FILTER' using errcode='22023'; end if;
  if category_id is not null and not exists(select 1 from private.item_categories c where c.id=category_id) then raise exception 'INVALID_CATEGORY' using errcode='22023'; end if;
  with owned as (
    select s.id,'stack'::text entry_type,s.item_id,s.quantity,null::jsonb stats from private.item_stacks s where s.character_id=viewer
    union all
    select i.id,'instance',i.item_id,1::bigint,jsonb_build_object('damage',i.damage,'accuracy',i.accuracy) from private.item_instances i where i.character_id=viewer
  ), matching as (
    select o.*,d.name,d.category_id,d.kind,d.description,d.effect_description,d.image_path,c.total::text circulation
      from owned o join private.item_definitions d on d.id=o.item_id join private.item_circulation c on c.item_id=o.item_id
      where d.active and d.tradable and (list_market_inventory.category_id is null or d.category_id=list_market_inventory.category_id)
        and strpos(lower(d.name),lower(btrim(search_term)))>0
  ), bounds as (
    select count(*) total,least(requested_page,greatest(0,(count(*)-1)/page_size))::integer page from matching
  ), items as (
    select m.*,private.item_market_value_at(m.item_id,statement_timestamp())::text market_value from matching m
      order by lower(name) collate "C",item_id,id,entry_type
      limit page_size offset(select page::bigint*page_size from bounds)
  )
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i) order by lower(i.name) collate "C",i.item_id,i.id,i.entry_type) from items i),'[]'::jsonb),
    'total',b.total,'page',b.page,'page_size',page_size) into result from bounds b;
  return result;
end;
$$;

revoke all on function private.list_market_items(text,text,integer) from public,anon,authenticated;
grant execute on function private.list_market_items(text,text,integer) to authenticated;
create or replace function public.list_market_items(category_id text default null,search_term text default '',requested_page integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.list_market_items(category_id,search_term,requested_page);
$$;
revoke all on function public.list_market_items(text,text,integer) from public,anon,authenticated;
grant execute on function public.list_market_items(text,text,integer) to authenticated;

revoke all on function private.list_market_listings(text,boolean,integer) from public,anon,authenticated;
grant execute on function private.list_market_listings(text,boolean,integer) to authenticated;
create or replace function public.list_market_listings(target_item text default null,own_only boolean default false,requested_page integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.list_market_listings(target_item,own_only,requested_page);
$$;
revoke all on function public.list_market_listings(text,boolean,integer) from public,anon,authenticated;
grant execute on function public.list_market_listings(text,boolean,integer) to authenticated;

revoke all on function private.list_market_inventory(text,text,integer) from public,anon,authenticated;
grant execute on function private.list_market_inventory(text,text,integer) to authenticated;
create or replace function public.list_market_inventory(category_id text default null,search_term text default '',requested_page integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.list_market_inventory(category_id,search_term,requested_page);
$$;
revoke all on function public.list_market_inventory(text,text,integer) from public,anon,authenticated;
grant execute on function public.list_market_inventory(text,text,integer) to authenticated;
