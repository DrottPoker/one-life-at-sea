import { createClient } from "@/lib/supabase/server";
import { withDatabaseRetry } from "@/lib/database-retry";
import { isUuid } from "@/lib/validation";
import { gameplay } from "@/config/public";
import { ForumImageError, processForumImage, sameOriginRequest } from "@/lib/forum-images-server";
import { FORUM_IMAGE_BUCKET } from "@/lib/forums";

const megabytes = Math.floor(gameplay.forum.imageUploadMaxBytes / (1024 * 1024) * 10) / 10;
const tooLarge = `Images can be at most ${megabytes} MB.`;
const messages: Record<string, string> = {
  NEW_CHARACTER: `New captains can upload images after ${gameplay.forum.newCharacterHours} hours.`,
  FORUM_BANNED: "You are banned from posting in the forums.",
  IMAGE_RATE_LIMIT: `You can upload at most ${gameplay.forum.imagesPerHour} images per hour.`,
  IMAGE_UNUSED_LIMIT: `You already have ${gameplay.forum.imagesUnusedMax} images that no post uses. Post them or try again tomorrow.`,
  INVALID_IMAGE: "This image is too large.",
  REQUEST_MISMATCH: "This upload does not match the first attempt. Choose the image again.",
};

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
function alreadyStored(error: unknown) {
  return !!error && typeof error === "object" && "statusCode" in error && error.statusCode === "409";
}

// Uploads use a route instead of a Server Action so the size is checked before the body is read.
// The file is re-encoded here; the database reserves it under the player's limits, and the
// player's own session stores it, so storage policies check the reservation again.
export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return reply(403, { error: "Upload images from the forum page." });
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > gameplay.forum.imageUploadMaxBytes + 64 * 1024) return reply(413, { error: tooLarge });
  const client = await createClient();
  const { data: claims } = await client.auth.getClaims();
  if (!claims) return reply(401, { error: "Sign in again to upload images." });
  let form: FormData;
  try { form = await request.formData(); } catch { return reply(400, { error: "Choose an image to upload." }); }
  const file = form.get("file"), requestId = form.get("request_id");
  if (!(file instanceof File) || file.size < 1 || !isUuid(requestId)) return reply(400, { error: "Choose an image to upload." });
  if (file.size > gameplay.forum.imageUploadMaxBytes) return reply(413, { error: tooLarge });
  let image: Awaited<ReturnType<typeof processForumImage>>;
  try { image = await processForumImage(new Uint8Array(await file.arrayBuffer())); } catch (error) {
    if (error instanceof ForumImageError) return reply(422, { error: error.message });
    throw error;
  }
  const { data: reservation, error } = await withDatabaseRetry(() => client.rpc("reserve_forum_image", {
    request_id: requestId, byte_size: image.size, width: image.width, height: image.height,
  }));
  if (error || !reservation) {
    const known = error && Object.hasOwn(messages, error.message) ? messages[error.message] : null;
    return reply(known ? 409 : 503, { error: known ?? "The image could not be saved. Please try again." });
  }
  // A retried request finds its file already stored.
  const stored = await client.storage.from(FORUM_IMAGE_BUCKET).upload(reservation.path, image.data, { contentType: "image/webp", upsert: false });
  if (stored.error && !alreadyStored(stored.error)) return reply(503, { error: "The image could not be stored. Please try again." });
  return reply(200, { image_id: reservation.image_id, width: reservation.width, height: reservation.height });
}
