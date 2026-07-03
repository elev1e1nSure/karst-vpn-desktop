export type Phase = 'off' | 'connecting' | 'on' | 'disconnecting';

export type ServerDto = {
  id: string;
  subscription_id?: string | null;
  name: string;
  host: string;
  port: number;
  security: string;
  transport: string;
  flow?: string | null;
  created_at: string;
  updated_at: string;
};

export type SubscriptionDto = {
  id: string;
  url: string;
  name: string;
  profile_title?: string | null;
  announce?: string | null;
  profile_update_interval_hours?: number | null;
  profile_web_page_url?: string | null;
  routing_enable?: boolean | null;
  subscription_userinfo?: string | null;
  last_refresh_at?: string | null;
  last_refresh_error?: string | null;
};

export type ImportSummaryDto = {
  subscription_id: string;
  imported: number;
  failed: number;
  error?: string | null;
};

export type ConnectionStatusDto = {
  state: 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'error';
  server_id?: string | null;
  server_name?: string | null;
  message?: string | null;
};

export type LogEntryDto = {
  source: string;
  message: string;
};

export type SettingsDto = {
  auto_refresh_mode: string;
  auto_refresh_hours: number;
  routing_mode: string;
  dns_doh_url: string;
};

export type ServerPingDto = {
  id: string;
  latency_ms?: number | null;
};

export type RoutingMode = 'Full' | 'BypassLocal' | 'BypassRu';
export type AutoRefreshMode = 'Auto' | 'Off' | 'EveryHours';
