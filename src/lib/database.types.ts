export type Character = {
  id: string;
  user_id: string;
  display_name: string;
  name_key: string;
  location: "the_harbor";
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      characters: {
        Row: Character;
        Insert: { display_name: string };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_character_name_available: { Args: { candidate: string }; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
