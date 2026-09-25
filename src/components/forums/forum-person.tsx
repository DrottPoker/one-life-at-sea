import { GameLink as Link } from "@/components/game-navigation";
import { playerProfileUrl } from "@/lib/player-identity";
import type { ForumBan, ForumPerson } from "@/lib/forums";

// Deleted captains keep their saved name but no longer link to a profile.
// A post its author deleted has no person for players, as on Reddit.
export function ForumPersonLink({ person }: { person: ForumPerson | null }) {
  if (!person) return <span className="o-forum-deleted-person">[deleted]</span>;
  return person.deleted ? <span className="o-forum-deleted-person" title="This captain no longer exists">{person.display_name}</span>
    : <Link href={playerProfileUrl(person.player_number)} prefetch={false}>{person.display_name}</Link>;
}

export function ForumBanNotice({ ban }: { ban: ForumBan }) {
  return <p className="o-forum-warning" role="status">You are banned from posting in the forums{ban.ends_at ? " until " + new Date(ban.ends_at).toUTCString() : ""}.
    You can still read the forums and delete your own posts. Reason: {ban.reason}</p>;
}
