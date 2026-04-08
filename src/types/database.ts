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
          approved_at: string | null
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
          approved_at?: string | null
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
          approved_at?: string | null
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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
