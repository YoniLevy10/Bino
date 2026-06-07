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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          client_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          client_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          client_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          client_id: string
          created_at: string
          event_type: string
          id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          event_type: string
          id?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_platform_settings: {
        Row: {
          id: string
          setup_fee_ils: number
          updated_at: string
        }
        Insert: {
          id?: string
          setup_fee_ils?: number
          updated_at?: string
        }
        Update: {
          id?: string
          setup_fee_ils?: number
          updated_at?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          all_day: boolean
          client_id: string
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          event_type: string
          id: string
          location: string | null
          project_id: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          client_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          event_type?: string
          id?: string
          location?: string | null
          project_id?: string | null
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          client_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          event_type?: string
          id?: string
          location?: string | null
          project_id?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_paid_addons: {
        Row: {
          addon_key: string
          client_id: string
          enabled: boolean
          enabled_at: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          addon_key: string
          client_id: string
          enabled?: boolean
          enabled_at?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          addon_key?: string
          client_id?: string
          enabled?: boolean
          enabled_at?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_paid_addons_addon_key_fkey"
            columns: ["addon_key"]
            isOneToOne: false
            referencedRelation: "paid_addons_catalog"
            referencedColumns: ["addon_key"]
          },
          {
            foreignKeyName: "client_paid_addons_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          auth_email: string | null
          buildings_allowed: number | null
          company_name: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          default_worker_phone: string | null
          display_name: string | null
          enabled_nav_features: Json | null
          greeninvoice_api_key_id: string | null
          greeninvoice_api_secret: string | null
          greeninvoice_business_id: string | null
          greeninvoice_clearing_plugin: string | null
          greeninvoice_default_doc_type: number
          greeninvoice_enabled: boolean
          greeninvoice_env: string
          greeninvoice_payment_failure_url: string | null
          greeninvoice_payment_success_url: string | null
          greeninvoice_remarks_template: string | null
          greeninvoice_send_invoice_email: boolean
          greeninvoice_vat_type: number
          id: string
          is_active: boolean
          logo_url: string | null
          manager_phone: string | null
          max_buildings: number | null
          max_residents: number | null
          max_tickets_per_month: number | null
          max_workers: number | null
          name: string
          office_attendance_station_token: string | null
          office_geofence_lat: number | null
          office_geofence_lng: number | null
          office_geofence_radius_m: number | null
          plan: string | null
          plan_tier: string | null
          preferred_language: string | null
          sidebar_nav_order: Json | null
          slug: string | null
          sms_on_ticket_close: boolean | null
          sms_on_ticket_open: boolean | null
          sms_sender_name: string | null
          welcome_message: string | null
          whatsapp_access_token: string | null
          whatsapp_business_phone: string | null
          whatsapp_number: string | null
          whatsapp_phone_id: string | null
          whatsapp_phone_number_id: string | null
        }
        Insert: {
          auth_email?: string | null
          buildings_allowed?: number | null
          company_name?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          default_worker_phone?: string | null
          display_name?: string | null
          enabled_nav_features?: Json | null
          greeninvoice_api_key_id?: string | null
          greeninvoice_api_secret?: string | null
          greeninvoice_business_id?: string | null
          greeninvoice_clearing_plugin?: string | null
          greeninvoice_default_doc_type?: number
          greeninvoice_enabled?: boolean
          greeninvoice_env?: string
          greeninvoice_payment_failure_url?: string | null
          greeninvoice_payment_success_url?: string | null
          greeninvoice_remarks_template?: string | null
          greeninvoice_send_invoice_email?: boolean
          greeninvoice_vat_type?: number
          id?: string
          is_active?: boolean
          logo_url?: string | null
          manager_phone?: string | null
          max_buildings?: number | null
          max_residents?: number | null
          max_tickets_per_month?: number | null
          max_workers?: number | null
          name: string
          office_attendance_station_token?: string | null
          office_geofence_lat?: number | null
          office_geofence_lng?: number | null
          office_geofence_radius_m?: number | null
          plan?: string | null
          plan_tier?: string | null
          preferred_language?: string | null
          sidebar_nav_order?: Json | null
          slug?: string | null
          sms_on_ticket_close?: boolean | null
          sms_on_ticket_open?: boolean | null
          sms_sender_name?: string | null
          welcome_message?: string | null
          whatsapp_access_token?: string | null
          whatsapp_business_phone?: string | null
          whatsapp_number?: string | null
          whatsapp_phone_id?: string | null
          whatsapp_phone_number_id?: string | null
        }
        Update: {
          auth_email?: string | null
          buildings_allowed?: number | null
          company_name?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          default_worker_phone?: string | null
          display_name?: string | null
          enabled_nav_features?: Json | null
          greeninvoice_api_key_id?: string | null
          greeninvoice_api_secret?: string | null
          greeninvoice_business_id?: string | null
          greeninvoice_clearing_plugin?: string | null
          greeninvoice_default_doc_type?: number
          greeninvoice_enabled?: boolean
          greeninvoice_env?: string
          greeninvoice_payment_failure_url?: string | null
          greeninvoice_payment_success_url?: string | null
          greeninvoice_remarks_template?: string | null
          greeninvoice_send_invoice_email?: boolean
          greeninvoice_vat_type?: number
          id?: string
          is_active?: boolean
          logo_url?: string | null
          manager_phone?: string | null
          max_buildings?: number | null
          max_residents?: number | null
          max_tickets_per_month?: number | null
          max_workers?: number | null
          name?: string
          office_attendance_station_token?: string | null
          office_geofence_lat?: number | null
          office_geofence_lng?: number | null
          office_geofence_radius_m?: number | null
          plan?: string | null
          plan_tier?: string | null
          preferred_language?: string | null
          sidebar_nav_order?: Json | null
          slug?: string | null
          sms_on_ticket_close?: boolean | null
          sms_on_ticket_open?: boolean | null
          sms_sender_name?: string | null
          welcome_message?: string | null
          whatsapp_access_token?: string | null
          whatsapp_business_phone?: string | null
          whatsapp_number?: string | null
          whatsapp_phone_id?: string | null
          whatsapp_phone_number_id?: string | null
        }
        Relationships: []
      }
      collection_charges: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          greeninvoice_client_id: string | null
          greeninvoice_document_id: string | null
          greeninvoice_document_number: number | null
          greeninvoice_payment_id: string | null
          greeninvoice_payment_url: string | null
          id: string
          paid_at: string | null
          project_id: string | null
          resident_id: string | null
          sent_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          greeninvoice_client_id?: string | null
          greeninvoice_document_id?: string | null
          greeninvoice_document_number?: number | null
          greeninvoice_payment_id?: string | null
          greeninvoice_payment_url?: string | null
          id?: string
          paid_at?: string | null
          project_id?: string | null
          resident_id?: string | null
          sent_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          greeninvoice_client_id?: string | null
          greeninvoice_document_id?: string | null
          greeninvoice_document_number?: number | null
          greeninvoice_payment_id?: string | null
          greeninvoice_payment_url?: string | null
          id?: string
          paid_at?: string | null
          project_id?: string | null
          resident_id?: string | null
          sent_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_charges_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_charges_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_charges_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_sign_requests: {
        Row: {
          client_id: string
          created_at: string
          document_name: string
          document_path: string
          external_id: string | null
          id: string
          project_id: string | null
          provider: string
          sent_at: string | null
          sign_url: string | null
          signed_at: string | null
          signer_email: string | null
          signer_name: string | null
          signer_phone: string | null
          status: string
        }
        Insert: {
          client_id: string
          created_at?: string
          document_name: string
          document_path: string
          external_id?: string | null
          id?: string
          project_id?: string | null
          provider?: string
          sent_at?: string | null
          sign_url?: string | null
          signed_at?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signer_phone?: string | null
          status?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          document_name?: string
          document_path?: string
          external_id?: string | null
          id?: string
          project_id?: string | null
          provider?: string
          sent_at?: string | null
          sign_url?: string | null
          signed_at?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signer_phone?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_sign_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_sign_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          client_id: string | null
          context: string
          created_at: string
          details: Json
          id: string
          message: string
          resolved: boolean
          resolved_at: string | null
          updated_at: string
          whatsapp_attempts: number
        }
        Insert: {
          client_id?: string | null
          context: string
          created_at?: string
          details?: Json
          id?: string
          message: string
          resolved?: boolean
          resolved_at?: string | null
          updated_at?: string
          whatsapp_attempts?: number
        }
        Update: {
          client_id?: string | null
          context?: string
          created_at?: string
          details?: Json
          id?: string
          message?: string
          resolved?: boolean
          resolved_at?: string | null
          updated_at?: string
          whatsapp_attempts?: number
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      failed_notifications: {
        Row: {
          channel: string
          client_id: string | null
          created_at: string
          destination: string | null
          error_message: string
          id: string
          payload: string | null
        }
        Insert: {
          channel?: string
          client_id?: string | null
          created_at?: string
          destination?: string | null
          error_message: string
          id?: string
          payload?: string | null
        }
        Update: {
          channel?: string
          client_id?: string | null
          created_at?: string
          destination?: string | null
          error_message?: string
          id?: string
          payload?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "failed_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      office_staff: {
        Row: {
          client_id: string
          created_at: string
          full_name: string
          hourly_rate: number | null
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          full_name: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          full_name?: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_staff_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      office_time_entries: {
        Row: {
          client_id: string
          clock_in_accuracy_m: number | null
          clock_in_at: string
          clock_in_lat: number | null
          clock_in_lng: number | null
          clock_out_accuracy_m: number | null
          clock_out_at: string | null
          clock_out_lat: number | null
          clock_out_lng: number | null
          created_at: string
          id: string
          staff_id: string
        }
        Insert: {
          client_id: string
          clock_in_accuracy_m?: number | null
          clock_in_at?: string
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          clock_out_accuracy_m?: number | null
          clock_out_at?: string | null
          clock_out_lat?: number | null
          clock_out_lng?: number | null
          created_at?: string
          id?: string
          staff_id: string
        }
        Update: {
          client_id?: string
          clock_in_accuracy_m?: number | null
          clock_in_at?: string
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          clock_out_accuracy_m?: number | null
          clock_out_at?: string | null
          clock_out_lat?: number | null
          clock_out_lng?: number | null
          created_at?: string
          id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_time_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_time_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "office_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_users: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string
          role: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id: string
          role?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          client_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          plan: string | null
          slug: string
          whatsapp_access_token: string | null
          whatsapp_phone_number_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          plan?: string | null
          slug: string
          whatsapp_access_token?: string | null
          whatsapp_phone_number_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          plan?: string | null
          slug?: string
          whatsapp_access_token?: string | null
          whatsapp_phone_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_addons_catalog: {
        Row: {
          addon_key: string
          description_he: string | null
          is_active: boolean
          name_he: string
          price_ils_monthly: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          addon_key: string
          description_he?: string | null
          is_active?: boolean
          name_he: string
          price_ils_monthly: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          addon_key?: string
          description_he?: string | null
          is_active?: boolean
          name_he?: string
          price_ils_monthly?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      pending_resident_join_requests: {
        Row: {
          client_id: string
          created_at: string
          id: string
          normalized_phone: string | null
          notes: string | null
          project_id: string
          reporter_phone_normalized: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          ticket_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          normalized_phone?: string | null
          notes?: string | null
          project_id: string
          reporter_phone_normalized: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          ticket_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          normalized_phone?: string | null
          notes?: string | null
          project_id?: string
          reporter_phone_normalized?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_resident_join_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_resident_join_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_resident_join_requests_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk1_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_resident_join_requests_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk2_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_resident_join_requests_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk3_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_resident_join_requests_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk4_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_resident_join_requests_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk5_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_resident_join_requests_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_selections: {
        Row: {
          candidate_projects: Json
          client_id: string | null
          created_at: string | null
          expires_at: string
          id: string
          phone_number: string
        }
        Insert: {
          candidate_projects: Json
          client_id?: string | null
          created_at?: string | null
          expires_at: string
          id?: string
          phone_number: string
        }
        Update: {
          candidate_projects?: Json
          client_id?: string | null
          created_at?: string | null
          expires_at?: string
          id?: string
          phone_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_selections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_pricing_catalog: {
        Row: {
          buildings_max: number | null
          description_he: string | null
          is_active: boolean
          name_he: string
          plan_tier: string
          price_display_he: string | null
          price_ils_monthly: number | null
          sort_order: number
          tickets_per_month_max: number | null
          updated_at: string
          workers_max: number | null
        }
        Insert: {
          buildings_max?: number | null
          description_he?: string | null
          is_active?: boolean
          name_he: string
          plan_tier: string
          price_display_he?: string | null
          price_ils_monthly?: number | null
          sort_order?: number
          tickets_per_month_max?: number | null
          updated_at?: string
          workers_max?: number | null
        }
        Update: {
          buildings_max?: number | null
          description_he?: string | null
          is_active?: boolean
          name_he?: string
          plan_tier?: string
          price_display_he?: string | null
          price_ils_monthly?: number | null
          sort_order?: number
          tickets_per_month_max?: number | null
          updated_at?: string
          workers_max?: number | null
        }
        Relationships: []
      }
      platform_ops_alert_sent: {
        Row: {
          dedup_key: string
          sent_at: string
        }
        Insert: {
          dedup_key: string
          sent_at?: string
        }
        Update: {
          dedup_key?: string
          sent_at?: string
        }
        Relationships: []
      }
      processed_webhooks: {
        Row: {
          client_id: string
          id: string
          message_id: string
          processed_at: string | null
        }
        Insert: {
          client_id: string
          id?: string
          message_id: string
          processed_at?: string | null
        }
        Update: {
          client_id?: string
          id?: string
          message_id?: string
          processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processed_webhooks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          client_id: string
          company_name: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          extra_phones: string[]
          full_name: string
          id: string
          is_active: boolean
          notes: string | null
          phone: string | null
          trade: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          company_name?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          extra_phones?: string[]
          full_name: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          trade?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          company_name?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          extra_phones?: string[]
          full_name?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          trade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professionals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          client_id: string
          created_at: string
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          project_id: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          file_name: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          project_id: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          project_id?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_pilot_sms_runs: {
        Row: {
          client_id: string
          created_at: string
          dry_run: boolean
          failed_count: number
          id: string
          project_id: string
          recipients_total: number
          sent_by: string | null
          sent_count: number
          skipped_no_phone: number
        }
        Insert: {
          client_id: string
          created_at?: string
          dry_run?: boolean
          failed_count?: number
          id?: string
          project_id: string
          recipients_total?: number
          sent_by?: string | null
          sent_count?: number
          skipped_no_phone?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          dry_run?: boolean
          failed_count?: number
          id?: string
          project_id?: string
          recipients_total?: number
          sent_by?: string | null
          sent_count?: number
          skipped_no_phone?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_pilot_sms_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_pilot_sms_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          address_en: string | null
          assigned_worker_id: string | null
          client_id: string
          created_at: string
          id: string
          is_active: boolean
          manager_phone: string | null
          name: string
          organization_id: string | null
          project_code: string
          qr_identifier: string | null
          sla_hours: number
        }
        Insert: {
          address?: string | null
          address_en?: string | null
          assigned_worker_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          manager_phone?: string | null
          name: string
          organization_id?: string | null
          project_code: string
          qr_identifier?: string | null
          sla_hours?: number
        }
        Update: {
          address?: string | null
          address_en?: string | null
          assigned_worker_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          manager_phone?: string | null
          name?: string
          organization_id?: string | null
          project_code?: string
          qr_identifier?: string | null
          sla_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "projects_assigned_worker_id_fkey"
            columns: ["assigned_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          client_id: string
          created_at: string
          id: string
          subscription: Json
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          subscription: Json
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          subscription?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          endpoint: string
          ip: string
          window_start: string
        }
        Insert: {
          count?: number
          endpoint: string
          ip: string
          window_start?: string
        }
        Update: {
          count?: number
          endpoint?: string
          ip?: string
          window_start?: string
        }
        Relationships: []
      }
      residents: {
        Row: {
          apartment_number: string | null
          client_id: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          is_renter: boolean
          normalized_phone: string | null
          notes: string | null
          phone: string | null
          project_id: string | null
          updated_at: string | null
        }
        Insert: {
          apartment_number?: string | null
          client_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_renter?: boolean
          normalized_phone?: string | null
          notes?: string | null
          phone?: string | null
          project_id?: string | null
          updated_at?: string | null
        }
        Update: {
          apartment_number?: string | null
          client_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_renter?: boolean
          normalized_phone?: string | null
          notes?: string | null
          phone?: string | null
          project_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "residents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "residents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          active_ticket_id: string | null
          client_id: string | null
          created_at: string
          id: string
          is_active: boolean
          last_activity_at: string
          normalized_phone: string | null
          organization_id: string | null
          pending_apartment_detail: string | null
          pending_location: Json | null
          pending_ticket_description: string | null
          pending_whatsapp_media_id: string | null
          phone: string | null
          phone_number: string
          project_id: string
          started_by_message: string | null
          state: string | null
          updated_at: string | null
        }
        Insert: {
          active_ticket_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_activity_at?: string
          normalized_phone?: string | null
          organization_id?: string | null
          pending_apartment_detail?: string | null
          pending_location?: Json | null
          pending_ticket_description?: string | null
          pending_whatsapp_media_id?: string | null
          phone?: string | null
          phone_number: string
          project_id: string
          started_by_message?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          active_ticket_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_activity_at?: string
          normalized_phone?: string | null
          organization_id?: string | null
          pending_apartment_detail?: string | null
          pending_location?: Json | null
          pending_ticket_description?: string | null
          pending_whatsapp_media_id?: string | null
          phone?: string | null
          phone_number?: string
          project_id?: string
          started_by_message?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_active_ticket_id_fkey"
            columns: ["active_ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk1_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_active_ticket_id_fkey"
            columns: ["active_ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk2_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_active_ticket_id_fkey"
            columns: ["active_ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk3_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_active_ticket_id_fkey"
            columns: ["active_ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk4_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_active_ticket_id_fkey"
            columns: ["active_ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk5_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_active_ticket_id_fkey"
            columns: ["active_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_campaign_runs: {
        Row: {
          campaign_name: string
          client_id: string
          created_at: string
          created_by: string | null
          dry_run: boolean
          failed: number
          id: string
          message_body: string
          project_id: string | null
          recipients_total: number
          sent: number
          skipped_no_phone: number
        }
        Insert: {
          campaign_name?: string
          client_id: string
          created_at?: string
          created_by?: string | null
          dry_run?: boolean
          failed?: number
          id?: string
          message_body: string
          project_id?: string | null
          recipients_total?: number
          sent?: number
          skipped_no_phone?: number
        }
        Update: {
          campaign_name?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          dry_run?: boolean
          failed?: number
          id?: string
          message_body?: string
          project_id?: string | null
          recipients_total?: number
          sent?: number
          skipped_no_phone?: number
        }
        Relationships: [
          {
            foreignKeyName: "sms_campaign_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_campaign_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_attachments: {
        Row: {
          attachment_type: string
          created_at: string | null
          file_name: string | null
          file_url: string | null
          id: string
          mime_type: string | null
          ticket_id: string
          whatsapp_media_id: string | null
        }
        Insert: {
          attachment_type: string
          created_at?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          mime_type?: string | null
          ticket_id: string
          whatsapp_media_id?: string | null
        }
        Update: {
          attachment_type?: string
          created_at?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          mime_type?: string | null
          ticket_id?: string
          whatsapp_media_id?: string | null
        }
        Relationships: []
      }
      ticket_internal_messages: {
        Row: {
          body: string
          client_id: string | null
          created_at: string
          id: string
          sender_name: string
          ticket_id: string
        }
        Insert: {
          body: string
          client_id?: string | null
          created_at?: string
          id?: string
          sender_name: string
          ticket_id: string
        }
        Update: {
          body?: string
          client_id?: string | null
          created_at?: string
          id?: string
          sender_name?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_internal_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_internal_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk1_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_internal_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk2_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_internal_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk3_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_internal_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk4_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_internal_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk5_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_internal_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_logs: {
        Row: {
          action: string | null
          action_type: string | null
          created_at: string
          created_by: string | null
          id: string
          meta: Json | null
          new_value: string | null
          notes: string | null
          old_value: string | null
          organization_id: string | null
          performed_by: string | null
          ticket_id: string
        }
        Insert: {
          action?: string | null
          action_type?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          meta?: Json | null
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
          organization_id?: string | null
          performed_by?: string | null
          ticket_id: string
        }
        Update: {
          action?: string | null
          action_type?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          meta?: Json | null
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
          organization_id?: string | null
          performed_by?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk1_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk2_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk3_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk4_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk5_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_worker_id: string | null
          building_number: string | null
          client_id: string | null
          closed_at: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          escalated_at: string | null
          id: string
          image_url: string | null
          is_merged: boolean | null
          is_recurring: boolean
          language: string | null
          merged_into_ticket_id: string | null
          normalized_phone: string | null
          opened_at: string
          organization_id: string | null
          priority: string
          project_id: string
          reporter_name: string | null
          reporter_phone: string | null
          sla_alerted: boolean
          sla_alerted_at: string | null
          source: string | null
          source_channel: string | null
          status: string
          ticket_metadata: Json
          ticket_number: number
          updated_at: string
        }
        Insert: {
          assigned_worker_id?: string | null
          building_number?: string | null
          client_id?: string | null
          closed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          escalated_at?: string | null
          id?: string
          image_url?: string | null
          is_merged?: boolean | null
          is_recurring?: boolean
          language?: string | null
          merged_into_ticket_id?: string | null
          normalized_phone?: string | null
          opened_at?: string
          organization_id?: string | null
          priority?: string
          project_id: string
          reporter_name?: string | null
          reporter_phone?: string | null
          sla_alerted?: boolean
          sla_alerted_at?: string | null
          source?: string | null
          source_channel?: string | null
          status?: string
          ticket_metadata?: Json
          ticket_number?: never
          updated_at?: string
        }
        Update: {
          assigned_worker_id?: string | null
          building_number?: string | null
          client_id?: string | null
          closed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          escalated_at?: string | null
          id?: string
          image_url?: string | null
          is_merged?: boolean | null
          is_recurring?: boolean
          language?: string | null
          merged_into_ticket_id?: string | null
          normalized_phone?: string | null
          opened_at?: string
          organization_id?: string | null
          priority?: string
          project_id?: string
          reporter_name?: string | null
          reporter_phone?: string | null
          sla_alerted?: boolean
          sla_alerted_at?: string | null
          source?: string | null
          source_channel?: string | null
          status?: string
          ticket_metadata?: Json
          ticket_number?: never
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_worker_id_fkey"
            columns: ["assigned_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_merged_into_ticket_id_fkey"
            columns: ["merged_into_ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk1_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_merged_into_ticket_id_fkey"
            columns: ["merged_into_ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk2_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_merged_into_ticket_id_fkey"
            columns: ["merged_into_ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk3_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_merged_into_ticket_id_fkey"
            columns: ["merged_into_ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk4_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_merged_into_ticket_id_fkey"
            columns: ["merged_into_ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk5_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_merged_into_ticket_id_fkey"
            columns: ["merged_into_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_broadcast_runs: {
        Row: {
          client_id: string
          created_at: string
          dry_run: boolean
          failed: number
          id: string
          project_id: string | null
          recipients_total: number
          sent: number
          template_language: string
          template_name: string
        }
        Insert: {
          client_id: string
          created_at?: string
          dry_run?: boolean
          failed?: number
          id?: string
          project_id?: string | null
          recipients_total?: number
          sent?: number
          template_language?: string
          template_name: string
        }
        Update: {
          client_id?: string
          created_at?: string
          dry_run?: boolean
          failed?: number
          id?: string
          project_id?: string | null
          recipients_total?: number
          sent?: number
          template_language?: string
          template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_broadcast_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_broadcast_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          client_id: string
          created_at: string
          id: string
          last_message_at: string
          last_message_preview: string | null
          phone: string
          resident_id: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          phone: string
          resident_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          phone?: string
          resident_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          client_id: string
          conversation_id: string
          created_at: string
          direction: string
          id: string
          interactive_payload: Json | null
          message_type: string
          status: string
          ticket_id: string | null
          wa_message_id: string | null
        }
        Insert: {
          body?: string | null
          client_id: string
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          interactive_payload?: Json | null
          message_type?: string
          status?: string
          ticket_id?: string | null
          wa_message_id?: string | null
        }
        Update: {
          body?: string | null
          client_id?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          interactive_payload?: Json | null
          message_type?: string
          status?: string
          ticket_id?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk1_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk2_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk3_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk4_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "archive_project_bmk5_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          client_id: string
          id: string
          template_key: string
          template_text: string
          updated_at: string | null
        }
        Insert: {
          client_id: string
          id?: string
          template_key: string
          template_text: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          id?: string
          template_key?: string
          template_text?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_attendance: {
        Row: {
          admin_note: string | null
          client_id: string
          created_at: string
          edited_at: string | null
          edited_by: string | null
          end_source: string | null
          end_tag_id: string | null
          ended_at: string | null
          id: string
          start_source: string
          start_tag_id: string | null
          started_at: string
          status: string
          total_minutes: number | null
          updated_at: string
          worker_id: string
        }
        Insert: {
          admin_note?: string | null
          client_id: string
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          end_source?: string | null
          end_tag_id?: string | null
          ended_at?: string | null
          id?: string
          start_source?: string
          start_tag_id?: string | null
          started_at: string
          status?: string
          total_minutes?: number | null
          updated_at?: string
          worker_id: string
        }
        Update: {
          admin_note?: string | null
          client_id?: string
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          end_source?: string | null
          end_tag_id?: string | null
          ended_at?: string | null
          id?: string
          start_source?: string
          start_tag_id?: string | null
          started_at?: string
          status?: string
          total_minutes?: number | null
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_attendance_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_attendance_end_tag_id_fkey"
            columns: ["end_tag_id"]
            isOneToOne: false
            referencedRelation: "worker_nfc_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_attendance_start_tag_id_fkey"
            columns: ["start_tag_id"]
            isOneToOne: false
            referencedRelation: "worker_nfc_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_attendance_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_attendance_events: {
        Row: {
          admin_note: string | null
          client_action_id: string
          client_id: string
          client_recorded_at: string
          client_timezone: string | null
          created_at: string
          device_id: string | null
          event_type: string
          id: string
          lat: number | null
          lng: number | null
          note: string | null
          project_id: string | null
          server_received_at: string
          source: string
          suspicious_reason: string | null
          sync_delay_minutes: number | null
          sync_status: string
          tag_code: string | null
          tag_id: string | null
          user_agent: string | null
          worker_id: string
        }
        Insert: {
          admin_note?: string | null
          client_action_id: string
          client_id: string
          client_recorded_at: string
          client_timezone?: string | null
          created_at?: string
          device_id?: string | null
          event_type: string
          id?: string
          lat?: number | null
          lng?: number | null
          note?: string | null
          project_id?: string | null
          server_received_at?: string
          source: string
          suspicious_reason?: string | null
          sync_delay_minutes?: number | null
          sync_status?: string
          tag_code?: string | null
          tag_id?: string | null
          user_agent?: string | null
          worker_id: string
        }
        Update: {
          admin_note?: string | null
          client_action_id?: string
          client_id?: string
          client_recorded_at?: string
          client_timezone?: string | null
          created_at?: string
          device_id?: string | null
          event_type?: string
          id?: string
          lat?: number | null
          lng?: number | null
          note?: string | null
          project_id?: string | null
          server_received_at?: string
          source?: string
          suspicious_reason?: string | null
          sync_delay_minutes?: number | null
          sync_status?: string
          tag_code?: string | null
          tag_id?: string | null
          user_agent?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_attendance_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_attendance_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_attendance_events_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "worker_nfc_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_attendance_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_nfc_tags: {
        Row: {
          client_id: string
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          project_id: string | null
          tag_code: string
          tag_type: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          project_id?: string | null
          tag_code: string
          tag_type: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          project_id?: string | null
          tag_code?: string
          tag_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_nfc_tags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_nfc_tags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_push_subscriptions: {
        Row: {
          client_id: string
          created_at: string
          id: string
          subscription: Json
          updated_at: string
          worker_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          subscription: Json
          updated_at?: string
          worker_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          subscription?: Json
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_push_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_push_subscriptions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_site_tours: {
        Row: {
          client_id: string
          completed_at: string
          created_at: string
          id: string
          notes: string | null
          project_id: string
          worker_id: string
        }
        Insert: {
          client_id: string
          completed_at?: string
          created_at?: string
          id?: string
          notes?: string | null
          project_id: string
          worker_id: string
        }
        Update: {
          client_id?: string
          completed_at?: string
          created_at?: string
          id?: string
          notes?: string | null
          project_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_site_tours_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_site_tours_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_site_tours_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          access_token: string | null
          client_id: string
          created_at: string
          deleted_at: string | null
          email: string | null
          extra_phones: string[]
          full_name: string
          id: string
          is_active: boolean
          name: string | null
          organization_id: string | null
          phone: string
          receives_new_ticket_alerts: boolean
          role: string | null
        }
        Insert: {
          access_token?: string | null
          client_id: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          extra_phones?: string[]
          full_name: string
          id?: string
          is_active?: boolean
          name?: string | null
          organization_id?: string | null
          phone: string
          receives_new_ticket_alerts?: boolean
          role?: string | null
        }
        Update: {
          access_token?: string | null
          client_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          extra_phones?: string[]
          full_name?: string
          id?: string
          is_active?: boolean
          name?: string | null
          organization_id?: string | null
          phone?: string
          receives_new_ticket_alerts?: boolean
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      archive_project_bmk1_tickets: {
        Row: {
          assigned_worker_id: string | null
          closed_at: string | null
          created_at: string | null
          description: string | null
          id: string | null
          project_code: string | null
          project_id: string | null
          project_name: string | null
          reporter_phone: string | null
          status: string | null
          ticket_number: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_worker_id_fkey"
            columns: ["assigned_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      archive_project_bmk2_tickets: {
        Row: {
          assigned_worker_id: string | null
          closed_at: string | null
          created_at: string | null
          description: string | null
          id: string | null
          project_code: string | null
          project_id: string | null
          project_name: string | null
          reporter_phone: string | null
          status: string | null
          ticket_number: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_worker_id_fkey"
            columns: ["assigned_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      archive_project_bmk3_tickets: {
        Row: {
          assigned_worker_id: string | null
          closed_at: string | null
          created_at: string | null
          description: string | null
          id: string | null
          project_code: string | null
          project_id: string | null
          project_name: string | null
          reporter_phone: string | null
          status: string | null
          ticket_number: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_worker_id_fkey"
            columns: ["assigned_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      archive_project_bmk4_tickets: {
        Row: {
          assigned_worker_id: string | null
          closed_at: string | null
          created_at: string | null
          description: string | null
          id: string | null
          project_code: string | null
          project_id: string | null
          project_name: string | null
          reporter_phone: string | null
          status: string | null
          ticket_number: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_worker_id_fkey"
            columns: ["assigned_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      archive_project_bmk5_tickets: {
        Row: {
          assigned_worker_id: string | null
          closed_at: string | null
          created_at: string | null
          description: string | null
          id: string | null
          project_code: string | null
          project_id: string | null
          project_name: string | null
          reporter_phone: string | null
          status: string | null
          ticket_number: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_worker_id_fkey"
            columns: ["assigned_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      bamakor_my_client_ids: { Args: never; Returns: string[] }
      bamakor_normalize_phone: {
        Args: { input_phone: string }
        Returns: string
      }
      bamakor_rate_limit_ip_endpoint: {
        Args: { p_endpoint: string; p_ip: string; p_max?: number }
        Returns: {
          current_count: number
          is_limited: boolean
        }[]
      }
      bamakor_reset_client_tickets: {
        Args: { p_client_id: string }
        Returns: Json
      }
      cleanup_expired_pending_selections: { Args: never; Returns: number }
      cleanup_stale_sessions: { Args: never; Returns: number }
      generate_ticket_number: { Args: never; Returns: string }
      get_client_admin_emails: {
        Args: never
        Returns: {
          client_id: string
          email: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
