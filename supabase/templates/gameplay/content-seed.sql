-- Seed once. All subsequent balance changes belong to the admin panel.
do $seed$
begin
  if not exists(select 1 from private.loot_tables where id='harbor_shore') then
    insert into private.loot_tables(id,name,description) values('harbor_shore','Harbor Shore','Fish and lost belongings near The Harbor.');
    insert into private.loot_entries(loot_table_id,item_id,mode,weight_start,weight_end) values
      ('harbor_shore','sprat','weighted',40,10),('harbor_shore','sardine','weighted',30,15),
      ('harbor_shore','mackerel','weighted',20,30),('harbor_shore','sea_bass','weighted',9,30),
      ('harbor_shore','red_snapper','weighted',1,15);
    insert into private.loot_entries(loot_table_id,item_id,mode,fixed_chance) values('harbor_shore','silver_ring','fixed',1);
    insert into private.activity_loot(activity_id,loot_table_id,success_start,success_end,mastery_level)
      values('shore_fishing','harbor_shore',70,90,99) on conflict(activity_id) do nothing;
  end if;
end;
$seed$;
