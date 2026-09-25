import { describe, expect, it, vi } from "vitest";
import { gameplay } from "../../src/config/public";
import { directRedirect } from "../../src/lib/direct-redirects";
import type { NavigationLock } from "../../src/lib/game-navigation";

const characterId = "f0f00000-0000-4000-8000-0000000000c1";
const harbor: NavigationLock = { attack: null, hospital_until: null, sea_state: "in_harbor" };

function client(profile: { player_number: number } | null, location: { thread_id: string; post_number: number } | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: profile, error: null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const rpc = vi.fn().mockResolvedValue(location ? { data: location, error: null } : { data: null, error: { message: "FORUM_NOT_FOUND" } });
  return { from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })), rpc, eq } as unknown as Parameters<typeof directRedirect>[0] & { rpc: typeof rpc; eq: typeof eq };
}
const at = (path: string) => new URL("http://127.0.0.1:3000" + path);

describe("direct redirects", () => {
  it("sends the root to the captain's current place", async () => {
    expect(await directRedirect(client(null), at("/"), harbor)).toEqual({ location: "/harbor", permanent: false });
    expect(await directRedirect(client(null), at("/"), { ...harbor, sea_state: "at_sea" })).toEqual({ location: "/sea", permanent: false });
    expect(await directRedirect(client(null), at("/"), { ...harbor, sea_state: null })).toEqual({ location: "/create-character", permanent: false });
  });
  it("resolves legacy character links permanently and leaves unknown ones to the page", async () => {
    const known = client({ player_number: 100042 });
    expect(await directRedirect(known, at("/characters/" + characterId), harbor)).toEqual({ location: "/players/100042", permanent: true });
    expect(known.eq).toHaveBeenCalledWith("character_id", characterId);
    expect(await directRedirect(known, at("/attack/" + characterId), harbor)).toEqual({ location: "/attack/100042", permanent: true });
    expect(await directRedirect(client(null), at("/characters/" + characterId), harbor)).toBeNull();
    expect(await directRedirect(known, at("/attack/100042"), harbor)).toBeNull();
    expect(await directRedirect(known, at("/characters/not-a-uuid"), harbor)).toBeNull();
  });
  it("forwards old mail and preparation links", async () => {
    expect(await directRedirect(client(null), at("/messages/100042"), harbor)).toEqual({ location: "/messages/compose?to=100042", permanent: false });
    expect(await directRedirect(client(null), at("/messages/compose"), harbor)).toBeNull();
    expect(await directRedirect(client(null), at("/combat/prepare/" + characterId), harbor)).toEqual({ location: "/attack/" + characterId, permanent: false });
  });
  it("finds forum permalinks and first unread posts", async () => {
    const located = client(null, { thread_id: "12", post_number: gameplay.forum.postsPageSize + 1 });
    const expected = "/forums/threads/12?page=2#post-" + (gameplay.forum.postsPageSize + 1);
    expect(await directRedirect(located, at("/forums/posts/7"), harbor)).toEqual({ location: expected, permanent: false });
    expect(located.rpc).toHaveBeenLastCalledWith("locate_forum_post", { post_id: "7" });
    expect(await directRedirect(located, at("/forums/threads/12?unread=1"), harbor)).toEqual({ location: expected, permanent: false });
    expect(located.rpc).toHaveBeenLastCalledWith("locate_forum_post", { thread_id: "12" });
    expect(await directRedirect(located, at("/forums/threads/12"), harbor)).toBeNull();
    expect(await directRedirect(client(null), at("/forums/posts/7"), harbor)).toBeNull();
    expect(await directRedirect(located, at("/forums/posts/0"), harbor)).toBeNull();
  });
});
