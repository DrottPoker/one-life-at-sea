import "server-only";
import sharp from "sharp";
import { gameplay } from "@/config/public";

const acceptedFormats = new Set(["jpeg", "png", "webp", "gif"]);
// The bucket refuses larger files; a re-encoded image within the size limit stays far below it.
const storedMaxBytes = 5 * 1024 * 1024;

export class ForumImageError extends Error {}

// Every upload is decoded and encoded again as WebP. That drops metadata such as camera GPS
// positions and anything else hidden in the file, applies the camera's rotation and caps the size.
// Only the first frame of an animation is kept.
export async function processForumImage(input: Uint8Array) {
  const image = sharp(input, { limitInputPixels: 40_000_000, failOn: "error", animated: false });
  const metadata = await image.metadata().catch(() => null);
  if (!metadata?.format || !acceptedFormats.has(metadata.format)) throw new ForumImageError("Upload a PNG, JPEG, WebP or GIF image.");
  const limit = gameplay.forum.imageMaxDimension;
  const output = await image.rotate().resize({ width: limit, height: limit, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 }).toBuffer({ resolveWithObject: true }).catch(() => null);
  if (!output) throw new ForumImageError("The image could not be read. Try another file.");
  if (output.info.size > storedMaxBytes) throw new ForumImageError("The image is too detailed to store. Try a smaller image.");
  return { data: output.data, width: output.info.width, height: output.info.height, size: output.info.size };
}

// The bucket also takes a player's own upload of a reserved file directly, past this route's
// encoding. A stored file is served only when it is the single-frame WebP without metadata that
// was reserved, with the same size and dimensions.
export async function storedForumImageMatches(bytes: Uint8Array, reserved: { byte_size: number; width: number; height: number }) {
  if (bytes.length !== reserved.byte_size) return false;
  const metadata = await sharp(bytes, { failOn: "error" }).metadata().catch(() => null);
  return metadata?.format === "webp" && (metadata.pages ?? 1) === 1 && metadata.width === reserved.width && metadata.height === reserved.height
    && !metadata.exif && !metadata.xmp;
}

// Uploads come from the game's own pages only.
export function sameOriginRequest(request: Request) {
  const origin = request.headers.get("origin"), host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const site = request.headers.get("sec-fetch-site");
  if (!origin || !host || (site !== null && site !== "same-origin")) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}
