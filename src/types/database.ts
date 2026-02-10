export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.1'
  }
  public: {
    Tables: {
      _prisma_migrations: {
        Row: {
          applied_steps_count: number
          checksum: string
          finished_at: string | null
          id: string
          logs: string | null
          migration_name: string
          rolled_back_at: string | null
          started_at: string
        }
        Insert: {
          applied_steps_count?: number
          checksum: string
          finished_at?: string | null
          id: string
          logs?: string | null
          migration_name: string
          rolled_back_at?: string | null
          started_at?: string
        }
        Update: {
          applied_steps_count?: number
          checksum?: string
          finished_at?: string | null
          id?: string
          logs?: string | null
          migration_name?: string
          rolled_back_at?: string | null
          started_at?: string
        }
        Relationships: []
      }
      consultations: {
        Row: {
          company_name: string
          contact: string
          created_at: string | null
          expected_revenue: number | null
          id: string
          is_test: boolean
          is_visible: boolean
          last_viewed_at: string | null
          manager_name: string
          status: Database['public']['Enums']['consultation_status'] | null
          metadata: Json | null
        }
        Insert: {
          company_name: string
          contact: string
          created_at?: string | null
          expected_revenue?: number | null
          id?: string
          is_test?: boolean
          is_visible?: boolean
          last_viewed_at?: string | null
          manager_name: string
          status?: Database['public']['Enums']['consultation_status'] | null
          metadata?: Json | null
        }
        Update: {
          company_name?: string
          contact?: string
          created_at?: string | null
          expected_revenue?: number | null
          id?: string
          is_test?: boolean
          is_visible?: boolean
          last_viewed_at?: string | null
          manager_name?: string
          status?: Database['public']['Enums']['consultation_status'] | null
          metadata?: Json | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          companyName: string | null
          createdAt: string
          email: string
          id: string
          name: string | null
          painPoints: Json | null
          phone: string | null
          source: string | null
          status: Database['public']['Enums']['LeadStatus']
          updatedAt: string
        }
        Insert: {
          companyName?: string | null
          createdAt?: string
          email: string
          id: string
          name?: string | null
          painPoints?: Json | null
          phone?: string | null
          source?: string | null
          status?: Database['public']['Enums']['LeadStatus']
          updatedAt: string
        }
        Update: {
          companyName?: string | null
          createdAt?: string
          email?: string
          id?: string
          name?: string | null
          painPoints?: Json | null
          phone?: string | null
          source?: string | null
          status?: Database['public']['Enums']['LeadStatus']
          updatedAt?: string
        }
        Relationships: []
      }
      marketing_contents: {
        Row: {
          content: string
          createdAt: string
          id: string
          persona: string
          platform: string
          status: Database['public']['Enums']['ContentStatus']
          title: string
          updatedAt: string
        }
        Insert: {
          content: string
          createdAt?: string
          id: string
          persona: string
          platform: string
          status?: Database['public']['Enums']['ContentStatus']
          title: string
          updatedAt: string
        }
        Update: {
          content?: string
          createdAt?: string
          id?: string
          persona?: string
          platform?: string
          status?: Database['public']['Enums']['ContentStatus']
          title?: string
          updatedAt?: string
        }
        Relationships: []
      }
      consultation_messages: {
        Row: {
          id: string
          consultation_id: string
          sender_id: string
          content: string
          message_type: string
          file_url: string | null
          file_name: string | null
          created_at: string
          metadata: Json | null
          is_visible: boolean
        }
        Insert: {
          id?: string
          consultation_id: string
          sender_id?: string
          content?: string
          message_type?: string
          file_url?: string | null
          file_name?: string | null
          created_at?: string
          metadata?: Json | null
          is_visible?: boolean
        }
        Update: {
          id?: string
          consultation_id?: string
          sender_id?: string
          content?: string
          message_type?: string
          file_url?: string | null
          file_name?: string | null
          created_at?: string
          metadata?: Json | null
          is_visible?: boolean
        }
        Relationships: []
      }
      estimates: {
        Row: {
          id: string
          consultation_id: string
          payload: Json
          final_proposal_data: Json | null
          supply_total: number
          vat: number
          grand_total: number
          approved_at: string | null
          created_at: string
          is_test: boolean
          is_visible: boolean
        }
        Insert: {
          id?: string
          consultation_id: string
          payload?: Json
          final_proposal_data?: Json | null
          supply_total?: number
          vat?: number
          grand_total?: number
          approved_at?: string | null
          created_at?: string
          is_test?: boolean
          is_visible?: boolean
        }
        Update: {
          id?: string
          consultation_id?: string
          payload?: Json
          final_proposal_data?: Json | null
          supply_total?: number
          vat?: number
          grand_total?: number
          approved_at?: string | null
          created_at?: string
          is_test?: boolean
          is_visible?: boolean
        }
        Relationships: []
      }
      order_documents: {
        Row: {
          id: string
          consultation_id: string
          storage_path: string
          file_name: string
          file_type: string
          thumbnail_path: string | null
          product_tags: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          consultation_id: string
          storage_path: string
          file_name: string
          file_type: string
          thumbnail_path?: string | null
          product_tags?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          consultation_id?: string
          storage_path?: string
          file_name?: string
          file_type?: string
          thumbnail_path?: string | null
          product_tags?: Json | null
          created_at?: string | null
        }
        Relationships: []
      }
      project_images: {
        Row: {
          id: string
          cloudinary_public_id: string
          usage_type: string
          display_name: string | null
          storage_path: string | null
          thumbnail_path: string | null
          consultation_id: string | null
          project_title: string | null
          industry: string | null
          view_count: number
          created_at: string
          product_tags: Json | null
          color: string | null
          status: string
          content_hash: string | null
        }
        Insert: {
          id?: string
          cloudinary_public_id: string
          usage_type?: string
          display_name?: string | null
          storage_path?: string | null
          thumbnail_path?: string | null
          consultation_id?: string | null
          project_title?: string | null
          industry?: string | null
          view_count?: number
          created_at?: string
          product_tags?: Json | null
          color?: string | null
          status?: string
          content_hash?: string | null
        }
        Update: {
          id?: string
          cloudinary_public_id?: string
          usage_type?: string
          display_name?: string | null
          storage_path?: string | null
          thumbnail_path?: string | null
          consultation_id?: string | null
          project_title?: string | null
          industry?: string | null
          view_count?: number
          created_at?: string
          product_tags?: Json | null
          color?: string | null
          status?: string
          content_hash?: string | null
        }
        Relationships: []
      }
      tag_mappings: {
        Row: {
          id: string
          product_name: string
          cloudinary_tag: string
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          product_name: string
          cloudinary_tag: string
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          product_name?: string
          cloudinary_tag?: string
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      vendor_price_book: {
        Row: {
          id: string
          product_name: string
          cost: number
          image_url: string | null
          vendor_name: string | null
          spec: string | null
          description: string | null
          created_at: string | null
          updated_at: string | null
          is_test: boolean
          is_visible: boolean
          site_name: string | null
          color: string | null
          quantity: number | null
          quote_date: string | null
          memo: string | null
        }
        Insert: {
          id?: string
          product_name: string
          cost?: number
          image_url?: string | null
          vendor_name?: string | null
          spec?: string | null
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
          is_test?: boolean
          is_visible?: boolean
          site_name?: string | null
          color?: string | null
          quantity?: number | null
          quote_date?: string | null
          memo?: string | null
        }
        Update: {
          id?: string
          product_name?: string
          cost?: number
          image_url?: string | null
          vendor_name?: string | null
          spec?: string | null
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
          is_test?: boolean
          is_visible?: boolean
          site_name?: string | null
          color?: string | null
          quantity?: number | null
          quote_date?: string | null
          memo?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      consultations_with_golden_time: {
        Row: {
          company_name: string | null
          contact: string | null
          created_at: string | null
          expected_revenue: number | null
          id: string | null
          is_golden_time: boolean | null
          manager_name: string | null
          status: Database['public']['Enums']['consultation_status'] | null
        }
        Insert: {
          company_name?: string | null
          contact?: string | null
          created_at?: string | null
          expected_revenue?: number | null
          id?: string | null
          is_golden_time?: never
          manager_name?: string | null
          status?: Database['public']['Enums']['consultation_status'] | null
        }
        Update: {
          company_name?: string | null
          contact?: string | null
          created_at?: string | null
          expected_revenue?: number | null
          id?: string | null
          is_golden_time?: never
          manager_name?: string | null
          status?: Database['public']['Enums']['consultation_status'] | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      consultation_status:
        | '상담중'
        | '견적발송'
        | '계약완료'
        | '휴식기'
        | '거절'
        | '무효'
        | 'AS_WAITING'
      ContentStatus: 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED'
      LeadStatus:
        | 'NEW'
        | 'CONTACTED'
        | 'QUALIFIED'
        | 'CLOSED_WON'
        | 'CLOSED_LOST'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      consultation_status: ['상담중', '견적발송', '계약완료', '휴식기', '거절', '무효', 'AS_WAITING'],
      ContentStatus: ['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'],
      LeadStatus: [
        'NEW',
        'CONTACTED',
        'QUALIFIED',
        'CLOSED_WON',
        'CLOSED_LOST',
      ],
    },
  },
} as const
