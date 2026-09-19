"use client";

import Image from "next/image";
import { useState } from "react";
import { Package } from "lucide-react";
import type { InventoryEntry } from "@/lib/inventory";

export function ItemImage({ item, large = false }: { item: InventoryEntry; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <span className={large ? "o-item-art" : "o-item-thumb"}>
    {failed ? <Package aria-label="Item image unavailable" role="img" /> :
      <Image src={item.image_path} alt={large ? item.name : ""} width={large ? 280 : 64} height={large ? 190 : 48}
        sizes={large ? "280px" : "64px"} onError={() => setFailed(true)} />}
  </span>;
}

