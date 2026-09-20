-- Discovery must not take key-share locks on other captains' mutable game rows.
alter table private.sea_scout_targets drop constraint sea_scout_targets_target_id_fkey;
alter table private.sea_scout_targets add constraint sea_scout_targets_target_id_fkey
  foreign key(target_id) references public.character_profiles(character_id) on delete cascade;
