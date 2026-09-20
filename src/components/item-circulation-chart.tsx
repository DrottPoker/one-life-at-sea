"use client";

import { ItemHistoryChart } from "@/components/item-history-chart";

export function ItemCirculationChart({ itemId, name, circulation, id }: {
  itemId: string; name: string; circulation: string; id: string;
}) {
  return <ItemHistoryChart itemId={itemId} name={name} total={circulation} id={id} metric="circulation" />;
}
