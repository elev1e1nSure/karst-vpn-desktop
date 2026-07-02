import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import './style.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'off' | 'connecting' | 'on';

type ServerDto = {
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

type SubscriptionDto = {
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

type ImportSummaryDto = {
  subscription_id: string;
  imported: number;
  failed: number;
  error?: string | null;
};

type ConnectionStatusDto = {
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
  server_id?: string | null;
  server_name?: string | null;
  message?: string | null;
};

type LogEntryDto = {
  source: string;
  message: string;
};

type SettingsDto = {
  auto_refresh_mode: string;
  auto_refresh_hours: number;
};

type ServerPingDto = {
  id: string;
  latency_ms?: number | null;
};

// ─── UI models (Android parity) ────────────────────────────────────────────

type UiServer = {
  id: string;
  name: string;
  tag: string;
  latencyLabel: string;
  isCustom: boolean;
  subscriptionId?: string | null;
};

type UiSubscription = {
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

type RoutingMode = 'Full' | 'BypassLocal' | 'BypassRu';
type AutoRefreshMode = 'Auto' | 'Off' | 'EveryHours';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error)
    return String((error as { message: unknown }).message);
  return 'Не удалось выполнить команду';
};

const tagForServer = (server: UiServer) => server.tag;

const formatElapsed = (s: number): string => {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

const formatPingLabel = (ms: number | null | undefined): string => {
  if (ms === undefined) return '';
  if (ms === null) return 'нет ответа';
  return `${ms} мс`;
};

const phaseFromStatus = (status: ConnectionStatusDto): Phase => {
  if (status.state === 'connected') return 'on';
  if (status.state === 'connecting') return 'connecting';
  return 'off';
};

function serverToUi(dto: ServerDto): UiServer {
  const flow = dto.flow ? ` · ${dto.flow}` : '';
  return {
    id: dto.id,
    name: dto.name,
    tag: `VLESS · ${dto.host}:${dto.port}${flow}`,
    latencyLabel: '',
    isCustom: !dto.subscription_id,
    subscriptionId: dto.subscription_id,
  };
}

function buildGroups(servers: ServerDto[], subscriptions: SubscriptionDto[]): UiSubscription[] {
  const subMap = new Map(subscriptions.map((s) => [s.id, s]));
  const bySubId = new Map<string | null, ServerDto[]>();

  for (const srv of servers) {
    const key = srv.subscription_id ?? null;
    if (!bySubId.has(key)) bySubId.set(key, []);
    bySubId.get(key)!.push(srv);
  }

  const groups: UiSubscription[] = [];

  // Subscription groups first
  for (const sub of subscriptions) {
    const srvs = bySubId.get(sub.id) ?? [];
    const dto = subMap.get(sub.id);
    groups.push({
      id: sub.id,
      name: dto?.profile_title || dto?.name || 'Подписка',
      announce: dto?.announce,
      url: dto?.url,
      profileUpdateIntervalHours: dto?.profile_update_interval_hours,
      profileWebPageUrl: dto?.profile_web_page_url,
      routingEnabled: dto?.routing_enable,
      lastRefreshedAt: dto?.last_refresh_at,
      lastRefreshError: dto?.last_refresh_error,
      servers: srvs.map(serverToUi),
    });
  }

  // Manual servers group
  const manual = bySubId.get(null) ?? [];
  if (manual.length > 0) {
    groups.push({
      id: null,
      name: 'Вручную',
      servers: manual.map(serverToUi),
    });
  }

  return groups;
}

function formatEpochStr(isoStr: string | null | undefined): string {
  if (!isoStr) return 'Не указано';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return 'Не указано'; }
}

function formatUpdateInterval(hours: number | null | undefined): string {
  if (!hours || hours <= 0) return 'Не указан';
  return `${hours} ч`;
}

function formatOptionalBoolean(val: boolean | null | undefined): string {
  if (val === true) return 'Включён';
  if (val === false) return 'Выключен';
  return 'Не указан';
}

// ─── Theme / Design tokens ─────────────────────────────────────────────────

const ACCENT = '#D97757';

const DARK_THEME = {
  pageBg: '#1A1A19',
  appBg: '#1A1A19',
  cardBg: '#262421',
  ink: '#EAE8E4',
  mutedInk: '#98948E',
  border: '#32302C',
  buttonOffBg: '#262421',
  buttonOffBorder: '#373430',
  buttonOffIcon: '#A7A39D',
  danger: '#A56060',
};
const LIGHT_THEME = {
  pageBg: '#DFDCD7',
  appBg: '#EDEAE5',
  cardBg: '#F9F8F5',
  ink: '#352E27',
  mutedInk: '#847D74',
  border: '#DAD6CF',
  buttonOffBg: '#F9F8F5',
  buttonOffBorder: '#D1CDC5',
  buttonOffIcon: '#675F56',
  danger: '#A56060',
};

type Theme = typeof DARK_THEME;

const MOOD = {
  calm:    { ringDuration: '2.3s', iconStroke: '1.9', chipRadius: '16px', subOff: 'VPN выключен', subConnecting: 'Устанавливаем соединение' },
  focused: { ringDuration: '1.7s', iconStroke: '2.2', chipRadius: '14px', subOff: 'Готов к подключению', subConnecting: 'Настраиваем туннель' },
  urgent:  { ringDuration: '1s',   iconStroke: '2.6', chipRadius: '10px', subOff: 'VPN выключен', subConnecting: 'Устанавливаем соединение' },
};
const mood = MOOD.focused;

// ─── CSS variable helper ──────────────────────────────────────────────────────

function themeVars(theme: Theme): React.CSSProperties {
  return {
    '--card-bg': theme.cardBg,
    '--theme-ink': theme.ink,
    '--theme-muted-ink': theme.mutedInk,
    '--theme-border': theme.border,
    '--theme-danger': theme.danger,
    '--accent': ACCENT,
  } as React.CSSProperties;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Pressable({
  onClick,
  disabled = false,
  pressedScale = 1,
  ripple = true,
  borderRadius,
  style,
  className = '',
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  pressedScale?: number;
  ripple?: boolean;
  borderRadius?: number;
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const rippleIdRef = useRef(0);

  const createRipple = (e: React.MouseEvent) => {
    if (!ripple) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const id = ++rippleIdRef.current;
    setRipples((prev) => [...prev, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 600);
  };

  return (
    <div
      className={`pressable ${className}`}
      style={{
        ...style,
        position: 'relative',
        overflow: ripple ? 'hidden' : undefined,
        borderRadius: borderRadius ?? style?.borderRadius,
        transform: pressed && !disabled ? `scale(${pressedScale})` : undefined,
        opacity: disabled ? 0.55 : 1,
        cursor: 'default',
      }}
      onMouseDown={(e) => { if (!disabled) { setPressed(true); createRipple(e); } }}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onClick={disabled ? undefined : onClick}
    >
      {ripple && ripples.map((r) => (
        <span key={r.id} className="touch-ripple" style={{ left: r.x, top: r.y }} />
      ))}
      {children}
    </div>
  );
}

function MiniSwitch({ checked, accent, theme, onToggle }: { checked: boolean; accent: string; theme: Theme; onToggle: () => void }) {
  const trackColor = checked ? `color-mix(in oklch, ${accent} 70%, transparent)` : theme.border;
  return (
    <div
      className="switch-btn mini-switch-track"
      onClick={onToggle}
      style={{ width: 46, height: 28, borderRadius: 14, background: trackColor, position: 'relative', flexShrink: 0, cursor: 'default' }}
    >
      <div
        className="mini-switch-knob"
        style={{
          position: 'absolute',
          top: 3,
          left: checked ? 21 : 3,
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </div>
  );
}

// ─── Connect Button ───────────────────────────────────────────────────────────

function ConnectButton({ phase, enabled, theme, accent, onClick }: {
  phase: Phase; enabled: boolean; theme: Theme; accent: string; onClick: () => void;
}) {
  const isConnecting = phase === 'connecting';
  const isConnected = phase === 'on';

  const buttonBg = isConnected ? accent : theme.buttonOffBg;
  const borderColor = isConnected
    ? accent
    : isConnecting
    ? accent
    : theme.buttonOffBorder;
  const iconColor = isConnected ? '#fff' : isConnecting ? accent : theme.buttonOffIcon;

  const ringClass = isConnected ? 'pulse-ring-connected' : isConnecting ? 'pulse-ring-connecting' : 'pulse-ring-off';

  return (
    <div style={{ position: 'relative', width: 208, height: 208, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* pulse ring */}
      <div
        className={ringClass}
        style={{
          position: 'absolute',
          width: 168,
          height: 168,
          borderRadius: '50%',
          background: `color-mix(in oklch, ${accent} 100%, transparent)`,
          pointerEvents: 'none',
        }}
      />
      <button
        type="button"
        className="connect-btn"
        aria-label="Подключить VPN"
        onClick={enabled && !isConnecting ? onClick : undefined}
        style={{
          position: 'relative',
          zIndex: 2,
          width: 152,
          height: 152,
          borderRadius: '50%',
          background: buttonBg,
          border: `1.5px solid ${borderColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
          opacity: enabled ? 1 : 0.55,
        }}
      >
        {isConnecting ? (
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            border: '3px solid rgba(255,255,255,0.35)',
            borderTopColor: '#fff',
            animation: 'spin 0.85s linear infinite',
          }} />
        ) : (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <path d="M12 3V12" stroke={iconColor} strokeWidth={mood.iconStroke} strokeLinecap="round" />
            <path
              d="M6.5 6.5C5 8.1 4 10.2 4 12.5C4 17.2 7.8 21 12.5 21C17.2 21 21 17.2 21 12.5C21 10.1 19.9 7.9 18.3 6.4"
              stroke={iconColor}
              strokeWidth={mood.iconStroke}
              strokeLinecap="round"
              fill="none"
              transform="translate(-1,0)"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

// ─── Location Chip ────────────────────────────────────────────────────────────

function LocationChip({ server, theme, onClick }: {
  server: UiServer | null; theme: Theme; onClick: () => void;
}) {
  return (
    <div
      className="location-chip"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '16px 18px',
        borderRadius: mood.chipRadius,
        background: theme.cardBg,
        border: `1px solid ${theme.border}`,
        cursor: 'default',
      }}
    >
      <div style={{ width: 34, height: 34, borderRadius: 10, background: theme.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${theme.mutedInk}` }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "500 14px/1.3 'Inter', sans-serif", color: theme.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {server ? server.name : 'Добавить сервер'}
        </div>
        <div style={{ font: "400 12px/1.3 'Inter', sans-serif", color: theme.mutedInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {server ? tagForServer(server) : 'VLESS-ссылка или URL подписки'}
        </div>
      </div>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <path d="M9 6L15 12L9 18" stroke={theme.mutedInk} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ─── Subscription Menu Content ────────────────────────────────────────────────

function SubscriptionMenuContent({ sub, theme, accent, onBack, onDelete }: {
  sub: UiSubscription; theme: Theme; accent: string; onBack: () => void; onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Pressable onClick={onBack} pressedScale={0.88}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke={theme.mutedInk} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Pressable>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "500 18px/1.2 'Source Serif 4', serif", color: theme.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sub.name}
          </div>
          <div style={{ font: "400 12px/1 'Inter', sans-serif", color: theme.mutedInk }}>
            {sub.servers.length} серверов
          </div>
        </div>
      </div>

      {/* Announce */}
      {sub.announce && (
        <div style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 14, background: theme.cardBg, border: `1px solid ${theme.border}` }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9" stroke={theme.mutedInk} strokeWidth="1.8" />
            <path d="M12 8v4M12 16h.01" stroke={theme.mutedInk} strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <div style={{ font: "400 12px/1.4 'Inter', sans-serif", color: theme.mutedInk }}>{sub.announce}</div>
        </div>
      )}

      {/* Traffic card (mock — no data from backend yet) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 14, background: theme.cardBg, border: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M22 12H2M22 12L18 8M22 12L18 16M2 12L6 8M2 12L6 16" stroke={theme.mutedInk} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ font: "500 12.5px/1 'Inter', sans-serif", color: theme.ink, flex: 1 }}>Трафик</div>
          <div style={{ font: "400 12px/1 'Inter', sans-serif", color: theme.mutedInk }}>Не указано</div>
        </div>
        <div style={{ height: 1, background: theme.border }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="18" rx="2" stroke={theme.mutedInk} strokeWidth="1.8" />
            <path d="M16 2v4M8 2v4M3 10h18" stroke={theme.mutedInk} strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <div style={{ font: "500 12.5px/1 'Inter', sans-serif", color: theme.ink, flex: 1 }}>Истекает</div>
          <div style={{ font: "400 12px/1 'Inter', sans-serif", color: theme.mutedInk }}>Не указано</div>
        </div>
      </div>

      {/* Details card */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: 12, borderRadius: 14, background: theme.cardBg, border: `1px solid ${theme.border}` }}>
        <DetailRow icon="link" label="Ссылка" value={sub.url ?? 'Не указана'} monospace theme={theme} />
        {sub.profileWebPageUrl && sub.profileWebPageUrl !== sub.url && (
          <DetailRow icon="globe" label="Страница профиля" value={sub.profileWebPageUrl} monospace theme={theme} />
        )}
        <DetailRow icon="clock" label="Обновление профиля" value={formatUpdateInterval(sub.profileUpdateIntervalHours)} theme={theme} />
      </div>

      {/* Last refresh error */}
      {sub.lastRefreshError && (
        <div style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 14, background: `color-mix(in oklch, ${theme.danger} 10%, transparent)`, border: `1px solid color-mix(in oklch, ${theme.danger} 40%, transparent)` }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M12 9v4M12 17h.01" stroke={theme.danger} strokeWidth="1.8" strokeLinecap="round" />
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke={theme.danger} strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          <div style={{ font: "400 12px/1.4 'Inter', sans-serif", color: theme.danger }}>{sub.lastRefreshError}</div>
        </div>
      )}

      {/* Delete */}
      {confirmDelete ? (
        <div style={{ padding: 12, borderRadius: 14, background: theme.cardBg, border: `1px solid color-mix(in oklch, ${theme.danger} 45%, transparent)`, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ font: "500 14px/1.4 'Inter', sans-serif", color: theme.ink }}>Удалить подписку и все её серверы?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Pressable onClick={() => setConfirmDelete(false)} style={{ flex: 1, borderRadius: 10 }}>
              <div className="btn-cancel" style={{ textAlign: 'center', padding: '10px', borderRadius: 10, border: `1px solid ${theme.border}`, font: "500 13px/1 'Inter', sans-serif", color: theme.mutedInk }}>
                Отмена
              </div>
            </Pressable>
            <Pressable onClick={onDelete} style={{ flex: 1, borderRadius: 10 }}>
              <div className="btn-submit" style={{ textAlign: 'center', padding: '10px', borderRadius: 10, background: theme.danger, font: "500 13px/1 'Inter', sans-serif", color: '#fff' }}>
                Удалить
              </div>
            </Pressable>
          </div>
        </div>
      ) : (
        <Pressable onClick={() => setConfirmDelete(true)} borderRadius={14}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 12px', borderRadius: 14, border: `1px solid color-mix(in oklch, ${theme.danger} 45%, transparent)` }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M5 7H19M10 11V17M14 11V17M9 7L10 4H14L15 7M7 7L8 20H16L17 7" stroke={theme.danger} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ font: "500 14px/1.3 'Inter', sans-serif", color: theme.danger }}>Удалить подписку</div>
              <div style={{ font: "400 12px/1.3 'Inter', sans-serif", color: theme.mutedInk }}>Группа и её серверы будут удалены</div>
            </div>
          </div>
        </Pressable>
      )}
    </div>
  );
}

function DetailRow({ icon, label, value, monospace = false, theme }: {
  icon: 'link' | 'globe' | 'clock'; label: string; value: string; monospace?: boolean; theme: Theme;
}) {
  const icons: Record<string, React.ReactNode> = {
    link: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke={theme.mutedInk} strokeWidth="1.8" strokeLinecap="round" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke={theme.mutedInk} strokeWidth="1.8" strokeLinecap="round" /></svg>,
    globe: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={theme.mutedInk} strokeWidth="1.8" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke={theme.mutedInk} strokeWidth="1.8" /></svg>,
    clock: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={theme.mutedInk} strokeWidth="1.8" /><path d="M12 8v4l3 3" stroke={theme.mutedInk} strokeWidth="1.8" strokeLinecap="round" /></svg>,
  };
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ flexShrink: 0, marginTop: 1 }}>{icons[icon]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "400 11px/1 'Inter', sans-serif", color: theme.mutedInk, marginBottom: 2 }}>{label}</div>
        <div style={{ font: `400 12.5px/1.3 ${monospace ? "'ui-monospace', 'Cascadia Mono', monospace" : "'Inter', sans-serif"}`, color: theme.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value}
        </div>
      </div>
    </div>
  );
}

// ─── Server Sheet ─────────────────────────────────────────────────────────────

type ServerSheetProps = {
  groups: UiSubscription[];
  selectedServerId: string;
  addServerOpen: boolean;
  addServerValue: string;
  addServerError: string;
  addServerLoading: boolean;
  importMessage: string;
  refreshAllLoading: boolean;
  subscriptionMenuId: string | null;
  theme: Theme;
  accent: string;
  onSelect: (id: string) => void;
  onRemove: (id: string, e: React.MouseEvent) => void;
  onDeleteSubscription: (id: string) => void;
  onOpenSubscription: (id: string) => void;
  onCloseSubscription: () => void;
  onRefreshAll: () => void;
  onOpenAddServer: () => void;
  onCancelAddServer: () => void;
  onChangeAddServerValue: (v: string) => void;
  onSubmitAddServer: () => void;
};

function ServerSheet(props: ServerSheetProps) {
  const { groups, selectedServerId, theme, accent, subscriptionMenuId } = props;

  const subscriptionMenu = groups.find((g) => g.id === subscriptionMenuId) ?? null;
  const latchRef = useRef(subscriptionMenu);
  if (subscriptionMenu !== null) latchRef.current = subscriptionMenu;

  const [drillVisible, setDrillVisible] = useState<boolean>(subscriptionMenuId !== null);
  const [drillClosing, setDrillClosing] = useState(false);

  // Handle drill transitions
  useEffect(() => {
    if (subscriptionMenuId !== null) {
      setDrillClosing(false);
      setDrillVisible(true);
    } else if (drillVisible) {
      setDrillClosing(true);
      const t = setTimeout(() => {
        setDrillVisible(false);
        setDrillClosing(false);
      }, 220);
      return () => clearTimeout(t);
    }
  }, [subscriptionMenuId]);

  const allServers = groups.flatMap((g) => g.servers);

  return (
    // Grid stacks both panels in the same cell: the sheet's height auto-sizes to
    // whichever panel is tallest, instead of being capped by the main list (which
    // used to clip/force-scroll the drill panel when its content was taller).
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: '1fr', flex: 1, minHeight: 0, overflowX: 'hidden', overflowY: 'auto' }}>
      {/* Main list */}
      <div
        className={drillVisible ? (drillClosing ? 'drill-in-back' : 'drill-out-forward') : ''}
        style={{
          gridColumn: 1, gridRow: 1, minWidth: 0, minHeight: 0,
          display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: 0,
          // stays in-flow (display:none would zero out the sheet's auto-height, since the
          // grid cell sizing is based on the natural size of in-flow items)
          visibility: drillVisible && !drillClosing ? 'hidden' : 'visible',
          pointerEvents: drillVisible && !drillClosing ? 'none' : 'auto',
        }}
      >
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ font: "500 17px/1.2 'Source Serif 4', serif", color: theme.ink }}>Выбор сервера</div>
          {groups.some((g) => g.id !== null) && (
            <Pressable
              className="refresh-all-btn"
              onClick={props.onRefreshAll}
              disabled={props.refreshAllLoading}
              pressedScale={1}
              borderRadius={10}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: `color-mix(in oklch, ${accent} 10%, transparent)`, borderRadius: 10, padding: '8px 12px' }}>
                {props.refreshAllLoading ? (
                  <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2.5px solid color-mix(in oklch, ${accent} 40%, transparent)`, borderTopColor: accent, animation: 'spin 0.85s linear infinite' }} />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M21 3v5h-5" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M3 21v-5h5" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                <div style={{ font: "500 13px/1 'Inter', sans-serif", color: accent }}>Обновить</div>
              </div>
            </Pressable>
          )}
        </div>

        {/* Server groups list */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.length === 0 && (
            <div style={{ font: "400 13px/1.4 'Inter', sans-serif", color: theme.mutedInk, paddingBottom: 12 }}>
              Список пуст. Добавь VLESS-ссылку или URL подписки ниже.
            </div>
          )}

          {groups.map((group) => (
            <div
              key={group.id ?? 'manual'}
              style={{ borderRadius: 16, background: theme.cardBg, border: `1px solid ${theme.border}`, overflow: 'hidden' }}
            >
              {/* Group header */}
              <div
                className={group.id ? 'sub-group-header' : ''}
                onClick={group.id ? () => props.onOpenSubscription(group.id!) : undefined}
                style={{ padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 8, cursor: group.id ? 'default' : undefined }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ font: "600 15px/1.3 'Inter', sans-serif", color: theme.ink }}>{group.name}</div>
                  {group.announce && (
                    <div style={{ font: "400 12px/1.4 'Inter', sans-serif", color: theme.mutedInk, marginTop: 2 }}>{group.announce}</div>
                  )}
                </div>
                {group.id && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                    <path d="M9 6L15 12L9 18" stroke={theme.mutedInk} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>

              {/* Servers */}
              {group.servers.map((srv) => {
                const isSelected = srv.id === selectedServerId;
                return (
                  <div
                    key={srv.id}
                    className="server-item"
                    onClick={() => props.onSelect(srv.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'default' }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: isSelected ? accent : theme.border, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      <span style={{ font: "500 16px/1.3 'Inter', sans-serif", color: theme.ink }}>{srv.name}</span>
                      {srv.latencyLabel && (
                        <span style={{ font: "400 13px/1.3 'Inter', sans-serif", color: theme.mutedInk }}> {srv.latencyLabel}</span>
                      )}
                    </div>
                    {isSelected && (
                      <svg className="server-checkmark" width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M5 13L9.5 17.5L19 7" stroke={accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    {srv.isCustom && (
                      <div
                        className="remove-server-btn"
                        onClick={(e) => props.onRemove(srv.id, e)}
                        style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                          <path className="remove-icon" d="M5 5L19 19M19 5L5 19" stroke={theme.mutedInk} strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Import message */}
        {props.importMessage && (
          <div style={{ font: "400 12px/1.3 'Inter', sans-serif", color: accent, padding: '8px 0' }}>{props.importMessage}</div>
        )}

        {/* Add server */}
        <div style={{ marginTop: 6 }}>
          {!props.addServerOpen ? (
            <div
              className="add-server-trigger"
              onClick={props.onOpenAddServer}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 10px', borderRadius: 14, border: `1.5px solid ${theme.border}`, cursor: 'default' }}
            >
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: theme.cardBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ font: "400 15px/1 'Inter', sans-serif", color: theme.mutedInk }}>+</span>
              </div>
              <span style={{ font: "500 14px/1.3 'Inter', sans-serif", color: theme.mutedInk }}>Добавить VLESS или подписку</span>
            </div>
          ) : (
            <div className="add-server-panel" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 14, background: theme.cardBg }}>
              <div style={{ font: "500 12px/1.3 'Inter', sans-serif", color: theme.mutedInk }}>VLESS-ссылка или URL подписки</div>
              <input
                className="add-server-input"
                value={props.addServerValue}
                onChange={(e) => props.onChangeAddServerValue(e.target.value)}
                placeholder="vless://... или https://.../sub/..."
                disabled={props.addServerLoading}
                style={{
                  font: "400 13px/1.4 ui-monospace, 'Cascadia Mono', monospace",
                  color: theme.ink,
                  background: theme.pageBg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                }}
              />
              {props.addServerError && (
                <div style={{ font: "400 12px/1.3 'Inter', sans-serif", color: theme.danger }}>{props.addServerError}</div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Pressable onClick={props.onCancelAddServer} disabled={props.addServerLoading} style={{ flex: 1, borderRadius: 10 }}>
                  <div className="btn-cancel" style={{ textAlign: 'center', padding: 10, borderRadius: 10, border: `1px solid ${theme.border}`, font: "500 13px/1 'Inter', sans-serif", color: theme.mutedInk }}>
                    Отмена
                  </div>
                </Pressable>
                <Pressable onClick={props.onSubmitAddServer} disabled={props.addServerLoading} style={{ flex: 1, borderRadius: 10 }}>
                  <div className="btn-submit" style={{ textAlign: 'center', padding: 10, borderRadius: 10, background: `color-mix(in oklch, ${accent} ${props.addServerLoading ? 60 : 100}%, transparent)`, font: "500 13px/1 'Inter', sans-serif", color: '#fff' }}>
                    {props.addServerLoading ? 'Добавляем...' : 'Добавить'}
                  </div>
                </Pressable>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drill-in: subscription menu */}
      {(drillVisible || drillClosing) && latchRef.current && (
        <div
          className={drillClosing ? 'drill-out-back' : 'drill-in-forward'}
          style={{ gridColumn: 1, gridRow: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: theme.appBg }}
        >
          <SubscriptionMenuContent
            sub={latchRef.current}
            theme={theme}
            accent={accent}
            onBack={props.onCloseSubscription}
            onDelete={() => { if (latchRef.current?.id) props.onDeleteSubscription(latchRef.current.id); }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Settings Sheet ───────────────────────────────────────────────────────────

const ROUTING_LABELS: Record<RoutingMode, string> = { Full: 'Полный VPN', BypassLocal: 'Обход локалки', BypassRu: 'Обход RU и локалки' };
const ROUTING_SUBTITLES: Record<RoutingMode, string> = { Full: 'Весь трафик через выбранный сервер', BypassLocal: 'Локальные сети и private IP идут напрямую', BypassRu: 'RU-домены и локальные сети идут напрямую' };
const REFRESH_LABELS: Record<AutoRefreshMode, string> = { Auto: 'Авто', Off: 'Выкл', EveryHours: 'Каждые N часов' };
const REFRESH_SUBTITLES: Record<AutoRefreshMode, string> = { Auto: 'По Profile-Update-Interval, иначе раз в 24 часа', Off: 'Обновлять только вручную', EveryHours: 'Фиксированный интервал для всех подписок' };

function SettingsSheet({ theme, accent, darkModeOn, routingMode, autoRefreshMode, autoRefreshHours, onToggleDarkMode, onSetRoutingMode, onSetAutoRefreshMode, onSetAutoRefreshHours, onOpenLogs }: {
  theme: Theme; accent: string; darkModeOn: boolean;
  routingMode: RoutingMode; autoRefreshMode: AutoRefreshMode; autoRefreshHours: number;
  onToggleDarkMode: () => void;
  onSetRoutingMode: (m: RoutingMode) => void;
  onSetAutoRefreshMode: (m: AutoRefreshMode) => void;
  onSetAutoRefreshHours: (h: number) => void;
  onOpenLogs: () => void;
}) {
  return (
    <div style={{ overflow: 'auto' }}>
      <div style={{ font: "500 17px/1.2 'Source Serif 4', serif", color: theme.ink, marginBottom: 16 }}>Настройки</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SettingsActionRow theme={theme} title="Логи" subtitle="Открыть журнал sing-box" onClick={onOpenLogs} />
        <ToggleRow theme={theme} accent={accent} title="Тёмная тема" subtitle="Спокойнее для глаз вечером" checked={darkModeOn} onToggle={onToggleDarkMode} />
        <RoutingModeSection theme={theme} accent={accent} selectedMode={routingMode} onSelect={onSetRoutingMode} />
        <AutoRefreshSection
          theme={theme} accent={accent}
          mode={autoRefreshMode} hours={autoRefreshHours}
          onSetMode={onSetAutoRefreshMode} onSetHours={onSetAutoRefreshHours}
        />
      </div>
    </div>
  );
}

function RoutingModeSection({ theme, accent, selectedMode, onSelect }: {
  theme: Theme; accent: string; selectedMode: RoutingMode; onSelect: (m: RoutingMode) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <>
      <SettingsActionRow theme={theme} title="Маршрутизация" subtitle={ROUTING_LABELS[selectedMode]} onClick={() => setDialogOpen(true)} />
      {dialogOpen && (
        <SettingsPickerDialog theme={theme} title="Маршрутизация" onDismiss={() => setDialogOpen(false)}>
          {(['Full', 'BypassLocal', 'BypassRu'] as RoutingMode[]).map((mode) => (
            <SettingsChoiceRow
              key={mode}
              theme={theme} accent={accent}
              title={ROUTING_LABELS[mode]}
              subtitle={ROUTING_SUBTITLES[mode]}
              selected={selectedMode === mode}
              onClick={() => { onSelect(mode); setDialogOpen(false); }}
            />
          ))}
        </SettingsPickerDialog>
      )}
    </>
  );
}

function AutoRefreshSection({ theme, accent, mode, hours, onSetMode, onSetHours }: {
  theme: Theme; accent: string; mode: AutoRefreshMode; hours: number;
  onSetMode: (m: AutoRefreshMode) => void; onSetHours: (h: number) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [hoursText, setHoursText] = useState(hours.toString());

  useEffect(() => { setHoursText(hours.toString()); }, [hours]);

  const subtitle = mode === 'EveryHours' ? `Каждые ${hours} ч` : REFRESH_LABELS[mode];

  return (
    <>
      <SettingsActionRow theme={theme} title="Обновление подписок" subtitle={subtitle} onClick={() => setDialogOpen(true)} />
      {dialogOpen && (
        <SettingsPickerDialog theme={theme} title="Обновление подписок" onDismiss={() => setDialogOpen(false)}>
          {(['Auto', 'Off', 'EveryHours'] as AutoRefreshMode[]).map((m) => (
            <SettingsChoiceRow
              key={m}
              theme={theme} accent={accent}
              title={REFRESH_LABELS[m]}
              subtitle={REFRESH_SUBTITLES[m]}
              selected={mode === m}
              onClick={() => { onSetMode(m); if (m !== 'EveryHours') setDialogOpen(false); }}
            />
          ))}
          <div className={`hours-input-wrapper ${mode === 'EveryHours' ? 'visible' : ''}`}>
            <input
              className="hours-input"
              type="number"
              value={hoursText}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
                setHoursText(digits);
                const num = parseInt(digits, 10);
                if (num > 0) onSetHours(num);
              }}
              placeholder="Часы"
              style={{
                font: "400 14px/1 'Inter', sans-serif",
                color: theme.ink,
                background: theme.pageBg,
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
                padding: '10px 12px',
                marginTop: 8,
              }}
            />
          </div>
        </SettingsPickerDialog>
      )}
    </>
  );
}

function SettingsPickerDialog({ theme, title, onDismiss, children }: {
  theme: Theme; title: string; onDismiss: () => void; children: React.ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const closeTimeoutRef = useRef<any>(null);

  useEffect(() => { return () => { if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current); }; }, []);

  const close = () => {
    if (closing) return;
    setClosing(true);
    closeTimeoutRef.current = setTimeout(onDismiss, 180);
  };

  // Portaled to <body>: rendered inside the (transform-animated, overflow:hidden)
  // settings sheet, `position: fixed` here would be contained by that ancestor
  // instead of the viewport — clipping the dialog toward the bottom and letting
  // clicks outside the clipped area fall through to the settings sheet's own
  // backdrop, closing both at once.
  return createPortal(
    <>
      <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, animation: `${closing ? 'backdropOut' : 'backdropIn'} 0.2s cubic-bezier(0.4,0,0.2,1) both` }} />
      <div
        style={{
          position: 'fixed', top: '50%', left: '50%',
          width: 'min(400px, calc(100vw - 64px))',
          zIndex: 101,
          animation: `${closing ? 'dialogOut' : 'dialogIn'} ${closing ? '0.18s' : '0.22s'} cubic-bezier(0.4,0,0.2,1) both`,
          boxSizing: 'border-box',
          borderRadius: 22,
          background: theme.appBg,
          border: `1px solid ${theme.border}`,
          padding: '4px 0',
        }}
      >
        <div style={{ font: "500 17px/1.2 'Source Serif 4', serif", color: theme.ink, padding: '18px 18px 13px' }}>{title}</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
        <div style={{ height: 14 }} />
      </div>
    </>,
    document.body
  );
}

function SettingsChoiceRow({ theme, accent, title, subtitle, selected, onClick }: {
  theme: Theme; accent: string; title: string; subtitle: string; selected: boolean; onClick: () => void;
}) {
  return (
    <div
      className="settings-choice-row"
      onClick={onClick}
      style={{ borderRadius: 14 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px' }}>
        <div>
          <div style={{ font: "500 14.5px/1.3 'Inter', sans-serif", color: theme.ink }}>{title}</div>
          <div style={{ font: "400 12px/1.3 'Inter', sans-serif", color: theme.mutedInk }}>{subtitle}</div>
        </div>
        <div style={{
          width: 18, height: 18, borderRadius: '50%',
          border: `1.5px solid ${selected ? accent : theme.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 4, boxSizing: 'border-box', flexShrink: 0,
        }}>
          {selected && <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: accent }} />}
        </div>
      </div>
    </div>
  );
}

function SettingsActionRow({ theme, title, subtitle, onClick }: {
  theme: Theme; title: string; subtitle: string; onClick: () => void;
}) {
  return (
    <div className="settings-row" onClick={onClick} style={{ borderRadius: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px' }}>
        <div>
          <div style={{ font: "500 14.5px/1.3 'Inter', sans-serif", color: theme.ink }}>{title}</div>
          <div style={{ font: "400 12px/1.3 'Inter', sans-serif", color: theme.mutedInk }}>{subtitle}</div>
        </div>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M9 6L15 12L9 18" stroke={theme.mutedInk} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

function ToggleRow({ theme, accent, title, subtitle, checked, onToggle }: {
  theme: Theme; accent: string; title: string; subtitle: string; checked: boolean; onToggle: () => void;
}) {
  return (
    <div className="settings-row" onClick={onToggle} style={{ borderRadius: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px' }}>
        <div>
          <div style={{ font: "500 14.5px/1.3 'Inter', sans-serif", color: theme.ink }}>{title}</div>
          <div style={{ font: "400 12px/1.3 'Inter', sans-serif", color: theme.mutedInk }}>{subtitle}</div>
        </div>
        <MiniSwitch checked={checked} accent={accent} theme={theme} onToggle={onToggle} />
      </div>
    </div>
  );
}

// ─── Logs Screen ──────────────────────────────────────────────────────────────

function LogsScreen({ theme, accent, logs, logsLoading, logsError, onBack, onClear, onCopy }: {
  theme: Theme; accent: string;
  logs: LogEntryDto[]; logsLoading: boolean; logsError: string;
  onBack: () => void; onClear: () => void; onCopy: () => void;
}) {
  return (
    <div
      style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        background: theme.appBg,
        ...themeVars(theme),
        boxSizing: 'border-box',
        padding: '18px 18px 20px',
        overflow: 'hidden',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Header: back arrow + Назад | copy | delete */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10, flexShrink: 0 }}>
        <Pressable onClick={onBack} pressedScale={1} borderRadius={10}>
          <div className="log-header-btn" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px 10px 10px', borderRadius: 10, transition: 'background-color 0.15s ease' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke={theme.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ font: "500 14px/1 'Inter', sans-serif", color: theme.ink }}>Назад</div>
          </div>
        </Pressable>
        <div style={{ flex: 1 }} />
        <Pressable onClick={logs.length > 0 ? onCopy : undefined} disabled={logs.length === 0 || logsLoading} pressedScale={1} ripple={true} style={{ borderRadius: 10 }}>
          <div className="log-header-btn" style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, transition: 'background-color 0.15s ease' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="9" width="10" height="10" rx="2" stroke={theme.ink} strokeWidth="2" />
              <path d="M15 9V7C15 5.9 14.1 5 13 5H7C5.9 5 5 5.9 5 7V13C5 14.1 5.9 15 7 15H9" stroke={theme.ink} strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </Pressable>
        <div style={{ width: 6, flexShrink: 0 }} />
        <Pressable onClick={logs.length > 0 ? onClear : undefined} disabled={logs.length === 0 || logsLoading} pressedScale={1} ripple={true} style={{ borderRadius: 10 }}>
          <div className="log-header-btn" style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, transition: 'background-color 0.15s ease' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M5 7H19M10 11V17M14 11V17M9 7L10 4H14L15 7M7 7L8 20H16L17 7" stroke={theme.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </Pressable>
      </div>
      <div style={{ height: 1, background: theme.border, marginBottom: 12, flexShrink: 0 }} />

      {/* Log lines — plain text directly on background, no card */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {logsLoading && logs.length === 0 ? (
          <span style={{ color: theme.mutedInk, font: "400 12px/1.5 ui-monospace, 'Cascadia Mono', monospace" }}>
            Загрузка…
          </span>
        ) : logsError ? (
          <span style={{ color: theme.danger, font: "400 12px/1.5 ui-monospace, 'Cascadia Mono', monospace" }}>
            {logsError}
          </span>
        ) : logs.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke={theme.mutedInk} strokeWidth="1.4" opacity="0.5" />
              <path d="M12 8v4M12 16h.01" stroke={theme.mutedInk} strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
            </svg>
            <div style={{ font: "500 18px/1.2 'Source Serif 4', serif", color: theme.mutedInk }}>Логов пока нет</div>
          </div>
        ) : (
          logs.map((entry, index) => (
            <div key={`${entry.source}-${index}`} style={{ font: "400 12px/1.45 ui-monospace, 'Cascadia Mono', Consolas, monospace", color: theme.ink, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', paddingBottom: 2 }}>
              <span style={{ color: accent }}>[{entry.source}]</span>{' '}{entry.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}


// ─── Main App ─────────────────────────────────────────────────────────────────

export function App() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('off');
  const [elapsed, setElapsed] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [appError, setAppError] = useState('');

  const [servers, setServers] = useState<ServerDto[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionDto[]>([]);
  const [pingMap, setPingMap] = useState<Record<string, number | null>>({});
  const [selectedServerId, setSelectedServerId] = useState('');

  const [menuVisible, setMenuVisible] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [subscriptionMenuId, setSubscriptionMenuId] = useState<string | null>(null);

  const [addServerOpen, setAddServerOpen] = useState(false);
  const [addServerValue, setAddServerValue] = useState('');
  const [addServerError, setAddServerError] = useState('');
  const [addServerLoading, setAddServerLoading] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [refreshAllLoading, setRefreshAllLoading] = useState(false);

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);

  const [appScreen, setAppScreen] = useState<'main' | 'logs'>('main');
  const [screenDir, setScreenDir] = useState<'forward' | 'back'>('forward');

  const [logs, setLogs] = useState<LogEntryDto[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [toastClosing, setToastClosing] = useState(false);
  const toastTimeoutRef = useRef<any>(null);

  const [darkModeOn, setDarkModeOn] = useState(true);
  const [routingMode, setRoutingMode] = useState<RoutingMode>('BypassRu');
  const [autoRefreshMode, setAutoRefreshMode] = useState<AutoRefreshMode>('Auto');
  const [autoRefreshHours, setAutoRefreshHours] = useState(24);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const menuCloseTimeoutRef = useRef<any>(null);
  const settingsCloseTimeoutRef = useRef<any>(null);

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let id: any = null;
    if (phase === 'on') {
      id = setInterval(() => setElapsed((p) => p + 1), 1000);
    } else {
      setElapsed(0);
    }
    return () => { if (id) clearInterval(id); };
  }, [phase]);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [serverList, subList, status, settings] = await Promise.all([
          invoke<ServerDto[]>('list_servers'),
          invoke<SubscriptionDto[]>('list_subscriptions'),
          invoke<ConnectionStatusDto>('connection_status'),
          invoke<SettingsDto>('get_settings'),
        ]);
        if (cancelled) return;

        setServers(serverList);
        setSubscriptions(subList);
        setPhase(phaseFromStatus(status));
        setSelectedServerId((current) => {
          if (status.server_id && serverList.some((s) => s.id === status.server_id)) return status.server_id!;
          if (current && serverList.some((s) => s.id === current)) return current;
          return serverList[0]?.id ?? '';
        });
        setAppError(status.state === 'error' ? status.message ?? 'Ошибка соединения' : '');

        // Settings
        const modeMap: Record<string, AutoRefreshMode> = { auto: 'Auto', off: 'Off', every_hours: 'EveryHours' };
        setAutoRefreshMode(modeMap[settings.auto_refresh_mode] ?? 'Auto');
        setAutoRefreshHours(settings.auto_refresh_hours);

        // Dark mode from localStorage
        const saved = localStorage.getItem('karst-dark-mode');
        if (saved !== null) setDarkModeOn(saved === 'true');
        const savedRouting = localStorage.getItem('karst-routing-mode') as RoutingMode | null;
        if (savedRouting) setRoutingMode(savedRouting);
      } catch (err) {
        if (!cancelled) setAppError(getErrorMessage(err));
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  // ── Ping ───────────────────────────────────────────────────────────────────
  // Re-runs whenever the server list changes, so it also refreshes on "Обновить".
  useEffect(() => {
    if (servers.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const results = await invoke<ServerPingDto[]>('ping_servers');
        if (cancelled) return;
        setPingMap((prev) => {
          const next = { ...prev };
          for (const r of results) next[r.id] = r.latency_ms ?? null;
          return next;
        });
      } catch {
        // non-critical: ping display just stays blank
      }
    })();
    return () => { cancelled = true; };
  }, [servers]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const isConnecting = phase === 'connecting' || (isBusy && phase === 'off');
  const isConnected = phase === 'on';
  const theme = darkModeOn ? DARK_THEME : LIGHT_THEME;

  const groups = buildGroups(servers, subscriptions).map((g) => ({
    ...g,
    servers: g.servers.map((s) => ({ ...s, latencyLabel: formatPingLabel(pingMap[s.id]) })),
  }));
  const allServers = groups.flatMap((g) => g.servers);
  const selectedServer = allServers.find((s) => s.id === selectedServerId) ?? allServers[0] ?? null;

  const statusLabel = isConnected ? 'Подключено' : isConnecting ? 'Подключаемся…' : 'Не подключено';
  const subLabel = appError || (servers.length === 0
    ? 'Добавь VLESS-ссылку или подписку'
    : isConnecting ? mood.subConnecting : mood.subOff);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const onTapButton = async () => {
    if (isBusy || phase === 'connecting') return;
    if (phase === 'off') {
      if (!selectedServerId) { setAppError('Добавь VLESS-сервер перед подключением'); return; }
      setIsBusy(true); setAppError(''); setPhase('connecting');
      try {
        const status = await invoke<ConnectionStatusDto>('connect', { serverId: selectedServerId });
        setPhase(phaseFromStatus(status));
        if (status.server_id) setSelectedServerId(status.server_id);
      } catch (err) { setPhase('off'); setAppError(getErrorMessage(err)); }
      finally { setIsBusy(false); }
    } else if (phase === 'on') {
      setIsBusy(true); setAppError('');
      try {
        const status = await invoke<ConnectionStatusDto>('disconnect');
        setPhase(phaseFromStatus(status));
      } catch (err) { setAppError(getErrorMessage(err)); }
      finally { setIsBusy(false); }
    }
  };

  const onOpenServerMenu = () => { if (menuVisible) return; setMenuVisible(true); setMenuClosing(false); };

  const onCloseServerMenu = useCallback(() => {
    if (!menuVisible || menuClosing) return;
    setMenuClosing(true);
    if (menuCloseTimeoutRef.current) clearTimeout(menuCloseTimeoutRef.current);
    menuCloseTimeoutRef.current = setTimeout(() => { setMenuVisible(false); setMenuClosing(false); setSubscriptionMenuId(null); }, 320);
  }, [menuVisible, menuClosing]);

  const onSelectServer = (id: string) => { setSelectedServerId(id); onCloseServerMenu(); };

  const onRemoveServer = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBusy) return;
    setIsBusy(true); setAppError('');
    try {
      await invoke<boolean>('delete_server', { serverId: id });
      const next = servers.filter((s) => s.id !== id);
      setServers(next);
      setSelectedServerId((c) => (c === id ? next[0]?.id ?? '' : c));
    } catch (err) { setAppError(getErrorMessage(err)); }
    finally { setIsBusy(false); }
  };

  const onDeleteSubscription = async (id: string) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await invoke<boolean>('delete_subscription', { subscriptionId: id });
      const [serverList, subList] = await Promise.all([invoke<ServerDto[]>('list_servers'), invoke<SubscriptionDto[]>('list_subscriptions')]);
      setServers(serverList);
      setSubscriptions(subList);
      setSubscriptionMenuId(null);
      onCloseServerMenu();
    } catch (err) { setAppError(getErrorMessage(err)); }
    finally { setIsBusy(false); }
  };

  const onOpenAddServer = () => { setAddServerOpen(true); setAddServerError(''); setImportMessage(''); };
  const closeAddServerForm = () => { setAddServerOpen(false); setAddServerValue(''); setAddServerError(''); };
  const onCancelAddServer = () => closeAddServerForm();

  const onSubmitAddServer = async () => {
    const value = addServerValue.trim();
    if (!value) { setAddServerError('Вставь vless:// ссылку или https:// подписку'); return; }
    setAddServerLoading(true); setAddServerError('');
    try {
      if (value.toLowerCase().startsWith('https://') || value.toLowerCase().startsWith('http://')) {
        const summary = await invoke<ImportSummaryDto>('add_subscription', { url: value, name: null });
        if (summary.error) { setAddServerError(summary.error); return; }
        const [serverList, subList] = await Promise.all([invoke<ServerDto[]>('list_servers'), invoke<SubscriptionDto[]>('list_subscriptions')]);
        setServers(serverList);
        setSubscriptions(subList);
        const importedServer = serverList.find((s) => s.subscription_id === summary.subscription_id);
        setSelectedServerId(importedServer?.id ?? serverList[0]?.id ?? '');
        setImportMessage(`Импортировано ${summary.imported} сервер(ов)`);
      } else {
        const srv = await invoke<ServerDto>('add_manual_link', { vlessUri: value });
        setServers((prev) => [srv, ...prev.filter((s) => s.id !== srv.id)]);
        setSelectedServerId(srv.id);
      }
      setAppError('');
      closeAddServerForm();
    } catch (err) { setAddServerError(getErrorMessage(err)); }
    finally { setAddServerLoading(false); }
  };

  const onRefreshAll = async () => {
    if (refreshAllLoading) return;
    setRefreshAllLoading(true);
    try {
      await invoke<any[]>('refresh_all_subscriptions');
      const [serverList, subList] = await Promise.all([invoke<ServerDto[]>('list_servers'), invoke<SubscriptionDto[]>('list_subscriptions')]);
      setServers(serverList);
      setSubscriptions(subList);
    } catch (err) { setAppError(getErrorMessage(err)); }
    finally { setRefreshAllLoading(false); }
  };

  const onOpenSettings = () => { if (settingsVisible) return; setSettingsVisible(true); setSettingsClosing(false); };
  const onCloseSettings = () => {
    if (!settingsVisible || settingsClosing) return;
    setSettingsClosing(true);
    if (settingsCloseTimeoutRef.current) clearTimeout(settingsCloseTimeoutRef.current);
    settingsCloseTimeoutRef.current = setTimeout(() => { setSettingsVisible(false); setSettingsClosing(false); }, 320);
  };

  const onToggleDarkMode = () => {
    setDarkModeOn((prev) => { const next = !prev; localStorage.setItem('karst-dark-mode', String(next)); return next; });
  };

  const handleSetRoutingMode = (m: RoutingMode) => {
    setRoutingMode(m);
    localStorage.setItem('karst-routing-mode', m);
  };

  const handleSetAutoRefreshMode = async (m: AutoRefreshMode) => {
    setAutoRefreshMode(m);
    const modeStr = m === 'Auto' ? 'auto' : m === 'Off' ? 'off' : 'every_hours';
    try { await invoke('set_auto_refresh_settings', { mode: modeStr, hours: null }); } catch (_) {}
  };

  const handleSetAutoRefreshHours = async (h: number) => {
    setAutoRefreshHours(h);
    try { await invoke('set_auto_refresh_settings', { mode: 'every_hours', hours: h }); } catch (_) {}
  };

  const loadLogs = async () => {
    setLogsLoading(true); setLogsError('');
    try { setLogs(await invoke<LogEntryDto[]>('list_logs')); }
    catch (err) { setLogsError(getErrorMessage(err)); }
    finally { setLogsLoading(false); }
  };

  const onOpenLogs = () => {
    if (settingsCloseTimeoutRef.current) clearTimeout(settingsCloseTimeoutRef.current);
    setSettingsClosing(false);
    setScreenDir('forward');
    setAppScreen('logs');
    void loadLogs();
  };

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastClosing(false);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastClosing(true);
      toastTimeoutRef.current = setTimeout(() => setToastMessage(''), 280);
    }, 1800);
  };

  const onClearLogs = async () => {
    setLogsLoading(true); setLogsError('');
    try { await invoke('clear_logs'); setLogs([]); showToast('Логи очищены'); }
    catch (err) { setLogsError(getErrorMessage(err)); }
    finally { setLogsLoading(false); }
  };

  const onCopyLogs = async () => {
    try { await navigator.clipboard.writeText(logs.map((e) => `[${e.source}] ${e.message}`).join('\n')); showToast('Логи скопированы'); }
    catch (err) { setLogsError(getErrorMessage(err)); }
  };

  const onBackToMain = () => { setScreenDir('back'); setAppScreen('main'); };

  // ── Sheet animations ────────────────────────────────────────────────────────
  const menuAnim = `${menuClosing ? 'menuSlideDown' : 'menuSlideUp'} 0.38s cubic-bezier(0.4,0,0.2,1) both`;
  const backdropAnim = `${menuClosing ? 'backdropOut' : 'backdropIn'} 0.32s cubic-bezier(0.4,0,0.2,1) both`;
  const settingsAnim = `${settingsClosing ? 'menuSlideDown' : 'menuSlideUp'} 0.38s cubic-bezier(0.4,0,0.2,1) both`;
  const settingsBackdropAnim = `${settingsClosing ? 'backdropOut' : 'backdropIn'} 0.32s cubic-bezier(0.4,0,0.2,1) both`;

  // Screen transition
  const screenClass = appScreen === 'logs'
    ? (screenDir === 'forward' ? 'route-enter-from-right' : 'route-enter-from-left')
    : (screenDir === 'back' ? 'route-enter-from-left' : '');

  // ── Render ──────────────────────────────────────────────────────────────────


  const dragHandle = (
    <div style={{ width: 36, height: 4, borderRadius: 2, background: theme.border, margin: '6px auto 10px' }} />
  );

  return (
    /* Root: fills the entire window, provides the theme background */
    <div style={{ width: '100%', height: '100%', background: theme.appBg, position: 'relative', overflow: 'hidden', ...themeVars(theme) }}>

      {/* ── Main screen ───────────────────────────────────────────── */}
      <div
        className={appScreen === 'main' && screenDir === 'back' ? 'route-enter-from-left' : appScreen === 'main' ? '' : 'route-exit-to-left'}
        style={{
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          boxSizing: 'border-box',
          padding: '8px 28px 36px',
          background: theme.appBg,
          position: 'absolute', top: 0, left: 0,
          overflow: 'hidden',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          pointerEvents: appScreen !== 'main' ? 'none' : undefined,
        }}
      >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingTop: 18, paddingBottom: 0 }}>
        <Pressable onClick={onOpenSettings} pressedScale={0.92} className="settings-btn" style={{
          width: 46, height: 46, borderRadius: '50%',
          background: theme.cardBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 15.5C13.933 15.5 15.5 13.933 15.5 12C15.5 10.067 13.933 8.5 12 8.5C10.067 8.5 8.5 10.067 8.5 12C8.5 13.933 10.067 15.5 12 15.5Z" stroke={theme.mutedInk} strokeWidth="1.8" />
            <path d="M19.4 13.5C19.46 13.01 19.5 12.51 19.5 12C19.5 11.49 19.46 10.99 19.4 10.5L21.34 8.97C21.53 8.82 21.58 8.55 21.46 8.34L19.74 5.36C19.62 5.15 19.36 5.07 19.14 5.15L16.87 6.06C16.18 5.53 15.42 5.11 14.6 4.82L14.25 2.42C14.21 2.18 14.01 2 13.77 2H10.33C10.09 2 9.89 2.18 9.85 2.42L9.5 4.82C8.68 5.11 7.92 5.54 7.23 6.06L4.96 5.15C4.74 5.07 4.48 5.15 4.36 5.36L2.64 8.34C2.52 8.55 2.57 8.82 2.76 8.97L4.7 10.5C4.64 10.99 4.6 11.5 4.6 12C4.6 12.5 4.64 13.01 4.7 13.5L2.76 15.03C2.57 15.18 2.52 15.45 2.64 15.66L4.36 18.64C4.48 18.85 4.74 18.93 4.96 18.85L7.23 17.94C7.92 18.47 8.68 18.89 9.5 19.18L9.85 21.58C9.89 21.82 10.09 22 10.33 22H13.77C14.01 22 14.21 21.82 14.25 21.58L14.6 19.18C15.42 18.89 16.18 18.46 16.87 17.94L19.14 18.85C19.36 18.93 19.62 18.85 19.74 18.64L21.46 15.66C21.58 15.45 21.53 15.18 21.34 15.03L19.4 13.5Z" stroke={theme.mutedInk} strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </Pressable>
      </div>

      {/* Center Stage */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        <ConnectButton
          phase={isConnecting ? 'connecting' : phase}
          enabled={selectedServer !== null || isConnected}
          theme={theme}
          accent={ACCENT}
          onClick={() => void onTapButton()}
        />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minHeight: 78 }}>
          <div style={{ font: "500 24px/1.15 'Source Serif 4', serif", color: theme.ink }}>{statusLabel}</div>
          {isConnected ? (
            <div style={{ font: "500 14px/1 'Inter', sans-serif", color: theme.mutedInk, letterSpacing: '0.3px', fontVariantNumeric: 'tabular-nums' }}>
              {formatElapsed(elapsed)}
            </div>
          ) : (
            <div style={{ font: "400 14px/1.4 'Inter', sans-serif", color: appError ? theme.danger : theme.mutedInk, maxWidth: 250, textAlign: 'center' }}>
              {subLabel}
            </div>
          )}
        </div>
      </div>

      {/* Location Chip */}
      <LocationChip server={selectedServer} theme={theme} onClick={onOpenServerMenu} />

      {/* Server Menu Overlay */}
      {menuVisible && (
        <>
          <div
            onClick={onCloseServerMenu}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', animation: backdropAnim, zIndex: 5 }}
          />
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            maxHeight: '82%',
            display: 'flex', flexDirection: 'column',
            background: theme.appBg,
            borderRadius: '22px 22px 0 0',
            boxShadow: '0 -18px 40px -16px rgba(0,0,0,0.4)',
            padding: '0 22px 28px',
            boxSizing: 'border-box',
            zIndex: 6,
            animation: menuAnim,
          }}>
            {dragHandle}
            <ServerSheet
              groups={groups}
              selectedServerId={selectedServerId}
              addServerOpen={addServerOpen}
              addServerValue={addServerValue}
              addServerError={addServerError}
              addServerLoading={addServerLoading}
              importMessage={importMessage}
              refreshAllLoading={refreshAllLoading}
              subscriptionMenuId={subscriptionMenuId}
              theme={theme}
              accent={ACCENT}
              onSelect={onSelectServer}
              onRemove={onRemoveServer}
              onDeleteSubscription={onDeleteSubscription}
              onOpenSubscription={setSubscriptionMenuId}
              onCloseSubscription={() => setSubscriptionMenuId(null)}
              onRefreshAll={() => void onRefreshAll()}
              onOpenAddServer={onOpenAddServer}
              onCancelAddServer={onCancelAddServer}
              onChangeAddServerValue={(v) => { setAddServerValue(v); setAddServerError(''); }}
              onSubmitAddServer={() => void onSubmitAddServer()}
            />
          </div>
        </>
      )}

      {/* Settings Overlay */}
      {settingsVisible && (
        <>
          <div
            onClick={onCloseSettings}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', animation: settingsBackdropAnim, zIndex: 5 }}
          />
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            maxHeight: '78%',
            display: 'flex', flexDirection: 'column',
            background: theme.appBg,
            borderRadius: '22px 22px 0 0',
            boxShadow: '0 -18px 40px -16px rgba(0,0,0,0.4)',
            padding: '0 22px 28px',
            boxSizing: 'border-box',
            zIndex: 6,
            animation: settingsAnim,
            overflow: 'hidden',
          }}>
            {dragHandle}
            <SettingsSheet
              theme={theme}
              accent={ACCENT}
              darkModeOn={darkModeOn}
              routingMode={routingMode}
              autoRefreshMode={autoRefreshMode}
              autoRefreshHours={autoRefreshHours}
              onToggleDarkMode={onToggleDarkMode}
              onSetRoutingMode={handleSetRoutingMode}
              onSetAutoRefreshMode={(m) => void handleSetAutoRefreshMode(m)}
              onSetAutoRefreshHours={(h) => void handleSetAutoRefreshHours(h)}
              onOpenLogs={onOpenLogs}
            />
          </div>
        </>
      )}
      </div>{/* end main screen */}

      {/* ── Logs screen ─────────────────────────────────────────────────── */}
      {appScreen === 'logs' && (
        <div
          className={screenDir === 'forward' ? 'route-enter-from-right' : 'route-enter-from-left'}
        >
          <LogsScreen
            theme={theme}
            accent={ACCENT}
            logs={logs}
            logsLoading={logsLoading}
            logsError={logsError}
            onBack={onBackToMain}
            onClear={onClearLogs}
            onCopy={() => void onCopyLogs()}
          />
        </div>
      )}
    </div>
  );
}
