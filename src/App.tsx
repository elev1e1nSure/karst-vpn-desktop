import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { commands, getErrorMessage } from './app/commands';
import { buildGroups, formatPingLabel } from './app/models';
import type { UiServer, UiSubscription } from './app/models';
import { useConnectionStatus } from './app/useConnectionStatus';
import { Pressable } from './ui/Pressable';
import { Tooltip } from './ui/Tooltip';
import { LogsScreen } from './ui/LogsScreen';
import { ACCENT, DARK_THEME, LIGHT_THEME, themeVars } from './ui/theme';
import type { Theme } from './ui/theme';
import type {
  AutoRefreshMode,
  LogEntryDto,
  Phase,
  RoutingMode,
  ServerDto,
  SubscriptionDto,
} from './app/types';
import './style.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatElapsed = (s: number): string => {
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

const isRoutingMode = (value: string): value is RoutingMode =>
  value === 'Full' || value === 'BypassLocal' || value === 'BypassRu';

function formatUpdateInterval(hours: number | null | undefined): string {
  if (!hours || hours <= 0) return 'Не указан';
  return `${hours} ч`;
}

const mood = {
  ringDuration: '1.7s',
  iconStroke: '2.2',
  chipRadius: '14px',
  subOff: 'Готов к подключению',
  subConnecting: 'Настраиваем туннель',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function MiniSwitch({
  checked,
  accent,
  theme,
  onToggle,
}: {
  checked: boolean;
  accent: string;
  theme: Theme;
  onToggle: () => void;
}) {
  const trackColor = checked ? `color-mix(in oklch, ${accent} 70%, transparent)` : theme.border;
  return (
    <div
      className="switch-btn mini-switch-track"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      style={{
        width: 46,
        height: 28,
        borderRadius: 14,
        background: trackColor,
        position: 'relative',
        flexShrink: 0,
        cursor: 'default',
      }}
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

function ConnectButton({
  phase,
  enabled,
  theme,
  accent,
  onClick,
}: {
  phase: Phase;
  enabled: boolean;
  theme: Theme;
  accent: string;
  onClick: () => void;
}) {
  const isConnecting = phase === 'connecting';
  const isConnected = phase === 'on';

  const buttonBg = isConnected ? accent : theme.buttonOffBg;
  const borderColor = isConnected ? accent : isConnecting ? accent : theme.buttonOffBorder;
  const iconColor = isConnected ? '#fff' : isConnecting ? accent : theme.buttonOffIcon;

  const ringClass = isConnected
    ? 'pulse-ring-connected'
    : isConnecting
      ? 'pulse-ring-connecting'
      : 'pulse-ring-off';

  return (
    <div
      style={{
        position: 'relative',
        width: 208,
        height: 208,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
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
          border: `2px solid ${borderColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
          opacity: enabled ? 1 : 0.55,
        }}
      >
        {isConnecting ? (
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: '3px solid rgba(255,255,255,0.35)',
              borderTopColor: '#fff',
              animation: 'spin 0.85s linear infinite',
            }}
          />
        ) : (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3V12"
              stroke={iconColor}
              strokeWidth={mood.iconStroke}
              strokeLinecap="round"
            />
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

function LocationChip({
  server,
  theme,
  onClick,
}: {
  server: UiServer | null;
  theme: Theme;
  onClick: () => void;
}) {
  const r = typeof mood.chipRadius === 'string' ? parseInt(mood.chipRadius, 10) : mood.chipRadius;
  return (
    <Pressable onClick={onClick} borderRadius={r}>
      <div
        className="location-chip"
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
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: theme.pageBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              border: `2px solid ${theme.mutedInk}`,
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              font: '500 14px/1.3 "Twemoji Country Flags", \'Inter\', sans-serif',
              color: theme.ink,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {server ? server.name : 'Добавить сервер'}
          </div>
          <div
            style={{
              font: "400 12px/1.3 'Inter', sans-serif",
              color: theme.mutedInk,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {server ? server.tag : 'VLESS-ссылка или URL подписки'}
          </div>
        </div>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path
            d="M9 6L15 12L9 18"
            stroke={theme.mutedInk}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </Pressable>
  );
}

// ─── Subscription Menu Content ────────────────────────────────────────────────

function SubscriptionMenuContent({
  sub,
  theme,
  onBack,
  onDelete,
}: {
  sub: UiSubscription;
  theme: Theme;
  onBack: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Tooltip label="Назад" theme={theme} placement="bottom">
          <Pressable onClick={onBack}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 18L9 12L15 6"
                stroke={theme.mutedInk}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Pressable>
        </Tooltip>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              font: "500 18px/1.2 'Source Serif 4', serif",
              color: theme.ink,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {sub.name}
          </div>
          <div style={{ font: "400 12px/1 'Inter', sans-serif", color: theme.mutedInk }}>
            {sub.servers.length} серверов
          </div>
        </div>
      </div>

      {/* Announce */}
      {sub.announce && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: 12,
            borderRadius: 14,
            background: theme.cardBg,
            border: `1px solid ${theme.border}`,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9" stroke={theme.mutedInk} strokeWidth="1.8" />
            <path
              d="M12 8v4M12 16h.01"
              stroke={theme.mutedInk}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <div style={{ font: "400 12px/1.4 'Inter', sans-serif", color: theme.mutedInk }}>
            {sub.announce}
          </div>
        </div>
      )}

      {/* Traffic card */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: 12,
          borderRadius: 14,
          background: theme.cardBg,
          border: `1px solid ${theme.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M22 12H2M22 12L18 8M22 12L18 16M2 12L6 8M2 12L6 16"
              stroke={theme.mutedInk}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div style={{ font: "500 12.5px/1 'Inter', sans-serif", color: theme.ink, flex: 1 }}>
            Трафик
          </div>
          <div style={{ font: "400 12px/1 'Inter', sans-serif", color: theme.mutedInk }}>
            {sub.trafficLabel}
          </div>
        </div>
        <div style={{ height: 1, background: theme.border }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <rect
              x="3"
              y="4"
              width="18"
              height="18"
              rx="2"
              stroke={theme.mutedInk}
              strokeWidth="1.8"
            />
            <path
              d="M16 2v4M8 2v4M3 10h18"
              stroke={theme.mutedInk}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <div style={{ font: "500 12.5px/1 'Inter', sans-serif", color: theme.ink, flex: 1 }}>
            Истекает
          </div>
          <div style={{ font: "400 12px/1 'Inter', sans-serif", color: theme.mutedInk }}>
            {sub.expiresLabel}
          </div>
        </div>
      </div>

      {/* Details card */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 11,
          padding: 12,
          borderRadius: 14,
          background: theme.cardBg,
          border: `1px solid ${theme.border}`,
        }}
      >
        <DetailRow
          icon="link"
          label="Ссылка"
          value={sub.url ?? 'Не указана'}
          monospace
          theme={theme}
        />
        {sub.profileWebPageUrl && sub.profileWebPageUrl !== sub.url && (
          <DetailRow
            icon="globe"
            label="Страница профиля"
            value={sub.profileWebPageUrl}
            monospace
            theme={theme}
          />
        )}
        <DetailRow
          icon="clock"
          label="Обновление профиля"
          value={formatUpdateInterval(sub.profileUpdateIntervalHours)}
          theme={theme}
        />
      </div>

      {/* Last refresh error */}
      {sub.lastRefreshError && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: 12,
            borderRadius: 14,
            background: `color-mix(in oklch, ${theme.danger} 10%, transparent)`,
            border: `1px solid color-mix(in oklch, ${theme.danger} 40%, transparent)`,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path
              d="M12 9v4M12 17h.01"
              stroke={theme.danger}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              stroke={theme.danger}
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          <div style={{ font: "400 12px/1.4 'Inter', sans-serif", color: theme.danger }}>
            {sub.lastRefreshError}
          </div>
        </div>
      )}

      {/* Delete */}
      {confirmDelete ? (
        <div
          style={{
            padding: 12,
            borderRadius: 14,
            background: theme.cardBg,
            border: `1px solid color-mix(in oklch, ${theme.danger} 45%, transparent)`,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ font: "500 14px/1.4 'Inter', sans-serif", color: theme.ink }}>
            Удалить подписку и все её серверы?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Pressable
              onClick={() => setConfirmDelete(false)}
              style={{ flex: 1, borderRadius: 10 }}
            >
              <div
                className="btn-cancel"
                style={{
                  textAlign: 'center',
                  padding: '10px',
                  borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  font: "500 13px/1 'Inter', sans-serif",
                  color: theme.mutedInk,
                }}
              >
                Отмена
              </div>
            </Pressable>
            <Pressable onClick={onDelete} style={{ flex: 1, borderRadius: 10 }}>
              <div
                className="btn-submit"
                style={{
                  textAlign: 'center',
                  padding: '10px',
                  borderRadius: 10,
                  background: theme.danger,
                  font: "500 13px/1 'Inter', sans-serif",
                  color: '#fff',
                }}
              >
                Удалить
              </div>
            </Pressable>
          </div>
        </div>
      ) : (
        <Pressable onClick={() => setConfirmDelete(true)} borderRadius={14}>
          <div
            className="delete-subscription-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '13px 12px',
              borderRadius: 14,
              border: `1px solid color-mix(in oklch, ${theme.danger} 45%, transparent)`,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 7H19M10 11V17M14 11V17M9 7L10 4H14L15 7M7 7L8 20H16L17 7"
                stroke={theme.danger}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ font: "500 14px/1.3 'Inter', sans-serif", color: theme.danger }}>
                Удалить подписку
              </div>
              <div style={{ font: "400 12px/1.3 'Inter', sans-serif", color: theme.mutedInk }}>
                Группа и её серверы будут удалены
              </div>
            </div>
          </div>
        </Pressable>
      )}
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  monospace = false,
  theme,
}: {
  icon: 'link' | 'globe' | 'clock';
  label: string;
  value: string;
  monospace?: boolean;
  theme: Theme;
}) {
  const icons: Record<string, React.ReactNode> = {
    link: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path
          d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"
          stroke={theme.mutedInk}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"
          stroke={theme.mutedInk}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
    globe: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={theme.mutedInk} strokeWidth="1.8" />
        <path
          d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"
          stroke={theme.mutedInk}
          strokeWidth="1.8"
        />
      </svg>
    ),
    clock: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={theme.mutedInk} strokeWidth="1.8" />
        <path d="M12 8v4l3 3" stroke={theme.mutedInk} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  };
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ flexShrink: 0, marginTop: 1 }}>{icons[icon]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{ font: "400 11px/1 'Inter', sans-serif", color: theme.mutedInk, marginBottom: 2 }}
        >
          {label}
        </div>
        <div
          style={{
            font: `400 12.5px/1.3 ${monospace ? "'ui-monospace', 'Cascadia Mono', monospace" : "'Inter', sans-serif"}`,
            color: theme.ink,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
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
  }, [subscriptionMenuId, drillVisible]);

  return (
    // Grid stacks both panels in the same cell: the sheet's height auto-sizes to
    // whichever panel is tallest, instead of being capped by the main list (which
    // used to clip/force-scroll the drill panel when its content was taller).
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gridTemplateRows: '1fr',
        flex: 1,
        minHeight: 0,
        overflowX: 'hidden',
        overflowY: 'auto',
      }}
    >
      {/* Main list */}
      <div
        className={drillVisible ? (drillClosing ? 'drill-in-back' : 'drill-out-forward') : ''}
        style={{
          gridColumn: 1,
          gridRow: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          gap: 0,
          // stays in-flow (display:none would zero out the sheet's auto-height, since the
          // grid cell sizing is based on the natural size of in-flow items)
          visibility: drillVisible && !drillClosing ? 'hidden' : 'visible',
          pointerEvents: drillVisible && !drillClosing ? 'none' : 'auto',
        }}
      >
        {/* Title row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <div style={{ font: "500 17px/1.2 'Source Serif 4', serif", color: theme.ink }}>
            Выбор сервера
          </div>
          {groups.some((g) => g.id !== null) && (
            <Pressable
              className="refresh-all-btn"
              onClick={props.refreshAllLoading ? undefined : props.onRefreshAll}
              borderRadius={10}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: `color-mix(in oklch, ${accent} 10%, transparent)`,
                  borderRadius: 10,
                  padding: '8px 12px',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"
                    stroke={accent}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M21 3v5h-5"
                    stroke={accent}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"
                    stroke={accent}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M3 21v-5h5"
                    stroke={accent}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div style={{ font: "500 13px/1 'Inter', sans-serif", color: accent }}>
                  Обновить
                </div>
              </div>
            </Pressable>
          )}
        </div>

        {/* Server groups list */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {groups.length === 0 && (
            <div
              style={{
                font: "400 13px/1.4 'Inter', sans-serif",
                color: theme.mutedInk,
                paddingBottom: 12,
              }}
            >
              Список пуст. Добавь VLESS-ссылку или URL подписки ниже.
            </div>
          )}

          {groups.map((group) => (
            <div
              key={group.id ?? 'manual'}
              style={{
                borderRadius: 16,
                background: theme.cardBg,
                border: `1px solid ${theme.border}`,
                overflow: 'hidden',
              }}
            >
              {/* Group header */}
              {group.id ? (
                <Pressable
                  className="sub-group-header"
                  onClick={() => props.onOpenSubscription(group.id!)}
                  borderRadius={16}
                >
                  <div
                    style={{
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      cursor: 'default',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ font: "600 15px/1.3 'Inter', sans-serif", color: theme.ink }}>
                        {group.name}
                      </div>
                      {group.announce && (
                        <div
                          style={{
                            font: "400 12px/1.4 'Inter', sans-serif",
                            color: theme.mutedInk,
                            marginTop: 2,
                          }}
                        >
                          {group.announce}
                        </div>
                      )}
                    </div>
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      style={{ flexShrink: 0, marginTop: 1 }}
                    >
                      <path
                        d="M9 6L15 12L9 18"
                        stroke={theme.mutedInk}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </Pressable>
              ) : (
                <div
                  style={{
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ font: "600 15px/1.3 'Inter', sans-serif", color: theme.ink }}>
                      {group.name}
                    </div>
                    {group.announce && (
                      <div
                        style={{
                          font: "400 12px/1.4 'Inter', sans-serif",
                          color: theme.mutedInk,
                          marginTop: 2,
                        }}
                      >
                        {group.announce}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Servers */}
              {group.servers.map((srv) => {
                const isSelected = srv.id === selectedServerId;
                return (
                  <Pressable
                    key={srv.id}
                    className="server-item"
                    onClick={() => props.onSelect(srv.id)}
                    borderRadius={14}
                    ripple={false}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        cursor: 'default',
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: isSelected ? accent : theme.mutedInk,
                          flexShrink: 0,
                        }}
                      />
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        <span
                          style={{
                            font: '500 16px/1.3 "Twemoji Country Flags", \'Inter\', sans-serif',
                            color: theme.ink,
                          }}
                        >
                          {srv.name}
                        </span>
                        {srv.latencyLabel && (
                          <span
                            style={{
                              font: "400 13px/1.3 'Inter', sans-serif",
                              color: theme.mutedInk,
                            }}
                          >
                            {' '}
                            {srv.latencyLabel}
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <svg
                          className="server-checkmark"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          style={{ flexShrink: 0 }}
                        >
                          <path
                            d="M5 13L9.5 17.5L19 7"
                            stroke={accent}
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                      {srv.isCustom && (
                        <Tooltip label="Удалить сервер" theme={theme}>
                          <div
                            className="remove-server-btn"
                            onClick={(e) => props.onRemove(srv.id, e)}
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                              <path
                                className="remove-icon"
                                d="M5 5L19 19M19 5L5 19"
                                stroke={theme.mutedInk}
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </svg>
                          </div>
                        </Tooltip>
                      )}
                    </div>
                  </Pressable>
                );
              })}
            </div>
          ))}
        </div>

        {/* Import message */}
        {props.importMessage && (
          <div
            style={{ font: "400 12px/1.3 'Inter', sans-serif", color: accent, padding: '8px 0' }}
          >
            {props.importMessage}
          </div>
        )}

        {/* Add server */}
        <div style={{ marginTop: 6 }}>
          {!props.addServerOpen ? (
            <Pressable
              className="add-server-trigger"
              onClick={props.onOpenAddServer}
              borderRadius={14}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '13px 10px',
                  borderRadius: 14,
                  border: `1.5px solid ${theme.border}`,
                  cursor: 'default',
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: theme.cardBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ font: "400 15px/1 'Inter', sans-serif", color: theme.mutedInk }}>
                    +
                  </span>
                </div>
                <span style={{ font: "500 14px/1.3 'Inter', sans-serif", color: theme.mutedInk }}>
                  Добавить VLESS или подписку
                </span>
              </div>
            </Pressable>
          ) : (
            <div
              className="add-server-panel"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 14,
                borderRadius: 14,
                background: theme.cardBg,
              }}
            >
              <div style={{ font: "500 12px/1.3 'Inter', sans-serif", color: theme.mutedInk }}>
                VLESS-ссылка или URL подписки
              </div>
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
                <div style={{ font: "400 12px/1.3 'Inter', sans-serif", color: theme.danger }}>
                  {props.addServerError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Pressable
                  onClick={props.onCancelAddServer}
                  disabled={props.addServerLoading}
                  style={{ flex: 1, borderRadius: 10 }}
                >
                  <div
                    className="btn-cancel"
                    style={{
                      textAlign: 'center',
                      padding: 10,
                      borderRadius: 10,
                      border: `1px solid ${theme.border}`,
                      font: "500 13px/1 'Inter', sans-serif",
                      color: theme.mutedInk,
                    }}
                  >
                    Отмена
                  </div>
                </Pressable>
                <Pressable
                  onClick={props.addServerLoading ? undefined : props.onSubmitAddServer}
                  style={{ flex: 1, borderRadius: 10 }}
                >
                  <div
                    className="btn-submit"
                    style={{
                      textAlign: 'center',
                      padding: 10,
                      borderRadius: 10,
                      background: `color-mix(in oklch, ${accent} 100%, transparent)`,
                      font: "500 13px/1 'Inter', sans-serif",
                      color: '#fff',
                    }}
                  >
                    Добавить
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
          style={{
            gridColumn: 1,
            gridRow: 1,
            minWidth: 0,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: theme.appBg,
          }}
        >
          <SubscriptionMenuContent
            sub={latchRef.current}
            theme={theme}
            onBack={props.onCloseSubscription}
            onDelete={() => {
              if (latchRef.current?.id) props.onDeleteSubscription(latchRef.current.id);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Settings Sheet ───────────────────────────────────────────────────────────

const ROUTING_LABELS: Record<RoutingMode, string> = {
  Full: 'Весь трафик',
  BypassLocal: 'Обход локальной сети',
  BypassRu: 'Обход РФ и локальной сети',
};
const ROUTING_SUBTITLES: Record<RoutingMode, string> = {
  Full: 'Весь трафик идёт через сервер, без исключений',
  BypassLocal: 'Локальная сеть — напрямую, остальное через VPN',
  BypassRu: 'Российские сайты и локальная сеть — напрямую',
};
const REFRESH_LABELS: Record<AutoRefreshMode, string> = {
  Auto: 'Авто',
  Off: 'Выкл',
  EveryHours: 'Каждые N часов',
};
const REFRESH_SUBTITLES: Record<AutoRefreshMode, string> = {
  Auto: 'По расписанию подписки, а если его нет — раз в сутки',
  Off: 'Обновлять только вручную',
  EveryHours: 'Один и тот же интервал для всех подписок',
};

function SettingsSheet({
  theme,
  accent,
  darkModeOn,
  routingMode,
  autoRefreshMode,
  autoRefreshHours,
  onToggleDarkMode,
  onSetRoutingMode,
  onSetAutoRefreshMode,
  onSetAutoRefreshHours,
  onOpenLogs,
}: {
  theme: Theme;
  accent: string;
  darkModeOn: boolean;
  routingMode: RoutingMode;
  autoRefreshMode: AutoRefreshMode;
  autoRefreshHours: number;
  onToggleDarkMode: () => void;
  onSetRoutingMode: (m: RoutingMode) => void;
  onSetAutoRefreshMode: (m: AutoRefreshMode) => void;
  onSetAutoRefreshHours: (h: number) => void;
  onOpenLogs: () => void;
}) {
  return (
    <div style={{ overflow: 'auto' }}>
      <div
        style={{ font: "500 17px/1.2 'Source Serif 4', serif", color: theme.ink, marginBottom: 16 }}
      >
        Настройки
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SettingsActionRow
          theme={theme}
          title="Логи"
          subtitle="Технические логи подключения"
          onClick={onOpenLogs}
        />
        <ToggleRow
          theme={theme}
          accent={accent}
          title="Тёмная тема"
          subtitle="Тёмное оформление интерфейса"
          checked={darkModeOn}
          onToggle={onToggleDarkMode}
        />
        <RoutingModeSection
          theme={theme}
          accent={accent}
          selectedMode={routingMode}
          onSelect={onSetRoutingMode}
        />
        <AutoRefreshSection
          theme={theme}
          accent={accent}
          mode={autoRefreshMode}
          hours={autoRefreshHours}
          onSetMode={onSetAutoRefreshMode}
          onSetHours={onSetAutoRefreshHours}
        />
      </div>
    </div>
  );
}

function RoutingModeSection({
  theme,
  accent,
  selectedMode,
  onSelect,
}: {
  theme: Theme;
  accent: string;
  selectedMode: RoutingMode;
  onSelect: (m: RoutingMode) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogClosing, setDialogClosing] = useState(false);
  const closeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissDialog = () => {
    if (dialogClosing) return;
    setDialogClosing(true);
    closeRef.current = setTimeout(() => {
      setDialogOpen(false);
      setDialogClosing(false);
    }, 160);
  };

  useEffect(() => {
    return () => {
      if (closeRef.current) clearTimeout(closeRef.current);
    };
  }, []);

  return (
    <>
      <SettingsActionRow
        theme={theme}
        title="Маршрутизация"
        subtitle={ROUTING_LABELS[selectedMode]}
        onClick={() => {
          setDialogOpen(true);
          setDialogClosing(false);
        }}
      />
      {dialogOpen && (
        <SettingsPickerDialog
          theme={theme}
          title="Маршрутизация"
          isClosing={dialogClosing}
          onDismiss={dismissDialog}
        >
          {(['Full', 'BypassLocal', 'BypassRu'] as RoutingMode[]).map((mode) => (
            <SettingsChoiceRow
              key={mode}
              theme={theme}
              accent={accent}
              title={ROUTING_LABELS[mode]}
              subtitle={ROUTING_SUBTITLES[mode]}
              selected={selectedMode === mode}
              onClick={() => {
                onSelect(mode);
                dismissDialog();
              }}
            />
          ))}
        </SettingsPickerDialog>
      )}
    </>
  );
}

function AutoRefreshSection({
  theme,
  accent,
  mode,
  hours,
  onSetMode,
  onSetHours,
}: {
  theme: Theme;
  accent: string;
  mode: AutoRefreshMode;
  hours: number;
  onSetMode: (m: AutoRefreshMode) => void;
  onSetHours: (h: number) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogClosing, setDialogClosing] = useState(false);
  const [hoursText, setHoursText] = useState(hours.toString());
  const closeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissDialog = () => {
    if (dialogClosing) return;
    setDialogClosing(true);
    closeRef.current = setTimeout(() => {
      setDialogOpen(false);
      setDialogClosing(false);
    }, 160);
  };

  useEffect(() => {
    setHoursText(hours.toString());
  }, [hours]);
  useEffect(() => {
    return () => {
      if (closeRef.current) clearTimeout(closeRef.current);
    };
  }, []);

  const subtitle = mode === 'EveryHours' ? `Каждые ${hours} ч` : REFRESH_LABELS[mode];

  return (
    <>
      <SettingsActionRow
        theme={theme}
        title="Обновление подписок"
        subtitle={subtitle}
        onClick={() => {
          setDialogOpen(true);
          setDialogClosing(false);
        }}
      />
      {dialogOpen && (
        <SettingsPickerDialog
          theme={theme}
          title="Обновление подписок"
          isClosing={dialogClosing}
          onDismiss={dismissDialog}
        >
          {(['Auto', 'Off', 'EveryHours'] as AutoRefreshMode[]).map((m) => (
            <SettingsChoiceRow
              key={m}
              theme={theme}
              accent={accent}
              title={REFRESH_LABELS[m]}
              subtitle={REFRESH_SUBTITLES[m]}
              selected={mode === m}
              onClick={() => {
                onSetMode(m);
                if (m !== 'EveryHours') dismissDialog();
              }}
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

function SettingsPickerDialog({
  theme,
  title,
  isClosing,
  onDismiss,
  children,
}: {
  theme: Theme;
  title: string;
  isClosing: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return createPortal(
    <>
      <div
        onClick={onDismiss}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          zIndex: 100,
          animation: `${isClosing ? 'backdropOut' : 'backdropIn'} 0.2s cubic-bezier(0.4,0,0.2,1) both`,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          width: 'min(400px, calc(100vw - 64px))',
          zIndex: 101,
          animation: `${isClosing ? 'dialogOut' : 'dialogIn'} ${isClosing ? '0.16s' : '0.22s'} cubic-bezier(0.4,0,0.2,1) both`,
          boxSizing: 'border-box',
          borderRadius: 22,
          background: theme.appBg,
          border: `1px solid ${theme.border}`,
          padding: '4px 16px',
          ...themeVars(theme),
        }}
      >
        <div
          style={{
            font: "500 17px/1.2 'Source Serif 4', serif",
            color: theme.ink,
            padding: '18px 0 13px',
          }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
        <div style={{ height: 14 }} />
      </div>
    </>,
    document.body,
  );
}

function SettingsChoiceRow({
  theme,
  accent,
  title,
  subtitle,
  selected,
  onClick,
}: {
  theme: Theme;
  accent: string;
  title: string;
  subtitle: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Pressable className="settings-choice-row" onClick={onClick} borderRadius={14}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 14px',
        }}
      >
        <div>
          <div style={{ font: "500 14.5px/1.3 'Inter', sans-serif", color: theme.ink }}>
            {title}
          </div>
          <div style={{ font: "400 12px/1.3 'Inter', sans-serif", color: theme.mutedInk }}>
            {subtitle}
          </div>
        </div>
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            border: `1.5px solid ${selected ? accent : theme.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 4,
            boxSizing: 'border-box',
            flexShrink: 0,
          }}
        >
          {selected && (
            <div
              style={{ width: '100%', height: '100%', borderRadius: '50%', background: accent }}
            />
          )}
        </div>
      </div>
    </Pressable>
  );
}

function SettingsActionRow({
  theme,
  title,
  subtitle,
  onClick,
}: {
  theme: Theme;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <Pressable className="settings-row" onClick={onClick} borderRadius={14}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '13px 14px',
        }}
      >
        <div>
          <div style={{ font: "500 14.5px/1.3 'Inter', sans-serif", color: theme.ink }}>
            {title}
          </div>
          <div style={{ font: "400 12px/1.3 'Inter', sans-serif", color: theme.mutedInk }}>
            {subtitle}
          </div>
        </div>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path
            d="M9 6L15 12L9 18"
            stroke={theme.mutedInk}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </Pressable>
  );
}

function ToggleRow({
  theme,
  accent,
  title,
  subtitle,
  checked,
  onToggle,
}: {
  theme: Theme;
  accent: string;
  title: string;
  subtitle: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable className="settings-row" onClick={onToggle} borderRadius={14}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '13px 14px',
        }}
      >
        <div>
          <div style={{ font: "500 14.5px/1.3 'Inter', sans-serif", color: theme.ink }}>
            {title}
          </div>
          <div style={{ font: "400 12px/1.3 'Inter', sans-serif", color: theme.mutedInk }}>
            {subtitle}
          </div>
        </div>
        <MiniSwitch checked={checked} accent={accent} theme={theme} onToggle={onToggle} />
      </div>
    </Pressable>
  );
}

// ─── Draggable bottom sheet ───────────────────────────────────────────────────
// Lets a bottom sheet be dragged down (from its handle) to dismiss it, snapping
// back if released before the close threshold.
function useSheetDrag(onClose: () => void) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ active: false, startY: 0, startOffset: 0, offset: 0 });

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startY: e.clientY,
      startOffset: dragRef.current.offset,
      offset: dragRef.current.offset,
    };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const next = Math.max(0, dragRef.current.startOffset + (e.clientY - dragRef.current.startY));
    dragRef.current.offset = next;
    setOffset(next);
  };
  const endDrag = () => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    const finalOffset = dragRef.current.offset;
    dragRef.current.offset = 0;
    setDragging(false);
    setOffset(0);
    if (finalOffset > 110) onClose();
  };

  return {
    offset,
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export function App() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [isBusy, setIsBusy] = useState(false);
  const [appError, setAppError] = useState('');

  const [servers, setServers] = useState<ServerDto[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionDto[]>([]);
  const [pingMap, setPingMap] = useState<Record<string, number | null>>({});
  const [selectedServerId, setSelectedServerId] = useState('');
  const { phase, setPhase, elapsed, applyStatus } = useConnectionStatus(
    setSelectedServerId,
    setAppError,
  );

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
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [darkModeOn, setDarkModeOn] = useState(true);
  const [routingMode, setRoutingMode] = useState<RoutingMode>('BypassRu');
  const [autoRefreshMode, setAutoRefreshMode] = useState<AutoRefreshMode>('Auto');
  const [autoRefreshHours, setAutoRefreshHours] = useState(24);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const menuCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [serverList, subList, status, settings] = await Promise.all([
          commands.listServers(),
          commands.listSubscriptions(),
          commands.connectionStatus(),
          commands.getSettings(),
        ]);
        if (cancelled) return;

        setServers(serverList);
        setSubscriptions(subList);
        applyStatus(status);
        setSelectedServerId((current) => {
          if (status.server_id && serverList.some((s) => s.id === status.server_id))
            return status.server_id!;
          if (current && serverList.some((s) => s.id === current)) return current;
          return serverList[0]?.id ?? '';
        });
        setAppError(status.state === 'error' ? (status.message ?? 'Ошибка соединения') : '');

        // Settings
        const modeMap: Record<string, AutoRefreshMode> = {
          auto: 'Auto',
          off: 'Off',
          every_hours: 'EveryHours',
        };
        setAutoRefreshMode(modeMap[settings.auto_refresh_mode] ?? 'Auto');
        setAutoRefreshHours(settings.auto_refresh_hours);

        // Dark mode from localStorage
        const saved = localStorage.getItem('karst-dark-mode');
        if (saved !== null) setDarkModeOn(saved === 'true');
        const savedRouting = localStorage.getItem('karst-routing-mode');
        if (savedRouting && isRoutingMode(savedRouting)) setRoutingMode(savedRouting);
      } catch (err) {
        if (!cancelled) setAppError(getErrorMessage(err));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [applyStatus]);

  useEffect(
    () => () => {
      if (menuCloseTimeoutRef.current) clearTimeout(menuCloseTimeoutRef.current);
      if (settingsCloseTimeoutRef.current) clearTimeout(settingsCloseTimeoutRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    },
    [],
  );

  // ── Sync titlebar theme with app dark mode ────────────────────────────────────
  useEffect(() => {
    getCurrentWindow().setTheme(darkModeOn ? 'dark' : 'light');
  }, [darkModeOn]);

  // ── Ping ───────────────────────────────────────────────────────────────────
  // Re-runs whenever the server list changes, so it also refreshes on "Обновить".
  useEffect(() => {
    if (servers.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const results = await commands.pingServers();
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
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const isConnecting = phase === 'connecting' || (isBusy && phase === 'off');
  const isConnected = phase === 'on';
  const theme = darkModeOn ? DARK_THEME : LIGHT_THEME;

  const groups = useMemo(
    () =>
      buildGroups(servers, subscriptions).map((group) => ({
        ...group,
        servers: group.servers.map((server) => ({
          ...server,
          latencyLabel: formatPingLabel(pingMap[server.id]),
        })),
      })),
    [servers, subscriptions, pingMap],
  );
  const allServers = groups.flatMap((g) => g.servers);
  const selectedServer = allServers.find((s) => s.id === selectedServerId) ?? allServers[0] ?? null;

  const statusLabel = isConnected ? 'Подключено' : isConnecting ? 'Подключаемся…' : 'Не подключено';
  const subLabel =
    appError ||
    (servers.length === 0
      ? 'Добавь VLESS-ссылку или подписку'
      : isConnecting
        ? mood.subConnecting
        : mood.subOff);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const onTapButton = async () => {
    if (isBusy || phase === 'connecting') return;
    if (phase === 'off') {
      if (!selectedServerId) {
        setAppError('Добавь VLESS-сервер перед подключением');
        return;
      }
      setIsBusy(true);
      setAppError('');
      setPhase('connecting');
      try {
        const status = await commands.connect(selectedServerId);
        applyStatus(status);
      } catch (err) {
        setPhase('off');
        setAppError(getErrorMessage(err));
      } finally {
        setIsBusy(false);
      }
    } else if (phase === 'on') {
      setIsBusy(true);
      setAppError('');
      setPhase('off');
      try {
        const status = await commands.disconnect();
        applyStatus(status);
      } catch (err) {
        setPhase('on');
        setAppError(getErrorMessage(err));
      } finally {
        setIsBusy(false);
      }
    }
  };

  const onOpenServerMenu = () => {
    if (menuVisible) return;
    setMenuVisible(true);
    setMenuClosing(false);
  };

  const onCloseServerMenu = useCallback(() => {
    if (!menuVisible || menuClosing) return;
    setMenuClosing(true);
    if (menuCloseTimeoutRef.current) clearTimeout(menuCloseTimeoutRef.current);
    menuCloseTimeoutRef.current = setTimeout(() => {
      setMenuVisible(false);
      setMenuClosing(false);
      setSubscriptionMenuId(null);
    }, 320);
  }, [menuVisible, menuClosing]);

  const onSelectServer = (id: string) => {
    setSelectedServerId(id);
    onCloseServerMenu();
  };

  const onRemoveServer = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBusy) return;
    setIsBusy(true);
    setAppError('');
    try {
      await commands.deleteServer(id);
      const next = servers.filter((s) => s.id !== id);
      setServers(next);
      setSelectedServerId((c) => (c === id ? (next[0]?.id ?? '') : c));
    } catch (err) {
      setAppError(getErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  };

  const onDeleteSubscription = async (id: string) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await commands.deleteSubscription(id);
      const [serverList, subList] = await Promise.all([
        commands.listServers(),
        commands.listSubscriptions(),
      ]);
      setServers(serverList);
      setSubscriptions(subList);
      setSubscriptionMenuId(null);
      onCloseServerMenu();
    } catch (err) {
      setAppError(getErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  };

  const onOpenAddServer = () => {
    setAddServerOpen(true);
    setAddServerError('');
    setImportMessage('');
  };
  const closeAddServerForm = () => {
    setAddServerOpen(false);
    setAddServerValue('');
    setAddServerError('');
  };
  const onCancelAddServer = () => closeAddServerForm();

  const onSubmitAddServer = async () => {
    const value = addServerValue.trim();
    if (!value) {
      setAddServerError('Вставь vless:// ссылку или https:// подписку');
      return;
    }
    if (value.toLowerCase().startsWith('http://')) {
      setAddServerError('Подписка должна использовать HTTPS');
      return;
    }
    setAddServerLoading(true);
    setAddServerError('');
    try {
      if (value.toLowerCase().startsWith('https://')) {
        const summary = await commands.addSubscription(value);
        if (summary.error) {
          setAddServerError(summary.error);
          return;
        }
        const [serverList, subList] = await Promise.all([
          commands.listServers(),
          commands.listSubscriptions(),
        ]);
        setServers(serverList);
        setSubscriptions(subList);
        const importedServer = serverList.find(
          (s) => s.subscription_id === summary.subscription_id,
        );
        setSelectedServerId(importedServer?.id ?? serverList[0]?.id ?? '');
        setImportMessage(`Импортировано ${summary.imported} сервер(ов)`);
      } else {
        const srv = await commands.addManualLink(value);
        setServers((prev) => [srv, ...prev.filter((s) => s.id !== srv.id)]);
        setSelectedServerId(srv.id);
      }
      setAppError('');
      closeAddServerForm();
    } catch (err) {
      setAddServerError(getErrorMessage(err));
    } finally {
      setAddServerLoading(false);
    }
  };

  const onRefreshAll = async () => {
    if (refreshAllLoading) return;
    setRefreshAllLoading(true);
    try {
      await commands.refreshAllSubscriptions();
      const [serverList, subList] = await Promise.all([
        commands.listServers(),
        commands.listSubscriptions(),
      ]);
      setServers(serverList);
      setSubscriptions(subList);
      // A subscription refresh replaces its servers with freshly parsed rows, whose ids
      // are derived from the raw VLESS link — if the provider rotates link params, the
      // previously selected server's id no longer exists. Re-resolve it by host/port so
      // the selection (and its checkmark) survives a refresh.
      setSelectedServerId((current) => {
        if (serverList.some((s) => s.id === current)) return current;
        const prev = servers.find((s) => s.id === current);
        if (!prev) return current;
        const match = serverList.find(
          (s) =>
            s.subscription_id === prev.subscription_id &&
            s.host === prev.host &&
            s.port === prev.port,
        );
        return match?.id ?? current;
      });
    } catch (err) {
      setAppError(getErrorMessage(err));
    } finally {
      setRefreshAllLoading(false);
    }
  };

  const onOpenSettings = () => {
    if (settingsVisible) return;
    setSettingsVisible(true);
    setSettingsClosing(false);
  };
  const onCloseSettings = () => {
    if (!settingsVisible || settingsClosing) return;
    setSettingsClosing(true);
    if (settingsCloseTimeoutRef.current) clearTimeout(settingsCloseTimeoutRef.current);
    settingsCloseTimeoutRef.current = setTimeout(() => {
      setSettingsVisible(false);
      setSettingsClosing(false);
    }, 320);
  };

  const [themeBusy, setThemeBusy] = useState(false);

  const onToggleDarkMode = () => {
    setThemeBusy(true);
    setDarkModeOn((prev) => {
      const next = !prev;
      localStorage.setItem('karst-dark-mode', String(next));
      return next;
    });
    requestAnimationFrame(() => setThemeBusy(false));
  };

  const handleSetRoutingMode = (m: RoutingMode) => {
    setRoutingMode(m);
    localStorage.setItem('karst-routing-mode', m);
  };

  const handleSetAutoRefreshMode = async (m: AutoRefreshMode) => {
    const modeStr = m === 'Auto' ? 'auto' : m === 'Off' ? 'off' : 'every_hours';
    try {
      await commands.setAutoRefreshSettings(modeStr, null);
      setAutoRefreshMode(m);
      setAppError('');
    } catch (error) {
      setAppError(getErrorMessage(error));
    }
  };

  const handleSetAutoRefreshHours = async (h: number) => {
    try {
      await commands.setAutoRefreshSettings('every_hours', h);
      setAutoRefreshHours(h);
      setAutoRefreshMode('EveryHours');
      setAppError('');
    } catch (error) {
      setAppError(getErrorMessage(error));
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    setLogsError('');
    try {
      setLogs(await commands.listLogs());
    } catch (err) {
      setLogsError(getErrorMessage(err));
    } finally {
      setLogsLoading(false);
    }
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
    setLogsLoading(true);
    setLogsError('');
    try {
      await commands.clearLogs();
      setLogs([]);
      showToast('Логи очищены');
    } catch (err) {
      setLogsError(getErrorMessage(err));
    } finally {
      setLogsLoading(false);
    }
  };

  const onCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs.map((e) => `[${e.source}] ${e.message}`).join('\n'));
      showToast('Логи скопированы');
    } catch (err) {
      setLogsError(getErrorMessage(err));
    }
  };

  const onBackToMain = () => {
    setScreenDir('back');
    setAppScreen('main');
  };

  // ── Sheet animations ────────────────────────────────────────────────────────
  const menuAnim = `${menuClosing ? 'menuSlideDown' : 'menuSlideUp'} 0.26s cubic-bezier(0.4,0,0.2,1) both`;
  const backdropAnim = `${menuClosing ? 'backdropOut' : 'backdropIn'} 0.22s cubic-bezier(0.4,0,0.2,1) both`;
  const settingsAnim = `${settingsClosing ? 'menuSlideDown' : 'menuSlideUp'} 0.26s cubic-bezier(0.4,0,0.2,1) both`;
  const settingsBackdropAnim = `${settingsClosing ? 'backdropOut' : 'backdropIn'} 0.32s cubic-bezier(0.4,0,0.2,1) both`;

  const menuDrag = useSheetDrag(onCloseServerMenu);
  const settingsDrag = useSheetDrag(onCloseSettings);
  const sheetDragTransition = (dragging: boolean) =>
    dragging ? 'none' : 'translate 0.25s cubic-bezier(0.4,0,0.2,1)';

  // ── Render ──────────────────────────────────────────────────────────────────

  const renderDragHandle = (
    drag: ReturnType<typeof useSheetDrag>,
  ) => (
    <div
      {...drag.handlers}
      style={{
        padding: '10px 0 12px',
        display: 'flex',
        justifyContent: 'center',
        cursor: drag.dragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
    >
      <div
        style={{
          width: 36,
          height: 4,
          borderRadius: 2,
          background: theme.border,
        }}
      />
    </div>
  );

  return (
    /* Root: fills the entire window, provides the theme background */
    <div
      className={themeBusy ? 'no-transitions' : ''}
      style={{
        width: '100%',
        height: '100%',
        background: theme.appBg,
        position: 'relative',
        overflow: 'hidden',
        ...themeVars(theme),
      }}
    >
      {/* ── Main screen ───────────────────────────────────────────── */}
      <div
        className={
          appScreen === 'main' && screenDir === 'back'
            ? 'route-enter-from-left'
            : appScreen === 'main'
              ? ''
              : 'route-exit-to-left'
        }
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          padding: '8px 28px 36px',
          background: theme.appBg,
          position: 'absolute',
          top: 0,
          left: 0,
          overflow: 'hidden',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          pointerEvents: appScreen !== 'main' ? 'none' : undefined,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingTop: 18,
            paddingBottom: 0,
          }}
        >
          <Tooltip label="Настройки" theme={theme} placement="bottom">
            <Pressable
              onClick={onOpenSettings}
              className="settings-btn"
              ripple={false}
              style={{
                width: 46,
                height: 46,
                borderRadius: '50%',
                background: theme.cardBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 15.5C13.933 15.5 15.5 13.933 15.5 12C15.5 10.067 13.933 8.5 12 8.5C10.067 8.5 8.5 10.067 8.5 12C8.5 13.933 10.067 15.5 12 15.5Z"
                  stroke={theme.mutedInk}
                  strokeWidth="1.8"
                />
                <path
                  d="M19.4 13.5C19.46 13.01 19.5 12.51 19.5 12C19.5 11.49 19.46 10.99 19.4 10.5L21.34 8.97C21.53 8.82 21.58 8.55 21.46 8.34L19.74 5.36C19.62 5.15 19.36 5.07 19.14 5.15L16.87 6.06C16.18 5.53 15.42 5.11 14.6 4.82L14.25 2.42C14.21 2.18 14.01 2 13.77 2H10.33C10.09 2 9.89 2.18 9.85 2.42L9.5 4.82C8.68 5.11 7.92 5.54 7.23 6.06L4.96 5.15C4.74 5.07 4.48 5.15 4.36 5.36L2.64 8.34C2.52 8.55 2.57 8.82 2.76 8.97L4.7 10.5C4.64 10.99 4.6 11.5 4.6 12C4.6 12.5 4.64 13.01 4.7 13.5L2.76 15.03C2.57 15.18 2.52 15.45 2.64 15.66L4.36 18.64C4.48 18.85 4.74 18.93 4.96 18.85L7.23 17.94C7.92 18.47 8.68 18.89 9.5 19.18L9.85 21.58C9.89 21.82 10.09 22 10.33 22H13.77C14.01 22 14.21 21.82 14.25 21.58L14.6 19.18C15.42 18.89 16.18 18.46 16.87 17.94L19.14 18.85C19.36 18.93 19.62 18.85 19.74 18.64L21.46 15.66C21.58 15.45 21.53 15.18 21.34 15.03L19.4 13.5Z"
                  stroke={theme.mutedInk}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </Pressable>
          </Tooltip>
        </div>

        {/* Center Stage */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 28,
          }}
        >
          <ConnectButton
            phase={isConnecting ? 'connecting' : phase}
            enabled={selectedServer !== null || isConnected}
            theme={theme}
            accent={ACCENT}
            onClick={() => void onTapButton()}
          />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              minHeight: 78,
            }}
          >
            <div style={{ font: "500 24px/1.15 'Source Serif 4', serif", color: theme.ink }}>
              {statusLabel}
            </div>
            {isConnected ? (
              <div
                style={{
                  font: "500 14px/1 'Inter', sans-serif",
                  color: theme.mutedInk,
                  letterSpacing: '0.3px',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatElapsed(elapsed)}
              </div>
            ) : (
              <div
                style={{
                  font: "400 14px/1.4 'Inter', sans-serif",
                  color: appError ? theme.danger : theme.mutedInk,
                  maxWidth: 250,
                  textAlign: 'center',
                }}
              >
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
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.45)',
                animation: backdropAnim,
                zIndex: 5,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                maxHeight: '82%',
                display: 'flex',
                flexDirection: 'column',
                background: theme.appBg,
                borderRadius: '22px 22px 0 0',
                boxShadow: '0 -18px 40px -16px rgba(0,0,0,0.4)',
                padding: '0 22px 28px',
                boxSizing: 'border-box',
                zIndex: 6,
                animation: menuAnim,
                overflow: 'hidden',
                translate: `0 ${menuDrag.offset}px`,
                transition: sheetDragTransition(menuDrag.dragging),
              }}
            >
              {renderDragHandle(menuDrag)}
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
                onChangeAddServerValue={(v) => {
                  setAddServerValue(v);
                  setAddServerError('');
                }}
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
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.45)',
                animation: settingsBackdropAnim,
                zIndex: 5,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                maxHeight: '78%',
                display: 'flex',
                flexDirection: 'column',
                background: theme.appBg,
                borderRadius: '22px 22px 0 0',
                boxShadow: '0 -18px 40px -16px rgba(0,0,0,0.4)',
                padding: '0 22px 28px',
                boxSizing: 'border-box',
                zIndex: 6,
                animation: settingsAnim,
                overflow: 'hidden',
                translate: `0 ${settingsDrag.offset}px`,
                transition: sheetDragTransition(settingsDrag.dragging),
              }}
            >
              {renderDragHandle(settingsDrag)}
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
      </div>
      {/* end main screen */}

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

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      {toastMessage &&
        createPortal(
          <div
            className={`toast ${toastClosing ? 'toast-out' : 'toast-in'} ${darkModeOn ? 'toast-dark' : ''}`}
          >
            {toastMessage}
          </div>,
          document.body,
        )}
    </div>
  );
}
