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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bplus_config: {
        Row: {
          annual_price_cents: number
          id: number
          lifetime_price_cents: number
          lifetime_quota: number
          lifetime_sold: number
          monthly_price_cents: number
          updated_at: string
        }
        Insert: {
          annual_price_cents?: number
          id?: number
          lifetime_price_cents?: number
          lifetime_quota?: number
          lifetime_sold?: number
          monthly_price_cents?: number
          updated_at?: string
        }
        Update: {
          annual_price_cents?: number
          id?: number
          lifetime_price_cents?: number
          lifetime_quota?: number
          lifetime_sold?: number
          monthly_price_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      bplus_gifts: {
        Row: {
          allocated_at: string | null
          allocated_by: string | null
          amount_cents: number
          created_at: string
          currency: string
          environment: string
          gift_type: Database["public"]["Enums"]["gift_type"]
          id: string
          purchaser_id: string
          recipient_email: string | null
          recipient_user_id: string | null
          status: Database["public"]["Enums"]["gift_status"]
          stripe_session_id: string | null
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          allocated_at?: string | null
          allocated_by?: string | null
          amount_cents?: number
          created_at?: string
          currency?: string
          environment?: string
          gift_type: Database["public"]["Enums"]["gift_type"]
          id?: string
          purchaser_id: string
          recipient_email?: string | null
          recipient_user_id?: string | null
          status?: Database["public"]["Enums"]["gift_status"]
          stripe_session_id?: string | null
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          allocated_at?: string | null
          allocated_by?: string | null
          amount_cents?: number
          created_at?: string
          currency?: string
          environment?: string
          gift_type?: Database["public"]["Enums"]["gift_type"]
          id?: string
          purchaser_id?: string
          recipient_email?: string | null
          recipient_user_id?: string | null
          status?: Database["public"]["Enums"]["gift_status"]
          stripe_session_id?: string | null
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bulletin_hides: {
        Row: {
          bulletin_id: string
          hidden_at: string
          user_id: string
        }
        Insert: {
          bulletin_id: string
          hidden_at?: string
          user_id: string
        }
        Update: {
          bulletin_id?: string
          hidden_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_hides_bulletin_id_fkey"
            columns: ["bulletin_id"]
            isOneToOne: false
            referencedRelation: "bulletins"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletin_reads: {
        Row: {
          bulletin_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          bulletin_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          bulletin_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_reads_bulletin_id_fkey"
            columns: ["bulletin_id"]
            isOneToOne: false
            referencedRelation: "bulletins"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletins: {
        Row: {
          author_id: string
          content_html: string
          created_at: string
          delivery: string
          id: string
          media_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content_html: string
          created_at?: string
          delivery?: string
          id?: string
          media_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content_html?: string
          created_at?: string
          delivery?: string
          id?: string
          media_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      card_backs: {
        Row: {
          created_at: string
          id: string
          image_url: string
          is_active: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          is_active?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          is_active?: boolean
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      founding_members: {
        Row: {
          granted_at: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          user_id: string
        }
        Update: {
          granted_at?: string
          user_id?: string
        }
        Relationships: []
      }
      games: {
        Row: {
          created_at: string
          host_id: string
          id: string
          state: Json
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          host_id: string
          id: string
          state: Json
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          host_id?: string
          id?: string
          state?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          environment: string
          id: string
          paypal_capture_id: string | null
          paypal_order_id: string | null
          paypal_subscription_id: string | null
          plan: Database["public"]["Enums"]["bplus_plan"]
          raw: Json | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          environment?: string
          id?: string
          paypal_capture_id?: string | null
          paypal_order_id?: string | null
          paypal_subscription_id?: string | null
          plan: Database["public"]["Enums"]["bplus_plan"]
          raw?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          environment?: string
          id?: string
          paypal_capture_id?: string | null
          paypal_order_id?: string | null
          paypal_subscription_id?: string | null
          plan?: Database["public"]["Enums"]["bplus_plan"]
          raw?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      public_matches: {
        Row: {
          created_at: string
          game_id: string
          host_id: string
          host_name: string
          max_seats: number
          mode: string
          seats_taken: number
        }
        Insert: {
          created_at?: string
          game_id: string
          host_id: string
          host_name: string
          max_seats: number
          mode: string
          seats_taken?: number
        }
        Update: {
          created_at?: string
          game_id?: string
          host_id?: string
          host_name?: string
          max_seats?: number
          mode?: string
          seats_taken?: number
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      share_events: {
        Row: {
          created_at: string
          id: string
          method: string
          source: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          method: string
          source?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          method?: string
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          environment: string
          id: string
          paypal_subscription_id: string | null
          plan: Database["public"]["Enums"]["bplus_plan"]
          price_id: string | null
          source: string
          status: Database["public"]["Enums"]["bplus_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          environment?: string
          id?: string
          paypal_subscription_id?: string | null
          plan: Database["public"]["Enums"]["bplus_plan"]
          price_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["bplus_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          environment?: string
          id?: string
          paypal_subscription_id?: string | null
          plan?: Database["public"]["Enums"]["bplus_plan"]
          price_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["bplus_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_keybinds: {
        Row: {
          bindings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          bindings?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          bindings?: Json
          updated_at?: string
          user_id?: string
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
          role?: Database["public"]["Enums"]["app_role"]
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
      claim_lifetime_slot: { Args: never; Returns: boolean }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_bimyah_plus: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      release_lifetime_slot: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "user" | "admin"
      bplus_plan: "lifetime" | "monthly" | "annual"
      bplus_status: "active" | "past_due" | "cancelled"
      gift_status: "pending" | "fulfilled" | "refunded"
      gift_type: "friend" | "random"
      payment_status: "completed" | "refunded" | "failed"
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
      app_role: ["user", "admin"],
      bplus_plan: ["lifetime", "monthly", "annual"],
      bplus_status: ["active", "past_due", "cancelled"],
      gift_status: ["pending", "fulfilled", "refunded"],
      gift_type: ["friend", "random"],
      payment_status: ["completed", "refunded", "failed"],
    },
  },
} as const
