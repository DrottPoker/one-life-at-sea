export type CraftingItem = { item_id: string; name: string; quantity: number };
export type CraftingStock = CraftingItem & { image_path: string; owned: number };
export type CraftingRecipe = { id: string; name: string; version: string; xp_gain: number; output: CraftingStock; ingredients: CraftingStock[] };
export type CraftingReceipt = { recipe_id: string; recipe_name: string; output: CraftingItem; consumed: CraftingItem[];
  progression?: { xp_awarded: number; xp: number; previous_level: number; level: number; character_level: number };
};
export type CraftingResult = { error?: boolean; retry?: boolean; recipe_id?: string; message?: string; receipt?: CraftingReceipt };

export function parseCraftingForm(form: FormData) {
  const recipe = form.get("recipe_id"), version = form.get("expected_version");
  if (typeof recipe !== "string" || !/^[a-z][a-z0-9_]{0,47}$/.test(recipe) ||
    typeof version !== "string" || !/^[a-f0-9]{64}$/.test(version)) return null;
  return { recipe_id: recipe, expected_version: version };
}

// Awarded XP and level-ups show in the shared XP drop.
export function craftingMessage(receipt: CraftingReceipt) {
  return "Crafted " + receipt.output.quantity + " × " + receipt.recipe_name + ". Used " +
    receipt.consumed.map(item => item.quantity + " × " + item.name).join(", ") + ".";
}
