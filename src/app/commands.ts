import { invoke } from '@tauri-apps/api/core';

import type {
  ConnectionStatusDto,
  ImportSummaryDto,
  LogEntryDto,
  ServerDto,
  ServerPingDto,
  SettingsDto,
  SubscriptionDto,
} from './types';

export const commands = {
  listServers: () => invoke<ServerDto[]>('list_servers'),
  listSubscriptions: () => invoke<SubscriptionDto[]>('list_subscriptions'),
  connectionStatus: () => invoke<ConnectionStatusDto>('connection_status'),
  getSettings: () => invoke<SettingsDto>('get_settings'),
  pingServers: () => invoke<ServerPingDto[]>('ping_servers'),
  connect: (serverId: string) => invoke<ConnectionStatusDto>('connect', { serverId }),
  disconnect: () => invoke<ConnectionStatusDto>('disconnect'),
  deleteServer: (serverId: string) => invoke<boolean>('delete_server', { serverId }),
  deleteSubscription: (subscriptionId: string) =>
    invoke<boolean>('delete_subscription', { subscriptionId }),
  addSubscription: (url: string) =>
    invoke<ImportSummaryDto>('add_subscription', { url, name: null }),
  addManualLink: (vlessUri: string) => invoke<ServerDto>('add_manual_link', { vlessUri }),
  refreshAllSubscriptions: () => invoke<ImportSummaryDto[]>('refresh_all_subscriptions'),
  setAutoRefreshSettings: (mode: string, hours: number | null) =>
    invoke<SettingsDto>('set_auto_refresh_settings', { mode, hours }),
  setRoutingMode: (mode: string) => invoke<SettingsDto>('set_routing_mode', { mode }),
  setDnsDohUrl: (url: string) => invoke<SettingsDto>('set_dns_doh_url', { url }),
  setCoreMode: (mode: string) => invoke<SettingsDto>('set_core_mode', { mode }),
  listLogs: () => invoke<LogEntryDto[]>('list_logs'),
  clearLogs: () => invoke<void>('clear_logs'),
};

export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Не удалось выполнить команду';
}
