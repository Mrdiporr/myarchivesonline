export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          created_at: string
          current_hash: string
          id: string
          ip_address: string
          metadata: Json | null
          previous_hash: string | null
          target_id: string
          target_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          current_hash: string
          id?: string
          ip_address?: string
          metadata?: Json | null
          previous_hash?: string | null
          target_id: string
          target_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          current_hash?: string
          id?: string
          ip_address?: string
          metadata?: Json | null
          previous_hash?: string | null
          target_id?: string
          target_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      case_proceedings: {
        Row: {
          case_id: string
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          presiding_judge: string
          session_date: string
          status: string
          summary_notes: string | null
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          presiding_judge: string
          session_date: string
          status?: string
          summary_notes?: string | null
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          presiding_judge?: string
          session_date?: string
          status?: string
          summary_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_proceedings_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          case_title: string
          created_at: string
          created_by: string
          date_delivered: string | null
          deleted_at: string | null
          document_type: string
          id: string
          is_sealed: boolean
          normalized_suit_number: string
          status: string
          subject_matter: string
          suit_number: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          case_title: string
          created_at?: string
          created_by: string
          date_delivered?: string | null
          deleted_at?: string | null
          document_type: string
          id?: string
          is_sealed?: boolean
          normalized_suit_number: string
          status?: string
          subject_matter: string
          suit_number: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          case_title?: string
          created_at?: string
          created_by?: string
          date_delivered?: string | null
          deleted_at?: string | null
          document_type?: string
          id?: string
          is_sealed?: boolean
          normalized_suit_number?: string
          status?: string
          subject_matter?: string
          suit_number?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      document_files: {
        Row: {
          attachable_id: string
          attachable_type: string
          created_at: string
          created_by: string
          deleted_at: string | null
          file_hash: string
          file_size: number
          id: string
          mime_type: string
          original_filename: string
          storage_path: string
        }
        Insert: {
          attachable_id: string
          attachable_type: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          file_hash: string
          file_size: number
          id?: string
          mime_type: string
          original_filename: string
          storage_path: string
        }
        Update: {
          attachable_id?: string
          attachable_type?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          file_hash?: string
          file_size?: number
          id?: string
          mime_type?: string
          original_filename?: string
          storage_path?: string
        }
        Relationships: []
      }
      domain_events: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          created_by: string | null
          event_name: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          created_by?: string | null
          event_name: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          created_by?: string | null
          event_name?: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      append_audit_event: {
        Args: {
          _action: string
          _ip_address?: string
          _metadata?: Json
          _target_id: string
          _target_type: string
          _user_agent?: string
        }
        Returns: string
      }
      can_view_sealed: { Args: { _user_id: string }; Returns: boolean }
      emit_domain_event: {
        Args: {
          _event_name: string
          _payload?: Json
          _target_id: string
          _target_type: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      verify_audit_chain: {
        Args: { _limit?: number }
        Returns: {
          created_at: string
          id: string
          valid: boolean
        }[]
      }
    }
    Enums: {
      app_role: "administrator" | "judge" | "clerk"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["administrator", "judge", "clerk"],
    },
  },
} as const
