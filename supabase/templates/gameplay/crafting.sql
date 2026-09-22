create table if not exists private.crafting_recipes (
  id text primary key, name text not null,
  output_item_id text not null references private.item_definitions(id),
  output_quantity bigint not null check(output_quantity between 1 and 9007199254740991),
  version text not null check(version ~ '^[a-f0-9]{64}$'), active boolean not null, position integer not null
);
create table if not exists private.crafting_ingredients (
  recipe_id text not null references private.crafting_recipes(id),
  item_id text not null references private.item_definitions(id),
  quantity bigint not null check(quantity between 1 and 9007199254740991),
  primary key(recipe_id,item_id)
);
create table if not exists private.crafting_requests (
  character_id uuid not null references public.characters(id) on delete cascade,
  request_id uuid not null, recipe_id text not null references private.crafting_recipes(id),
  expected_version text not null, result jsonb not null,
  created_at timestamptz not null default clock_timestamp(), primary key(character_id,request_id)
);
create index if not exists crafting_output_item_idx on private.crafting_recipes(output_item_id);
create index if not exists crafting_ingredient_item_idx on private.crafting_ingredients(item_id);
alter table private.crafting_recipes enable row level security;
alter table private.crafting_ingredients enable row level security;
alter table private.crafting_requests enable row level security;
revoke all on private.crafting_recipes,private.crafting_ingredients,private.crafting_requests from public,anon,authenticated;
{{crafting.catalogSql}}

create or replace function private.list_crafting_recipes()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'name',r.name,'version',r.version,'xp_gain',{{gameplay.crafting.xpGain}},
    'output',jsonb_build_object('item_id',d.id,'name',d.name,'image_path',d.image_path,
      'quantity',r.output_quantity,'owned',coalesce(s.quantity,0)),
    'ingredients',(select jsonb_agg(jsonb_build_object('item_id',i.item_id,'name',di.name,
      'image_path',di.image_path,'quantity',i.quantity,'owned',coalesce(si.quantity,0)) order by i.item_id)
      from private.crafting_ingredients i join private.item_definitions di on di.id=i.item_id
      left join private.item_stacks si on si.item_id=i.item_id and si.character_id=viewer_id where i.recipe_id=r.id)
  ) order by r.position,r.id),'[]'::jsonb) into result
  from private.crafting_recipes r join private.item_definitions d on d.id=r.output_item_id
  left join private.item_stacks s on s.item_id=d.id and s.character_id=viewer_id
  where r.active and d.active and d.stackable
    and exists(select 1 from private.crafting_ingredients i where i.recipe_id=r.id)
    and not exists(select 1 from private.crafting_ingredients i join private.item_definitions di on di.id=i.item_id
      where i.recipe_id=r.id and (not di.active or not di.stackable or i.item_id=r.output_item_id));
  return result;
end;
$$;
revoke all on function private.list_crafting_recipes() from public,anon,authenticated;
grant execute on function private.list_crafting_recipes() to authenticated;
create or replace function public.list_crafting_recipes()
returns jsonb language sql stable security invoker set search_path='' as $$ select private.list_crafting_recipes(); $$;
revoke all on function public.list_crafting_recipes() from public,anon,authenticated;
grant execute on function public.list_crafting_recipes() to authenticated;

create or replace function private.craft_item(recipe_id text,expected_version text,request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  viewer_id uuid:=private.combat_captain(); previous private.crafting_requests%rowtype;
  recipe private.crafting_recipes%rowtype; ingredient record; consumed jsonb:='[]'; result jsonb; progression jsonb;
  output_name text; output_before bigint; item_ids text[];
begin
  if request_id is null or recipe_id is null or recipe_id !~ '^[a-z][a-z0-9_]{0,47}$'
    or expected_version is null or expected_version !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform private.settle_combat_context(array[viewer_id]);
  select * into previous from private.crafting_requests r where r.character_id=viewer_id and r.request_id=craft_item.request_id;
  if found then
    if previous.recipe_id<>recipe_id or previous.expected_version<>expected_version then
      raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
    return previous.result;
  end if;
  perform private.assert_can_act(viewer_id);
  if (select location from public.characters where id=viewer_id)<>'the_harbor' then raise exception 'NOT_IN_HARBOR'; end if;
  select * into recipe from private.crafting_recipes r where r.id=recipe_id and r.active for share;
  if not found then raise exception 'INVALID_RECIPE' using errcode='22023'; end if;
  if recipe.version<>expected_version then raise exception 'STALE_OFFER'; end if;
  if exists(select 1 from private.character_skills where character_id=viewer_id and skill_id='crafting'
    and xp>9007199254740991-{{gameplay.crafting.xpGain}}) then raise exception 'SKILL_XP_LIMIT'; end if;
  select array_agg(item_id order by item_id) into item_ids from (
    select i.item_id from private.crafting_ingredients i where i.recipe_id=recipe.id union select recipe.output_item_id
  ) items;
  perform 1 from private.item_definitions d where d.id=any(item_ids) order by d.id for share;
  if cardinality(item_ids)<2 or exists(select 1 from private.item_definitions d where d.id=any(item_ids) and (not d.active or not d.stackable))
    or exists(select 1 from private.crafting_ingredients i where i.recipe_id=recipe.id and i.item_id=recipe.output_item_id) then
    raise exception 'RECIPE_UNAVAILABLE'; end if;
  select d.name into output_name from private.item_definitions d where d.id=recipe.output_item_id;
  select coalesce((select s.quantity from private.item_stacks s where s.character_id=viewer_id and s.item_id=recipe.output_item_id),0) into output_before;
  if output_before>9007199254740991-recipe.output_quantity then raise exception 'INVENTORY_FULL'; end if;
  for ingredient in
    select i.item_id,i.quantity,d.name,coalesce(s.quantity,0) owned from private.crafting_ingredients i
    join private.item_definitions d on d.id=i.item_id
    left join private.item_stacks s on s.item_id=i.item_id and s.character_id=viewer_id
    where i.recipe_id=recipe.id order by i.item_id
  loop
    if ingredient.owned<ingredient.quantity then raise exception 'INSUFFICIENT_MATERIALS'; end if;
    consumed:=consumed||jsonb_build_array(jsonb_build_object('item_id',ingredient.item_id,'name',ingredient.name,'quantity',ingredient.quantity));
  end loop;
  -- Lock circulation counters in item order before consuming or creating stock.
  perform 1 from private.item_circulation c where c.item_id=any(item_ids) order by c.item_id for update;
  delete from private.item_stacks s using private.crafting_ingredients i
    where s.character_id=viewer_id and s.item_id=i.item_id and i.recipe_id=recipe.id and s.quantity=i.quantity;
  update private.item_stacks s set quantity=s.quantity-i.quantity from private.crafting_ingredients i
    where s.character_id=viewer_id and s.item_id=i.item_id and i.recipe_id=recipe.id;
  insert into private.item_stacks(character_id,item_id,quantity) values(viewer_id,recipe.output_item_id,recipe.output_quantity)
    on conflict(character_id,item_id) do update set quantity=item_stacks.quantity+excluded.quantity;
  progression:=private.award_skill_xp(viewer_id,'crafting',{{gameplay.crafting.xpGain}});
  result:=jsonb_build_object('recipe_id',recipe.id,'recipe_name',recipe.name,'consumed',consumed,'progression',progression,
    'output',jsonb_build_object('item_id',recipe.output_item_id,'name',output_name,'quantity',recipe.output_quantity));
  insert into private.crafting_requests(character_id,request_id,recipe_id,expected_version,result)
    values(viewer_id,request_id,recipe.id,expected_version,result);
  return result;
end;
$$;
revoke all on function private.craft_item(text,text,uuid) from public,anon,authenticated;
grant execute on function private.craft_item(text,text,uuid) to authenticated;
create or replace function public.craft_item(recipe_id text,expected_version text,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.craft_item(recipe_id,expected_version,request_id); $$;
revoke all on function public.craft_item(text,text,uuid) from public,anon,authenticated;
grant execute on function public.craft_item(text,text,uuid) to authenticated;
