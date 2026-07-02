import type { ServerDto, SubscriptionDto } from './types';

export type UiServer = {
  id: string;
  name: string;
  tag: string;
  latencyLabel: string;
  isCustom: boolean;
  subscriptionId?: string | null;
};

export type UiSubscription = {
  id: string | null;
  name: string;
  announce?: string | null;
  url?: string | null;
  profileUpdateIntervalHours?: number | null;
  profileWebPageUrl?: string | null;
  routingEnabled?: boolean | null;
  lastRefreshedAt?: string | null;
  lastRefreshError?: string | null;
  servers: UiServer[];
};

function countryCodeToFlag(code: string): string {
  if (code.length !== 2) return code;
  const a = code.toUpperCase().charCodeAt(0) - 65;
  const b = code.toUpperCase().charCodeAt(1) - 65;
  if (a < 0 || a > 25 || b < 0 || b > 25) return code;
  return String.fromCodePoint(0x1f1e6 + a) + String.fromCodePoint(0x1f1e6 + b);
}

function emojifyName(name: string): string {
  const match = name.match(/^([A-Za-z]{2})([ \-–—])(.*)/);
  if (match) return countryCodeToFlag(match[1]) + match[2] + match[3];
  const countryCode = name.match(/^([A-Za-z]{2})$/);
  return countryCode ? countryCodeToFlag(countryCode[1]) : name;
}

function serverToUi(server: ServerDto): UiServer {
  const flow = server.flow ? ` · ${server.flow}` : '';
  return {
    id: server.id,
    name: emojifyName(server.name),
    tag: `VLESS · ${server.host}:${server.port}${flow}`,
    latencyLabel: '',
    isCustom: !server.subscription_id,
    subscriptionId: server.subscription_id,
  };
}

export function buildGroups(
  servers: ServerDto[],
  subscriptions: SubscriptionDto[],
): UiSubscription[] {
  const bySubscription = new Map<string | null, ServerDto[]>();
  for (const server of servers) {
    const key = server.subscription_id ?? null;
    const group = bySubscription.get(key);
    if (group) group.push(server);
    else bySubscription.set(key, [server]);
  }

  const groups: UiSubscription[] = subscriptions.map((subscription) => ({
    id: subscription.id,
    name: subscription.profile_title || subscription.name || 'Подписка',
    announce: subscription.announce,
    url: subscription.url,
    profileUpdateIntervalHours: subscription.profile_update_interval_hours,
    profileWebPageUrl: subscription.profile_web_page_url,
    routingEnabled: subscription.routing_enable,
    lastRefreshedAt: subscription.last_refresh_at,
    lastRefreshError: subscription.last_refresh_error,
    servers: (bySubscription.get(subscription.id) ?? []).map(serverToUi),
  }));
  const manualServers = bySubscription.get(null) ?? [];
  if (manualServers.length > 0) {
    groups.push({
      id: null,
      name: 'Вручную',
      servers: manualServers.map(serverToUi),
    });
  }
  return groups;
}

export function formatPingLabel(milliseconds: number | null | undefined): string {
  if (milliseconds === undefined) return '';
  return milliseconds === null ? 'нет ответа' : `${milliseconds} мс`;
}
