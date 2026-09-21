import "server-only";

import { cache } from "react";
import { connection } from "next/server";
import { worldTimeAt } from "@/lib/world-time";

export const currentWorldTime = cache(async () => {
  await connection();
  return worldTimeAt(Date.now());
});
