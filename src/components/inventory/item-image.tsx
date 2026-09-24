"use client";

import Image from "next/image";
import { Package } from "lucide-react";
import { useState } from "react";
import { DEFAULT_ITEM_IMAGE } from "@/lib/loot";
import type { InventoryEntry } from "@/lib/inventory";

// Sizes: list thumbnail, detail art, and the loadout's tile and focus images.
const variants = {
  thumb: { className: "o-item-thumb", width: 64, height: 48 },
  large: { className: "o-item-art", width: 280, height: 190 },
  tile: { className: "o-item-tile-art", width: 72, height: 48 },
  focus: { className: "o-item-focus-art", width: 120, height: 80 },
};

export function ItemImage({ item, large = false, variant }: { item: Pick<InventoryEntry, "name" | "image_path">; large?: boolean; variant?: "tile" | "focus" }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const path = !item.image_path || failedPath === item.image_path ? DEFAULT_ITEM_IMAGE : item.image_path;
  const size = variants[variant ?? (large ? "large" : "thumb")];
  // The framed placeholder art would draw a box inside the loadout's own frame, so the loadout shows its bare glyph.
  if (variant && path === DEFAULT_ITEM_IMAGE) return <span className={size.className}><Package aria-hidden="true" /></span>;
  return <span className={size.className}>
    {<Image src={path} unoptimized={path.startsWith("/api/item-images/") || path.endsWith(".svg")} alt={large || variant === "focus" ? item.name : ""}
        width={size.width} height={size.height} sizes={size.width + "px"} onError={() => setFailedPath(item.image_path)} />}
  </span>;
}

