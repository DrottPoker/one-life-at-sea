import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { gameplay } from "../../src/config/public";

vi.mock("server-only", () => ({}));
import { ForumImageError, processForumImage, sameOriginRequest } from "../../src/lib/forum-images-server";

function picture(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: "#2a6f97" } });
}

describe("forum image processing", () => {
  it("re-encodes uploads as WebP without their metadata", async () => {
    const input = await picture(64, 48).jpeg().withExif({ IFD0: { Copyright: "Hidden note", Artist: "Somebody" } }).toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const output = await processForumImage(input);
    const metadata = await sharp(output.data).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
    expect([output.width, output.height, output.size]).toEqual([64, 48, output.data.length]);
  });
  it("caps the size and applies the camera rotation", async () => {
    const large = await processForumImage(await picture(gameplay.forum.imageMaxDimension * 2, 100).png().toBuffer());
    expect([large.width, large.height]).toEqual([gameplay.forum.imageMaxDimension, 50]);
    const rotated = await processForumImage(await picture(200, 100).jpeg().withMetadata({ orientation: 6 }).toBuffer());
    expect([rotated.width, rotated.height]).toEqual([100, 200]);
  });
  it("refuses files that are not supported images", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    for (const input of [Buffer.from("not an image"), svg, (await picture(10, 10).png().toBuffer()).subarray(0, 40)]) {
      await expect(processForumImage(input)).rejects.toBeInstanceOf(ForumImageError);
    }
  });
  it("accepts uploads only from the game's own pages", () => {
    const request = (headers: Record<string, string>) => new Request("http://127.0.0.1:3000/api/forum-images", { method: "POST", headers });
    expect(sameOriginRequest(request({ origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(sameOriginRequest(request({ origin: "https://evil.example", host: "127.0.0.1:3000" }))).toBe(false);
    expect(sameOriginRequest(request({ origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000", "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(sameOriginRequest(request({ host: "127.0.0.1:3000" }))).toBe(false);
    expect(sameOriginRequest(request({ origin: "null", host: "127.0.0.1:3000" }))).toBe(false);
  });
});
