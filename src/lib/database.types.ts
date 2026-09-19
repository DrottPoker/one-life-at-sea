import type { CirculationHistory, CirculationPeriod } from "@/lib/circulation";
import type { InventoryEntryType, InventoryPage, TrashReceipt } from "@/lib/inventory";
import type { TrainingReceipt } from "@/lib/training";
import type { HospitalPatient, HospitalRoster, HospitalStatus } from "@/lib/hospital";
import type { BankDirection, BankTransfer } from "@/lib/bank";
import type { HarborPlayer, HarborRoster } from "@/lib/harbor";
import type { GameState, TrainingGroup, Stat } from "@/lib/game";
import type { AttackLock, CombatLog, Battle, CombatPreview, CombatResponse, CombatError, DefenceOrder, CombatOrder } from "@/lib/combat";

export type Character = {
  id: string;
  user_id: string;
  display_name: string;
  name_key: string;
  location: "the_harbor";
  created_at: string;
  energy_updated_at: string;
  ship_recovery_at: string;
  crew_recovery_at: string;
  hospital_started_at: string | null;
  hospital_until: string | null;
  energy: number;
  gold_coins: number;
  bank_gold_coins: number;
  ship_health: number;
  crew_health: number;
  defence_order: DefenceOrder;
  protected_until: string | null;
} & Record<`${TrainingGroup}_${Stat}`, number>;

export type CharacterProfile = { character_id: string } & Pick<Character, "display_name" | "location" | "created_at">;

export type Database = {
  public: {
    Tables: {
      hospital_patients: { Row: HospitalPatient; Insert: never; Update: never; Relationships: [] };
      player_game_events: { Row: { character_id: string; revision: number }; Insert: never; Update: never; Relationships: [] };
      character_profiles: { Row: CharacterProfile; Insert: never; Update: never; Relationships: [] };
      harbor_players: { Row: HarborPlayer; Insert: never; Update: never; Relationships: [] };
      characters: {
        Row: Character;
        Insert: { display_name: string };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_item_circulation: { Args: { target_item: string; period?: CirculationPeriod }; Returns: CirculationHistory };
      list_inventory: { Args: { category_id?: string; search_term?: string; requested_page?: number }; Returns: InventoryPage };
      trash_inventory_item: { Args: { entry_id: string; entry_type: InventoryEntryType; quantity: number; request_id: string }; Returns: TrashReceipt };
      get_gameplay_revision: { Args: Record<string, never>; Returns: string };
      list_harbor_players: { Args: { requested_page?: number }; Returns: HarborRoster };
      is_character_name_available: { Args: { candidate: string }; Returns: boolean };
      list_hospital_patients: { Args: { requested_page?: number }; Returns: HospitalRoster };
      get_hospital_status: { Args: { target_id: string }; Returns: HospitalStatus };
      get_navigation_lock: { Args: Record<string, never>; Returns: { attack: AttackLock | null; hospital_until: string | null } };
      get_attack_lock: { Args: Record<string, never>; Returns: AttackLock | null };
      get_combat_log: { Args: { battle_id: string }; Returns: CombatLog | null };
      get_game_state: { Args: Record<string, never>; Returns: GameState | null };
      transfer_gold: { Args: { direction: BankDirection; amount: number; request_id: string }; Returns: BankTransfer };
      train_crew: { Args: { stat: Stat; expected_tier_id: string; request_id: string }; Returns: TrainingReceipt };
      start_ship_upgrade: { Args: { stat: Stat; size_id: string; expected_workshop_id: string; request_id: string }; Returns: TrainingReceipt };
      purchase_training_tier: { Args: { training_group: TrainingGroup; tier_id: string; request_id: string }; Returns: TrainingReceipt };
      get_combat_preview: { Args: { target_id: string }; Returns: CombatPreview | CombatError };
      start_combat: { Args: { target_id: string; request_id: string }; Returns: CombatResponse };
      get_combat: { Args: { battle_id: string }; Returns: Battle | null };
      submit_combat_order: { Args: { battle_id: string; expected_round: number; player_order: CombatOrder; request_id: string }; Returns: CombatResponse };
      save_defence_orders: { Args: { preset: DefenceOrder }; Returns: { preset: DefenceOrder } };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
