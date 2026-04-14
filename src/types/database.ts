export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      showroom_shorts_jobs: {
        Row: {
          id: string
          status: string
          prompt_text: string
          before_asset_id: string
          after_asset_id: string
          before_asset_url: string | null
          after_asset_url: string | null
          before_after_group_key: string | null
          source_video_url: string | null
          final_video_url: string | null
          requested_channels: string[]
          kling_job_id: string | null
          kling_status: string | null
          source_aspect_ratio: string
          final_aspect_ratio: string
          duration_seconds: number
          is_muted: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          status?: string
          prompt_text: string
          before_asset_id: string
          after_asset_id: string
          before_asset_url?: string | null
          after_asset_url?: string | null
          before_after_group_key?: string | null
          source_video_url?: string | null
          final_video_url?: string | null
          requested_channels?: string[]
          kling_job_id?: string | null
          kling_status?: string | null
          source_aspect_ratio?: string
          final_aspect_ratio?: string
          duration_seconds?: number
          is_muted?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          status?: string
          prompt_text?: string
          before_asset_id?: string
          after_asset_id?: string
          before_asset_url?: string | null
          after_asset_url?: string | null
          before_after_group_key?: string | null
          source_video_url?: string | null
          final_video_url?: string | null
          requested_channels?: string[]
          kling_job_id?: string | null
          kling_status?: string | null
          source_aspect_ratio?: string
          final_aspect_ratio?: string
          duration_seconds?: number
          is_muted?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      showroom_shorts_targets: {
        Row: {
          id: string
          shorts_job_id: string
          channel: string
          title: string
          description: string
          hashtags: string[]
          first_comment: string
          publish_status: string
          external_post_id: string | null
          external_post_url: string | null
          preparation_payload: Json
          preparation_error: string | null
          approved_at: string | null
          prepared_at: string | null
          launch_ready_at: string | null
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          shorts_job_id: string
          channel: string
          title: string
          description?: string
          hashtags?: string[]
          first_comment?: string
          publish_status?: string
          external_post_id?: string | null
          external_post_url?: string | null
          preparation_payload?: Json
          preparation_error?: string | null
          approved_at?: string | null
          prepared_at?: string | null
          launch_ready_at?: string | null
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          shorts_job_id?: string
          channel?: string
          title?: string
          description?: string
          hashtags?: string[]
          first_comment?: string
          publish_status?: string
          external_post_id?: string | null
          external_post_url?: string | null
          preparation_payload?: Json
          preparation_error?: string | null
          approved_at?: string | null
          prepared_at?: string | null
          launch_ready_at?: string | null
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      showroom_shorts_logs: {
        Row: {
          id: string
          shorts_job_id: string
          target_id: string | null
          stage: string
          message: string
          payload: Json
          created_at: string
        }
        Insert: {
          id?: string
          shorts_job_id: string
          target_id?: string | null
          stage: string
          message: string
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          shorts_job_id?: string
          target_id?: string | null
          stage?: string
          message?: string
          payload?: Json
          created_at?: string
        }
      }
      showroom_cta_visits: {
        Row: {
          id: string
          visitor_key: string
          session_id: string
          source: string | null
          channel: string
          cta: string
          content_job_id: string | null
          target_id: string | null
          landing_path: string
          landing_query: string | null
          referrer_host: string | null
          user_agent: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          visitor_key: string
          session_id: string
          source?: string | null
          channel: string
          cta: string
          content_job_id?: string | null
          target_id?: string | null
          landing_path?: string
          landing_query?: string | null
          referrer_host?: string | null
          user_agent?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          visitor_key?: string
          session_id?: string
          source?: string | null
          channel?: string
          cta?: string
          content_job_id?: string | null
          target_id?: string | null
          landing_path?: string
          landing_query?: string | null
          referrer_host?: string | null
          user_agent?: string | null
          metadata?: Json
          created_at?: string
        }
      }
      showroom_basic_shorts_drafts: {
        Row: {
          id: string
          status: string
          display_name: string
          industry: string | null
          product_summary: string | null
          color_summary: string | null
          duration_seconds: number
          selected_image_ids: string[]
          image_order: string[]
          script: Json
          package_text: string
          final_video_url: string | null
          render_error: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          status?: string
          display_name: string
          industry?: string | null
          product_summary?: string | null
          color_summary?: string | null
          duration_seconds?: number
          selected_image_ids?: string[]
          image_order?: string[]
          script?: Json
          package_text?: string
          final_video_url?: string | null
          render_error?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          status?: string
          display_name?: string
          industry?: string | null
          product_summary?: string | null
          color_summary?: string | null
          duration_seconds?: number
          selected_image_ids?: string[]
          image_order?: string[]
          script?: Json
          package_text?: string
          final_video_url?: string | null
          render_error?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      showroom_basic_shorts_targets: {
        Row: {
          id: string
          basic_shorts_draft_id: string
          channel: string
          title: string
          description: string
          hashtags: string[]
          first_comment: string
          publish_status: string
          external_post_id: string | null
          external_post_url: string | null
          preparation_payload: Json
          preparation_error: string | null
          approved_at: string | null
          prepared_at: string | null
          launch_ready_at: string | null
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          basic_shorts_draft_id: string
          channel: string
          title: string
          description?: string
          hashtags?: string[]
          first_comment?: string
          publish_status?: string
          external_post_id?: string | null
          external_post_url?: string | null
          preparation_payload?: Json
          preparation_error?: string | null
          approved_at?: string | null
          prepared_at?: string | null
          launch_ready_at?: string | null
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          basic_shorts_draft_id?: string
          channel?: string
          title?: string
          description?: string
          hashtags?: string[]
          first_comment?: string
          publish_status?: string
          external_post_id?: string | null
          external_post_url?: string | null
          preparation_payload?: Json
          preparation_error?: string | null
          approved_at?: string | null
          prepared_at?: string | null
          launch_ready_at?: string | null
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      showroom_basic_shorts_logs: {
        Row: {
          id: string
          basic_shorts_draft_id: string
          target_id: string | null
          stage: string
          message: string
          payload: Json
          created_at: string
        }
        Insert: {
          id?: string
          basic_shorts_draft_id: string
          target_id?: string | null
          stage: string
          message: string
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          basic_shorts_draft_id?: string
          target_id?: string | null
          stage?: string
          message?: string
          payload?: Json
          created_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
