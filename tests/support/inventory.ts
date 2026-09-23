import { gameplay } from "../../src/config/public";
import { isUuid } from "../../src/lib/validation";
import { testSql } from "./accounts";

export function seedShipMaterials(characterId: string, quantity = 1000) {
  if (!isUuid(characterId) || !Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Invalid material fixture.");
  const id = "'" + characterId + "'::uuid";
  const items = gameplay.training.shipMaterials.map(item => "'" + item.itemId.replaceAll("'", "''") + "'").sort();
  testSql("begin; select private.lock_combat_context(array[" + id + "]); " +
    "select 1 from private.item_circulation where item_id in (" + items.join(",") + ") order by item_id for update; " +
    "insert into private.item_stacks(character_id,item_id,quantity) select " + id + ",item_id," + quantity +
    " from unnest(array[" + items.join(",") + "]) as materials(item_id) " +
    "on conflict(character_id,item_id) do update set quantity=greatest(item_stacks.quantity,excluded.quantity); " +
    "select private.notify_training(" + id + "); commit;");
}
