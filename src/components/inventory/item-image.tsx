"use client";

import Image from "next/image";
import { useState } from "react";
import { DEFAULT_ITEM_IMAGE } from "@/lib/loot";
import type { InventoryEntry } from "@/lib/inventory";

export function ItemImage({ item, large = false }: { item: Pick<InventoryEntry, "name" | "image_path">; large?: boolean }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const path = !item.image_path || failedPath === item.image_path ? DEFAULT_ITEM_IMAGE : item.image_path;
  return <span className={large ? "o-item-art" : "o-item-thumb"}>
    {<Image src={path} unoptimized={path.startsWith("/api/item-images/") || path.endsWith(".svg")} alt={large ? item.name : ""} width={large ? 280 : 64} height={large ? 190 : 48}
        sizes={large ? "280px" : "64px"} onError={() => setFailedPath(item.image_path)} />}
  </span>;
}

