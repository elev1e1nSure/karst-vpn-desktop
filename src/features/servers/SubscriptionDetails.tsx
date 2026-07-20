import { useState } from 'react';
import type { ReactNode } from 'react';
import type { UiSubscription } from '../../app/models';
import { formatUpdateInterval } from '../../app/presentation';
import { Pressable } from '../../ui/Pressable';
import { Tooltip } from '../../ui/Tooltip';
import type { Theme } from '../../ui/theme';

type SubscriptionDetailsProps = {
  subscription: UiSubscription;
  theme: Theme;
  onBack: () => void;
  onDelete: () => void;
};

export function SubscriptionDetails({
  subscription,
  theme,
  onBack,
  onDelete,
}: SubscriptionDetailsProps) {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Tooltip label="Назад" theme={theme} placement="bottom">
          <Pressable onClick={onBack}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
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
              font: "500 20px/1.2 'Source Serif 4', serif",
              color: theme.ink,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subscription.name}
          </div>
          <div style={{ font: "400 13.5px/1 'Inter', sans-serif", color: theme.mutedInk }}>
            {subscription.servers.length} серверов
          </div>
        </div>
      </div>

      {subscription.announce && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            padding: '16px 20px',
            borderRadius: 16,
            background: theme.sheetCardBg,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9" stroke={theme.mutedInk} strokeWidth="1.8" />
            <path
              d="M12 8v4M12 16h.01"
              stroke={theme.mutedInk}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <div style={{ font: "400 13.5px/1.45 'Inter', sans-serif", color: theme.mutedInk }}>
            {subscription.announce}
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          padding: '18px 20px',
          borderRadius: 16,
          background: theme.sheetCardBg,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M22 12H2M22 12L18 8M22 12L18 16M2 12L6 8M2 12L6 16"
              stroke={theme.mutedInk}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div style={{ font: "500 15px/1 'Inter', sans-serif", color: theme.ink, flex: 1 }}>
            Трафик
          </div>
          <div style={{ font: "400 15px/1 'Inter', sans-serif", color: theme.mutedInk }}>
            {subscription.trafficLabel}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
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
          <div style={{ font: "500 15px/1 'Inter', sans-serif", color: theme.ink, flex: 1 }}>
            Истекает
          </div>
          <div style={{ font: "400 15px/1 'Inter', sans-serif", color: theme.mutedInk }}>
            {subscription.expiresLabel}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          padding: '18px 20px',
          borderRadius: 16,
          background: theme.sheetCardBg,
        }}
      >
        <DetailRow
          icon="link"
          label="Ссылка"
          value={subscription.url ?? 'Не указана'}
          theme={theme}
        />
        {subscription.profileWebPageUrl && subscription.profileWebPageUrl !== subscription.url && (
          <DetailRow
            icon="globe"
            label="Страница профиля"
            value={subscription.profileWebPageUrl}
            theme={theme}
          />
        )}
        <DetailRow
          icon="clock"
          label="Обновление профиля"
          value={formatUpdateInterval(subscription.profileUpdateIntervalHours)}
          theme={theme}
        />
      </div>

      {subscription.lastRefreshError && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            padding: '16px 20px',
            borderRadius: 16,
            background: `color-mix(in oklch, ${theme.danger} 15%, ${theme.appBg})`,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
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
          <div style={{ font: "400 13.5px/1.45 'Inter', sans-serif", color: theme.danger }}>
            {subscription.lastRefreshError}
          </div>
        </div>
      )}

      {confirmDelete ? (
        <div
          style={{
            padding: 12,
            borderRadius: 14,
            background: `color-mix(in oklch, ${theme.danger} 12%, ${theme.appBg})`,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ font: "500 15.5px/1.4 'Inter', sans-serif", color: theme.ink }}>
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
                  background: theme.inputBg,
                  font: "500 14px/1 'Inter', sans-serif",
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
                  font: "500 14px/1 'Inter', sans-serif",
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
              gap: 12,
              padding: '15px 14px',
              borderRadius: 14,
              background: `color-mix(in oklch, ${theme.danger} 10%, ${theme.appBg})`,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 7H19M10 11V17M14 11V17M9 7L10 4H14L15 7M7 7L8 20H16L17 7"
                stroke={theme.danger}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ font: "500 16px/1.3 'Inter', sans-serif", color: theme.danger }}>
                Удалить подписку
              </div>
              <div style={{ font: "400 13px/1.35 'Inter', sans-serif", color: theme.mutedInk }}>
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
  theme,
}: {
  icon: 'link' | 'globe' | 'clock';
  label: string;
  value: string;
  theme: Theme;
}) {
  const icons: Record<string, ReactNode> = {
    link: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
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
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={theme.mutedInk} strokeWidth="1.8" />
        <path
          d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"
          stroke={theme.mutedInk}
          strokeWidth="1.8"
        />
      </svg>
    ),
    clock: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={theme.mutedInk} strokeWidth="1.8" />
        <path d="M12 8v4l3 3" stroke={theme.mutedInk} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  };

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ flexShrink: 0, marginTop: 1 }}>{icons[icon]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            font: "400 13px/1 'Inter', sans-serif",
            color: theme.mutedInk,
            marginBottom: 4,
          }}
        >
          {label}
        </div>
        <div
          style={{
            font: "400 15px/1.4 'Inter', sans-serif",
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
