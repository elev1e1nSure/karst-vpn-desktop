import { Pressable } from '../../ui/Pressable';
import type { UiServer } from '../../app/models';
import type { Phase } from '../../app/types';
import { mood } from '../../app/presentation';
import type { Theme } from '../../ui/theme';

export function ConnectButton({
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
  const isDisconnecting = phase === 'disconnecting';
  const isTransitioning = isConnecting || isDisconnecting;
  const isConnected = phase === 'on';

  const buttonBg = isConnected ? accent : theme.buttonOffBg;
  const borderColor = isConnected ? accent : isTransitioning ? accent : theme.buttonOffBorder;
  const iconColor = isConnected ? '#fff' : isTransitioning ? accent : theme.buttonOffIcon;

  const ringClass = isConnected
    ? 'pulse-ring-connected'
    : isTransitioning
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
        onClick={enabled && !isTransitioning ? onClick : undefined}
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
        {isTransitioning ? (
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

export function LocationChip({
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
