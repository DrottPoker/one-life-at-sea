import { currentWorldTime } from "@/lib/world-time-server";

export async function GET() {
  return Response.json(await currentWorldTime(), {
    headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" },
  });
}
