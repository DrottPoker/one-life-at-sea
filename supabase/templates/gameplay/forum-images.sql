-- Forum images live in a private bucket. The app re-encodes every upload to WebP without metadata
-- before it reaches storage, and serves images through its own route after these checks.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('forum-images','forum-images',false,5242880,array['image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- An upload is reserved before its file is stored and becomes attached when a post first uses it.
-- Moderators hide images from players; an administrator can purge the file for good. An upload must
-- be used within a day; a scheduled sweep deletes its file an hour later and then discards the row.
create table if not exists private.forum_images (
  id uuid primary key,
  owner_id uuid references public.characters(id) on delete set null,
  owner_user_id uuid not null, owner_name text not null, owner_player_number bigint not null,
  request_id uuid not null,
  storage_path text not null unique check(storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'),
  byte_size integer not null check(byte_size between 1 and 5242880),
  width integer not null check(width between 1 and 4096), height integer not null check(height between 1 and 4096),
  created_at timestamptz not null default clock_timestamp(),
  attached_at timestamptz, discarded_at timestamptz,
  removed_at timestamptz, removed_by text check(removed_by='moderator'), purged_at timestamptz,
  constraint forum_images_request unique(owner_id,request_id),
  constraint forum_images_removed check((removed_at is null)=(removed_by is null)),
  constraint forum_images_purged check(purged_at is null or removed_at is not null),
  constraint forum_images_discarded check(discarded_at is null or attached_at is null)
);
create index if not exists forum_images_owner_idx on private.forum_images(owner_id,created_at desc);
-- The images a post's current text shows. Earlier versions keep their tags as text only.
create table if not exists private.forum_post_images (
  post_id bigint not null references private.forum_posts(id),
  image_id uuid not null references private.forum_images(id),
  primary key(post_id,image_id)
);
create index if not exists forum_post_images_image_idx on private.forum_post_images(image_id);
alter table private.forum_images enable row level security;
alter table private.forum_post_images enable row level security;
revoke all on private.forum_images,private.forum_post_images from public,anon,authenticated;

-- Players see an image while a visible post shows it, and always see their own. Moderators see
-- hidden images too, so they can review them.
create or replace function private.forum_image_readable(object_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.forum_images i where i.storage_path=object_name and i.purged_at is null and i.discarded_at is null
    and (private.forum_is_moderator() or (i.removed_at is null and exists(select 1 from public.characters c where c.user_id=auth.uid())
      and (i.owner_user_id=auth.uid() or exists(select 1 from private.forum_post_images pi join private.forum_posts p on p.id=pi.post_id
        join private.forum_threads t on t.id=p.thread_id join private.forum_boards b on b.id=t.board_id
        where pi.image_id=i.id and p.removed_at is null and t.removed_at is null and b.active)))));
$$;
create or replace function private.forum_image_uploadable(object_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.forum_images i where i.storage_path=object_name and i.owner_user_id=auth.uid()
    and i.attached_at is null and i.discarded_at is null and i.removed_at is null);
$$;
-- Administrators remove purged files; the scheduled sweep removes the rest with a service key.
create or replace function private.forum_image_deletable(object_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.forum_images i where i.storage_path=object_name and i.purged_at is not null and private.is_admin());
$$;
revoke all on function private.forum_image_readable(text),private.forum_image_uploadable(text),private.forum_image_deletable(text) from public,anon,authenticated;
grant execute on function private.forum_image_readable(text),private.forum_image_uploadable(text),private.forum_image_deletable(text) to authenticated;
-- Storage deletes only rows its caller can also read, so files that may be deleted stay readable
-- to that caller; the image route still refuses purged images.
drop policy if exists "Forum images are read through forum rules" on storage.objects;
create policy "Forum images are read through forum rules" on storage.objects for select to authenticated using (
  bucket_id='forum-images' and ((select private.forum_image_readable(name)) or (select private.forum_image_deletable(name))));
drop policy if exists "Players upload reserved forum images" on storage.objects;
create policy "Players upload reserved forum images" on storage.objects for insert to authenticated with check (
  bucket_id='forum-images' and (storage.foldername(name))[1]=(select auth.uid())::text and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
  and (select private.forum_image_uploadable(name)));
drop policy if exists "Forum image files are deleted by their rules" on storage.objects;
create policy "Forum image files are deleted by their rules" on storage.objects for delete to authenticated using (
  bucket_id='forum-images' and (select private.forum_image_deletable(name)));

-- Image tags name an upload by ID: [img]id[/img] or [img=description]id[/img]. This finds every
-- tag the post renderer could show, and possibly a few it would print as text.
create or replace function private.forum_image_ids(body text)
returns uuid[] language sql immutable security invoker set search_path='' as $$
  select coalesce(array_agg(distinct lower(m[1])::uuid),'{}'::uuid[]) from regexp_matches(body,
    '\[img(?:=[^]\n]*)?\]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\[/img\]','gi') m;
$$;
-- Links the images a post's text names. A post may show the author's own stored uploads, while
-- an unused upload is younger than a day, and keep images it already showed, even ones a moderator
-- has since hidden. Callers hold the thread lock; image rows are locked after it, in ID order.
create or replace function private.forum_attach_images(target_post bigint,author uuid,body text,observed timestamptz)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare wanted uuid[]:=private.forum_image_ids(body);
begin
  if cardinality(wanted)>{{gameplay.forum.imagesPerPost}} then raise exception 'TOO_MANY_IMAGES' using errcode='22023'; end if;
  perform 1 from private.forum_images i where i.id=any(wanted) order by i.id for no key update;
  if (select count(*) from private.forum_images i where i.id=any(wanted)
    and (exists(select 1 from private.forum_post_images pi where pi.post_id=target_post and pi.image_id=i.id)
      or (i.owner_id=author and i.removed_at is null and i.discarded_at is null and i.purged_at is null
        and (i.attached_at is not null or i.created_at>observed-interval '1 day')
        and exists(select 1 from storage.objects o where o.bucket_id='forum-images' and o.name=i.storage_path))))<>cardinality(wanted) then
    raise exception 'INVALID_IMAGE' using errcode='22023'; end if;
  delete from private.forum_post_images pi where pi.post_id=target_post and pi.image_id<>all(wanted);
  insert into private.forum_post_images(post_id,image_id) select target_post,image_id from unnest(wanted) image_id order by 2 on conflict do nothing;
  update private.forum_images set attached_at=observed where id=any(wanted) and attached_at is null;
end;
$$;
-- Sizes let the page reserve space before an image loads. Players learn only that an image was
-- hidden or deleted.
create or replace function private.forum_post_images_json(target_post bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_object_agg(i.id::text,jsonb_build_object('width',i.width,'height',i.height,'removed',i.removed_at is not null,'purged',i.purged_at is not null))
  from private.forum_post_images pi join private.forum_images i on i.id=pi.image_id where pi.post_id=target_post;
$$;
create or replace function private.forum_image_receipt(image private.forum_images)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('image_id',image.id,'path',image.storage_path,'width',image.width,'height',image.height);
$$;
revoke all on function private.forum_image_ids(text),private.forum_attach_images(bigint,uuid,text,timestamptz),private.forum_post_images_json(bigint),
  private.forum_image_receipt(private.forum_images) from public,anon,authenticated;

-- The app has already re-encoded the file and reports its final size. A repeated request returns
-- the same reservation, so an upload that failed halfway can be retried.
create or replace function private.reserve_forum_image(request_id uuid,byte_size integer,width integer,height integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); observed timestamptz:=clock_timestamp(); actor public.characters%rowtype; image private.forum_images%rowtype; new_id uuid:=gen_random_uuid();
begin
  if reserve_forum_image.request_id is null or byte_size is null or width is null or height is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select * into actor from public.characters c where c.id=viewer_id for no key update;
  select * into image from private.forum_images i where i.owner_id=viewer_id and i.request_id=reserve_forum_image.request_id;
  if found then
    if image.byte_size<>reserve_forum_image.byte_size or image.width<>reserve_forum_image.width or image.height<>reserve_forum_image.height then
      raise exception 'REQUEST_MISMATCH' using errcode='22023'; end if;
    return private.forum_image_receipt(image);
  end if;
  perform private.forum_require_unbanned(viewer_id);
  if actor.created_at>observed-make_interval(hours=>{{gameplay.forum.newCharacterHours}}) then raise exception 'NEW_CHARACTER' using errcode='P0001'; end if;
  if byte_size not between 1 and 5242880 or width not between 1 and {{gameplay.forum.imageMaxDimension}} or height not between 1 and {{gameplay.forum.imageMaxDimension}} then
    raise exception 'INVALID_IMAGE' using errcode='22023'; end if;
  if (select count(*) from private.forum_images i where i.owner_id=viewer_id and i.created_at>observed-interval '1 hour')>={{gameplay.forum.imagesPerHour}} then
    raise exception 'IMAGE_RATE_LIMIT' using errcode='P0001'; end if;
  -- Uploads older than a day can no longer be used, so they do not count.
  if (select count(*) from private.forum_images i where i.owner_id=viewer_id and i.attached_at is null and i.discarded_at is null and i.removed_at is null
    and i.created_at>observed-interval '1 day')>={{gameplay.forum.imagesUnusedMax}} then
    raise exception 'IMAGE_UNUSED_LIMIT' using errcode='P0001'; end if;
  insert into private.forum_images(id,owner_id,owner_user_id,owner_name,owner_player_number,request_id,storage_path,byte_size,width,height,created_at)
    values(new_id,viewer_id,actor.user_id,actor.display_name,actor.player_number,reserve_forum_image.request_id,actor.user_id::text||'/'||new_id::text||'.webp',
      reserve_forum_image.byte_size,reserve_forum_image.width,reserve_forum_image.height,observed) returning * into image;
  return private.forum_image_receipt(image);
end;
$$;
-- The image route asks here before it reads the file with the player's own session.
-- The reserved size and dimensions let the route refuse a file that skipped the upload route.
create or replace function private.get_forum_image(image_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare image private.forum_images%rowtype;
begin
  perform private.combat_captain();
  select * into image from private.forum_images i where i.id=get_forum_image.image_id;
  if image.storage_path is null or not private.forum_image_readable(image.storage_path) then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
  return jsonb_build_object('path',image.storage_path,'byte_size',image.byte_size,'width',image.width,'height',image.height);
end;
$$;
-- Cleanup moved to the scheduled sweep below.
drop function if exists public.list_stale_forum_images();
drop function if exists private.list_stale_forum_images();
drop function if exists public.discard_forum_images(uuid[]);
drop function if exists private.discard_forum_images(uuid[]);
create or replace function public.reserve_forum_image(request_id uuid,byte_size integer,width integer,height integer)
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.reserve_forum_image(request_id,byte_size,width,height); $$;
create or replace function public.get_forum_image(image_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_forum_image(image_id); $$;
revoke all on function private.reserve_forum_image(uuid,integer,integer,integer),public.reserve_forum_image(uuid,integer,integer,integer),
  private.get_forum_image(uuid),public.get_forum_image(uuid) from public,anon,authenticated;
grant execute on function private.reserve_forum_image(uuid,integer,integer,integer),public.reserve_forum_image(uuid,integer,integer,integer),
  private.get_forum_image(uuid),public.get_forum_image(uuid) to authenticated;

-- Files can only leave storage through its API. Every hour this sweep asks the Storage API, with the
-- service key kept in Vault, to delete the files of uploads unused for 25 hours and of purged
-- images whose deletion failed. Rows are discarded only once their file is gone, so a request that
-- failed is simply sent again by the next sweep. Without the Vault secrets forum_storage_url and
-- forum_storage_key the sweep only discards rows whose file is already gone.
create extension if not exists pg_net with schema extensions;
create or replace function private.sweep_forum_images()
returns integer language plpgsql volatile security definer set search_path='' as $$
declare storage_url text; storage_key text; paths jsonb;
begin
  update private.forum_images i set discarded_at=clock_timestamp()
    where i.attached_at is null and i.discarded_at is null and i.created_at<clock_timestamp()-interval '25 hours'
      and not exists(select 1 from storage.objects o where o.bucket_id='forum-images' and o.name=i.storage_path);
  select s.decrypted_secret into storage_url from vault.decrypted_secrets s where s.name='forum_storage_url';
  select s.decrypted_secret into storage_key from vault.decrypted_secrets s where s.name='forum_storage_key';
  select jsonb_agg(swept.storage_path order by swept.created_at) into paths from (
    select i.storage_path,i.created_at from private.forum_images i
      where ((i.attached_at is null and i.discarded_at is null and i.created_at<clock_timestamp()-interval '25 hours') or i.purged_at is not null)
        and exists(select 1 from storage.objects o where o.bucket_id='forum-images' and o.name=i.storage_path)
      order by i.created_at limit 100) swept;
  if paths is null or storage_url is null or storage_key is null then return 0; end if;
  perform net.http_delete(url=>rtrim(storage_url,'/')||'/object/forum-images',
    headers=>jsonb_build_object('Authorization','Bearer '||storage_key,'apikey',storage_key,'Content-Type','application/json'),
    body=>jsonb_build_object('prefixes',paths),timeout_milliseconds=>15000);
  return jsonb_array_length(paths);
end;
$$;
revoke all on function private.sweep_forum_images() from public,anon,authenticated;
select cron.schedule('forum-image-sweep','17 * * * *','select private.sweep_forum_images()');
