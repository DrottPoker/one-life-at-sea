import { isUuid } from "../../src/lib/validation";
import { testSql } from "./accounts";

// Lets the next post skip the cooldown, which is not what these tests measure.
export function resetForumCooldown(characterIds: string[]) {
  if (!characterIds.length || !characterIds.every(isUuid)) throw new Error("Invalid forum fixture.");
  testSql("update private.forum_author_stats set last_post_at=null where character_id=any(array[" + characterIds.map(id => "'" + id + "'::uuid").join(",") + "]);");
}

// Test threads would otherwise outlive their deleted authors in the shared local forum.
export function cleanupForumThreads(characterIds: string[]) {
  if (!characterIds.length) return;
  if (!characterIds.every(isUuid)) throw new Error("Invalid forum cleanup ID.");
  const ids = "array[" + characterIds.map(id => "'" + id + "'::uuid").join(",") + "]";
  testSql("do $$ declare doomed bigint[]; begin " +
    "select array_agg(id) into doomed from private.forum_threads where author_id=any(" + ids + "); " +
    "if doomed is null then return; end if; " +
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
