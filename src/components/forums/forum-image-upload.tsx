"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useNavigationActivity } from "@/components/game-refresh";
import { gameplay } from "@/config/public";
import type { ForumImageInfo } from "@/lib/forums";

export const forumImageTypes = "image/png,image/jpeg,image/webp,image/gif";
type Uploaded = { image_id: string; width: number; height: number };

// One upload at a time. A request ID is reused when the connection drops, so a retry finds the
// same reservation instead of spending another upload.
export function useForumImageUpload(onUploaded: (imageId: string, info: ForumImageInfo) => void) {
  const [uploading, setUploading] = useState(false), [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useNavigationActivity(uploading);
  async function upload(file: File) {
    if (uploading) return;
    if (!forumImageTypes.split(",").includes(file.type)) { setError("Upload a PNG, JPEG, WebP or GIF image."); return; }
    if (file.size > gameplay.forum.imageUploadMaxBytes) {
      setError(`Images can be at most ${Math.floor(gameplay.forum.imageUploadMaxBytes / (1024 * 1024) * 10) / 10} MB.`);
      return;
    }
    setUploading(true); setError(null);
    const requestId = crypto.randomUUID();
    try {
      for (let attempt = 1; ; attempt++) {
        const form = new FormData();
        form.set("file", file); form.set("request_id", requestId);
        let response: Response;
        try { response = await fetch("/api/forum-images", { method: "POST", body: form }); } catch (reason) {
          if (attempt < 3) continue;
          throw reason;
        }
        const result = await response.json().catch(() => null) as (Uploaded & { error?: string }) | null;
        if (response.ok && result?.image_id) { onUploaded(result.image_id, { width: result.width, height: result.height, removed: false, purged: false }); return; }
        setError(result?.error ?? "The image could not be uploaded. Please try again.");
        return;
      }
    } catch { setError("The image could not be uploaded. Check your connection and try again."); }
    finally { setUploading(false); }
  }
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void upload(file);
  }
  const picker = <input ref={input} type="file" accept={forumImageTypes} hidden onChange={choose} aria-hidden="true" tabIndex={-1} data-forum-image-input />;
  return { uploading, error, clearError: () => setError(null), open: () => input.current?.click(), upload, picker };
}
