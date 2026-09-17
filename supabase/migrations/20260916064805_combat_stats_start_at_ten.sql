-- New characters start at ten; existing progression and combat snapshots stay unchanged.
alter table public.characters
  alter column ship_attack set default 10,
  alter column ship_defense set default 10,
  alter column ship_speed set default 10,
  alter column ship_accuracy set default 10,
  alter column crew_attack set default 10,
  alter column crew_defense set default 10,
  alter column crew_speed set default 10,
  alter column crew_accuracy set default 10;
