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
} & Omit<GameState, "energy_next_at" | "observed_at" | "health_next_at" | "combat_next_at" | "active_combat_id" | "last_combat_id" | "active_attack">;

export type CharacterProfile = { character_id: string } & Pick<Character, "display_name" | "location" | "created_at">;

export type Database = {
  public: {
    Tables: {
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
      get_gameplay_revision: { Args: Record<string, never>; Returns: string };
      list_harbor_players: { Args: { requested_page?: number }; Returns: HarborRoster };
      is_character_name_available: { Args: { candidate: string }; Returns: boolean };
      get_attack_lock: { Args: Record<string, never>; Returns: AttackLock | null };
      get_combat_log: { Args: { battle_id: string }; Returns: CombatLog | null };
      get_game_state: { Args: Record<string, never>; Returns: GameState | null };
      train_stat: { Args: { training_group: TrainingGroup; stat: Stat }; Returns: undefined };
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
