import { expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "../../src/lib/validation";
import type { Database } from "../../src/lib/database.types";
import { testSql } from "./accounts";

// Lets the next post skip the cooldown, which is not what these tests measure.
export function resetForumCooldown(characterIds: string[]) {
  if (!characterIds.length || !characterIds.every(isUuid)) throw new Error("Invalid forum fixture.");
  testSql("update private.forum_author_stats set last_post_at=null where character_id=any(array[" + characterIds.map(id => "'" + id + "'::uuid").join(",") + "]);");
}

// Image files leave storage through its API, which an administrator may use once the rows are
// purged. Deleting the rows alone would leave the files behind.
export async function removeForumImages(admin: { api: SupabaseClient<Database> }, ownerIds: string[]) {
  if (!ownerIds.length) return;
  if (!ownerIds.every(isUuid)) throw new Error("Invalid forum cleanup ID.");
  const paths = testSql("update private.forum_images set removed_at=coalesce(removed_at,clock_timestamp()),removed_by='moderator',purged_at=coalesce(purged_at,clock_timestamp()) " +
    "where owner_id=any(array[" + ownerIds.map(id => "'" + id + "'::uuid").join(",") + "]) returning storage_path;").split("\n").map(line => line.trim()).filter(Boolean);
  if (paths.length) expect((await admin.api.storage.from("forum-images").remove(paths)).error).toBeNull();
}

// Test threads would otherwise outlive their deleted authors in the shared local forum.
export function cleanupForumThreads(characterIds: string[]) {
  if (!characterIds.length) return;
  if (!characterIds.every(isUuid)) throw new Error("Invalid forum cleanup ID.");
  const ids = "array[" + characterIds.map(id => "'" + id + "'::uuid").join(",") + "]";
  testSql("do $$ declare doomed bigint[]; begin " +
    "delete from private.forum_moderation_log where actor_id=any(" + ids + "); " +
    "select array_agg(id) into doomed from private.forum_threads where author_id=any(" + ids + "); " +
    "delete from private.forum_post_images where image_id in(select id from private.forum_images where owner_id=any(" + ids + "))" +
    " or post_id in(select id from private.forum_posts where thread_id=any(doomed)); " +
    "delete from private.forum_images i where i.owner_id=any(" + ids + ") and not exists(select 1 from private.forum_post_images pi where pi.image_id=i.id); " +
    "if doomed is null then return; end if; " +
    "delete from private.forum_popular_threads where thread_id=any(doomed); " +
    "delete from private.forum_notification_jobs where post_id in(select id from private.forum_posts where thread_id=any(doomed)); " +
    "delete from private.forum_poll_votes where thread_id=any(doomed); " +
    "delete from private.forum_poll_options where thread_id=any(doomed); " +
    "delete from private.forum_polls where thread_id=any(doomed); " +
    "delete from private.forum_reports where post_id in(select id from private.forum_posts where thread_id=any(doomed)); " +
    "delete from private.forum_moderation_log where thread_id=any(doomed) or post_id in(select id from private.forum_posts where thread_id=any(doomed)); " +
    "delete from private.forum_thread_reads where thread_id=any(doomed); " +
    "delete from private.forum_subscriptions where thread_id=any(doomed); " +
    "delete from private.forum_reactions where post_id in(select id from private.forum_posts where thread_id=any(doomed)); " +
    "delete from private.forum_post_revisions where post_id in(select id from private.forum_posts where thread_id=any(doomed)); " +
    "update private.forum_threads set last_post_id=null where id=any(doomed); " +
    "delete from private.forum_posts where thread_id=any(doomed); " +
    "delete from private.forum_threads where id=any(doomed); " +
    "update private.forum_boards b set thread_count=(select count(*) from private.forum_threads t where t.board_id=b.id and t.removed_at is null), " +
    "post_count=(select count(*) from private.forum_posts p join private.forum_threads t on t.id=p.thread_id where t.board_id=b.id and t.removed_at is null and p.removed_at is null); " +
    "end $$;");
}
