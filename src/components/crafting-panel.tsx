"use client";

import { useActionState, useRef } from "react";
import { ArrowRight, Check, Zap } from "lucide-react";
import { frontend } from "@/config/public";
import { useGameState } from "@/components/game-state";
import { useEconomyRequests } from "@/components/economy-requests";
import { ItemImage } from "@/components/inventory/item-image";
import type { CraftingRecipe, CraftingResult } from "@/lib/crafting";

const format = new Intl.NumberFormat(frontend.site.locale);

export function CraftingPanel({ recipes }: { recipes: CraftingRecipe[] }) {
  const state = useGameState(), journal = useEconomyRequests();
  const request = useRef<FormData | null>(null);
  const [result, action, pending] = useActionState<CraftingResult, FormData>(async (_previous, form) => {
    if (!request.current) { form.set("request_id", crypto.randomUUID()); request.current = form; }
    const recipe = String(request.current.get("recipe_id"));
    const response = await journal.crafting(request.current);
    if (!response.retry) request.current = null;
    return { ...response, recipe_id: recipe };
  }, {});
  const locked = !!state.active_combat_id || !!state.hospital_until || state.sea.state !== "in_harbor";
  return <div className="o-crafting">
    <p className="o-crafting-intro">Turn your materials into useful items. Crafted items go straight into your inventory.</p>
    {locked && <p className="o-copy">Crafting is available at your hideout, outside combat and hospital.</p>}
    {!recipes.length && <p className="o-copy">No recipes are available right now.</p>}
    <div className="o-crafting-recipes">{recipes.map(recipe => {
      const enough = recipe.ingredients.every(item => item.owned >= item.quantity);
      const full = recipe.output.owned > Number.MAX_SAFE_INTEGER - recipe.output.quantity;
      const retry = !!result.retry && result.recipe_id === recipe.id;
      return <section key={recipe.id} className="o-crafting-recipe" aria-labelledby={"recipe-" + recipe.id}>
        <header className="o-crafting-heading"><h2 id={"recipe-" + recipe.id}>{recipe.name}</h2><span><Zap aria-hidden="true" />Instant craft</span><span>+{format.format(recipe.xp_gain)} Crafting XP</span></header>
        <div className="o-crafting-formula">
          <div className="o-crafting-ingredients">{recipe.ingredients.map(item => <div className="o-crafting-item" key={item.item_id}>
            <ItemImage item={item} /><div><strong>{format.format(item.quantity)} × {item.name}</strong>
              <span className={item.owned >= item.quantity ? "o-crafting-enough" : "o-crafting-missing"}>
                <output aria-label={item.name + " owned"}>{format.format(item.owned)}</output> owned
                {item.owned >= item.quantity ? <Check aria-label="Enough materials" /> : " · Need " + format.format(item.quantity - item.owned) + " more"}
              </span></div>
          </div>)}</div>
          <ArrowRight className="o-crafting-arrow" aria-hidden="true" />
          <div className="o-crafting-item o-crafting-output"><ItemImage item={recipe.output} /><div>
            <strong>{format.format(recipe.output.quantity)} × {recipe.name}</strong>
            <span><output aria-label={recipe.output.name + " owned"}>{format.format(recipe.output.owned)}</output> owned</span>
          </div></div>
        </div>
        <form action={action} className="o-crafting-action" aria-label={"Craft " + recipe.name} aria-busy={pending}>
          <input type="hidden" name="recipe_id" value={recipe.id} />
          <input type="hidden" name="expected_version" value={recipe.version} />
          <p>{full ? "Your output stack is full." : enough ? "All materials ready." : "Gather the missing materials to craft this item."}</p>
          <button type="submit" className="o-training-button" disabled={pending || (!retry && (locked || journal.unconfirmed || !!result.retry || !enough || full))}>
            {pending ? "Crafting..." : retry ? "Check crafting" : "Craft " + recipe.name}
          </button>
        </form>
      </section>;
    })}</div>
    <p className={"o-crafting-feedback" + (result.error ? " o-crafting-missing" : "")} role="status" aria-atomic="true">{result.message}</p>
  </div>;
}
