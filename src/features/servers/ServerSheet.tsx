import React, { useEffect, useRef, useState } from 'react';
import { formatUpdateInterval } from '../../app/presentation';
import type { UiSubscription } from '../../app/models';
import { Pressable } from '../../ui/Pressable';
import { Tooltip } from '../../ui/Tooltip';
import type { Theme } from '../../ui/theme';

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

export function ServerSheet(props: ServerSheetProps) {
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
                flexShrink: 0,
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
