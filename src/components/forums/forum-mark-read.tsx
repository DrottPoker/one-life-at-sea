"use client";

import { useState, useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { useNavigationActivity } from "@/components/game-refresh";
import { markForumBoardRead } from "@/app/forum-actions";

export function ForumMarkRead({ characterId, boardId }: { characterId: string; boardId: string | null }) {
  const [error, setError] = useState<string | null>(null), [pending, start] = useTransition();
  useNavigationActivity(pending);
  return <div className="o-forum-mark-read">
    <button type="button" className="o-text-button" disabled={pending} onClick={() => start(async () => {
      try { setError(await markForumBoardRead(characterId, boardId)); } catch { setError("The forum could not be marked as read. Please try again."); }
    })}><CheckCheck aria-hidden="true" />{pending ? "Marking..." : boardId ? "Mark board read" : "Mark all read"}</button>
    {error && <span role="alert" className="o-field-error">{error}</span>}
  </div>;
}
