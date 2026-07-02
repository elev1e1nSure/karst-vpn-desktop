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
  trafficLabel: string;
  expiresLabel: string;
  servers: UiServer[];
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

// Parses the standard "Subscription-Userinfo" header format:
// "upload=123; download=456; total=789; expire=1735689600"
function parseSubscriptionUserinfo(raw: string): Partial<Record<string, number>> {
  const fields: Partial<Record<string, number>> = {};
  for (const part of raw.split(';')) {
    const [key, value] = part.split('=').map((s) => s.trim());
    if (key && value && /^\d+$/.test(value)) fields[key] = Number(value);
  }
  return fields;
}

export function formatTrafficLabel(userinfo: string | null | undefined): string {
  if (!userinfo) return 'Не указано';
  const { upload = 0, download = 0, total } = parseSubscriptionUserinfo(userinfo);
  const used = upload + download;
  if (!total) return used > 0 ? `${formatBytes(used)} использовано` : 'Не указано';
  return `${formatBytes(used)} из ${formatBytes(total)}`;
}

export function formatExpiresLabel(userinfo: string | null | undefined): string {
  if (!userinfo) return 'Не указано';
  const { expire } = parseSubscriptionUserinfo(userinfo);
  if (!expire) return 'Бессрочно';
  return new Date(expire * 1000).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

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
    trafficLabel: formatTrafficLabel(subscription.subscription_userinfo),
    expiresLabel: formatExpiresLabel(subscription.subscription_userinfo),
    servers: (bySubscription.get(subscription.id) ?? []).map(serverToUi),
  }));
  const manualServers = bySubscription.get(null) ?? [];
  if (manualServers.length > 0) {
    groups.push({
      id: null,
      name: 'Вручную',
      trafficLabel: 'Не указано',
      expiresLabel: 'Не указано',
      servers: manualServers.map(serverToUi),
    });
  }
  return groups;
}

export function formatPingLabel(milliseconds: number | null | undefined): string {
  if (milliseconds === undefined) return '';
  return milliseconds === null ? 'нет ответа' : `${milliseconds} мс`;
}
