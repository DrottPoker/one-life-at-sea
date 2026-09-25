import { GameLink as Link } from "@/components/game-navigation";
import { playerProfileUrl } from "@/lib/player-identity";
import type { ForumPerson } from "@/lib/forums";

// Deleted captains keep their saved name but no longer link to a profile.
export function ForumPersonLink({ person }: { person: ForumPerson }) {
  return person.deleted ? <span className="o-forum-deleted-person" title="This captain no longer exists">{person.display_name}</span>
    : <Link href={playerProfileUrl(person.player_number)} prefetch={false}>{person.display_name}</Link>;
}
