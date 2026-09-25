import { GameLink as Link } from "@/components/game-navigation";

export default function ForumNotFound() {
  return <div className="o-panel-body">
    <p>This board, thread or post is not available. It may have been removed or moved.</p>
    <Link href="/forums">Back to the forums</Link>
  </div>;
}
