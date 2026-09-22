import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const name = path.join("/");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/.test(name)) {
    return new Response(null, { status: 404 });
  }
  return NextResponse.redirect(new URL("/storage/v1/object/public/item-images/" + name, process.env.NEXT_PUBLIC_SUPABASE_URL), 307);
}
