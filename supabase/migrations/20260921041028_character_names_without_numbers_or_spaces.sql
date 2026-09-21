-- Unicode numbers and whitespace, including nonbreaking spaces and BOM.
create function private.is_valid_character_name(candidate text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select coalesce(candidate<>'' and candidate !~ U&'[\0009-\000d\0020\0030-\0039\0085\00a0\00b2-\00b3\00b9\00bc-\00be\0660-\0669\06f0-\06f9\07c0-\07c9\0966-\096f\09e6-\09ef\09f4-\09f9\0a66-\0a6f\0ae6-\0aef\0b66-\0b6f\0b72-\0b77\0be6-\0bf2\0c66-\0c6f\0c78-\0c7e\0ce6-\0cef\0d58-\0d5e\0d66-\0d78\0de6-\0def\0e50-\0e59\0ed0-\0ed9\0f20-\0f33\1040-\1049\1090-\1099\1369-\137c\1680\16ee-\16f0\17e0-\17e9\17f0-\17f9\1810-\1819\1946-\194f\19d0-\19da\1a80-\1a89\1a90-\1a99\1b50-\1b59\1bb0-\1bb9\1c40-\1c49\1c50-\1c59\2000-\200a\2028-\2029\202f\205f\2070\2074-\2079\2080-\2089\2150-\2182\2185-\2189\2460-\249b\24ea-\24ff\2776-\2793\2cfd\3000\3007\3021-\3029\3038-\303a\3192-\3195\3220-\3229\3248-\324f\3251-\325f\3280-\3289\32b1-\32bf\a620-\a629\a6e6-\a6ef\a830-\a835\a8d0-\a8d9\a900-\a909\a9d0-\a9d9\a9f0-\a9f9\aa50-\aa59\abf0-\abf9\feff\ff10-\ff19\+010107-\+010133\+010140-\+010178\+01018a-\+01018b\+0102e1-\+0102fb\+010320-\+010323\+010341\+01034a\+0103d1-\+0103d5\+0104a0-\+0104a9\+010858-\+01085f\+010879-\+01087f\+0108a7-\+0108af\+0108fb-\+0108ff\+010916-\+01091b\+0109bc-\+0109bd\+0109c0-\+0109cf\+0109d2-\+0109ff\+010a40-\+010a48\+010a7d-\+010a7e\+010a9d-\+010a9f\+010aeb-\+010aef\+010b58-\+010b5f\+010b78-\+010b7f\+010ba9-\+010baf\+010cfa-\+010cff\+010d30-\+010d39\+010d40-\+010d49\+010e60-\+010e7e\+010f1d-\+010f26\+010f51-\+010f54\+010fc5-\+010fcb\+011052-\+01106f\+0110f0-\+0110f9\+011136-\+01113f\+0111d0-\+0111d9\+0111e1-\+0111f4\+0112f0-\+0112f9\+011450-\+011459\+0114d0-\+0114d9\+011650-\+011659\+0116c0-\+0116c9\+0116d0-\+0116e3\+011730-\+01173b\+0118e0-\+0118f2\+011950-\+011959\+011bf0-\+011bf9\+011c50-\+011c6c\+011d50-\+011d59\+011da0-\+011da9\+011f50-\+011f59\+011fc0-\+011fd4\+012400-\+01246e\+016130-\+016139\+016a60-\+016a69\+016ac0-\+016ac9\+016b50-\+016b59\+016b5b-\+016b61\+016d70-\+016d79\+016e80-\+016e96\+01ccf0-\+01ccf9\+01d2c0-\+01d2d3\+01d2e0-\+01d2f3\+01d360-\+01d378\+01d7ce-\+01d7ff\+01e140-\+01e149\+01e2f0-\+01e2f9\+01e4f0-\+01e4f9\+01e5f1-\+01e5fa\+01e8c7-\+01e8cf\+01e950-\+01e959\+01ec71-\+01ecab\+01ecad-\+01ecaf\+01ecb1-\+01ecb4\+01ed01-\+01ed2d\+01ed2f-\+01ed3d\+01f100-\+01f10c\+01fbf0-\+01fbf9]',false);
$$;
revoke all on function private.is_valid_character_name(text) from public,anon,authenticated;
grant execute on function private.is_valid_character_name(text) to authenticated;

create function private.validate_character_name()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.display_name is not distinct from old.display_name then return new; end if;
  end if;
  if not private.is_valid_character_name(new.display_name) then
    raise exception 'INVALID_CHARACTER_NAME' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_character_name() from public,anon,authenticated;
-- Existing names remain usable; only new names and renames are validated.
create trigger characters_validate_name before insert or update of display_name on public.characters
for each row execute function private.validate_character_name();

create or replace function private.create_signup_character()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if coalesce(new.is_anonymous,false) then return new; end if;
  insert into public.characters(user_id,display_name)
    values(new.id,normalize(coalesce(new.raw_user_meta_data->>'character_name',''),NFC));
  return new;
end;
$$;
revoke all on function private.create_signup_character() from public,anon,authenticated;

create or replace function public.is_character_name_available(candidate text)
returns boolean language sql stable security definer set search_path='' as $$
  select private.is_valid_character_name(candidate) and not exists(
    select 1 from public.characters where name_key=lower(normalize(candidate,NFC)));
$$;
revoke all on function public.is_character_name_available(text) from public,anon,authenticated;
grant execute on function public.is_character_name_available(text) to anon,authenticated;
