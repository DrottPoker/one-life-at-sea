import { createClient } from "@/lib/supabase/server";
import { withDatabaseRetry } from "@/lib/database-retry";
import { FORUM_IMAGE_BUCKET } from "@/lib/forums";
import { storedForumImageMatches } from "@/lib/forum-images-server";

const imageName = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.webp$/;
const hidden = new Set(["FORUM_NOT_FOUND", "NOT_AUTHORIZED", "CHARACTER_NOT_FOUND"]);

// The database decides on every request whether this player may see the image, so a hidden or
// purged image disappears at once. Files never change, so a cached copy is only revalidated.
export async function GET(request: Request, { params }: { params: Promise<{ image: string }> }) {
  const match = imageName.exec((await params).image);
  if (!match) return new Response(null, { status: 404 });
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("get_forum_image", { image_id: match[1] }));
  if (error || !data) return new Response(null, { status: !error || hidden.has(error.message) ? 404 : 503, headers: { "Cache-Control": "no-store" } });
  const headers = {
    "Cache-Control": "private, no-cache", ETag: "\"" + match[1] + "\"", "Content-Type": "image/webp",
    "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "same-origin",
  };
  if (request.headers.get("if-none-match") === headers.ETag) return new Response(null, { status: 304, headers });
  const { data: file } = await client.storage.from(FORUM_IMAGE_BUCKET).download(data.path);
  if (!file) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!await storedForumImageMatches(bytes, data)) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(bytes, { headers });
}
