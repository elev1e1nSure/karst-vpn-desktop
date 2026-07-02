import type { LogEntryDto } from '../app/types';
import type { ReactNode } from 'react';
import { Pressable } from './Pressable';
import { themeVars } from './theme';
import type { Theme } from './theme';
import { Tooltip } from './Tooltip';

export function LogsScreen({
  theme,
  accent,
  logs,
  logsLoading,
  logsError,
  onBack,
  onClear,
  onCopy,
}: {
  theme: Theme;
  accent: string;
  logs: LogEntryDto[];
  logsLoading: boolean;
  logsError: string;
  onBack: () => void;
  onClear: () => void;
  onCopy: () => void;
}) {
  const actionsDisabled = logs.length === 0 || logsLoading;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: theme.appBg,
        ...themeVars(theme),
        boxSizing: 'border-box',
        padding: '18px 18px 20px',
        overflow: 'hidden',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10, flexShrink: 0 }}
      >
        <Pressable onClick={onBack} borderRadius={10}>
          <div
            className="log-header-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 14px 10px 10px',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M19 12H5M5 12L12 19M5 12L12 5"
                stroke={theme.ink}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div style={{ font: "500 14px/1 'Inter', sans-serif", color: theme.ink }}>Назад</div>
          </div>
        </Pressable>
        <div style={{ flex: 1 }} />
        <LogActionButton
          theme={theme}
          label="Копировать логи"
          disabled={actionsDisabled}
          onClick={onCopy}
          icon={
            <>
              <rect x="9" y="9" width="10" height="10" rx="2" stroke={theme.ink} strokeWidth="2" />
              <path
                d="M15 9V7C15 5.9 14.1 5 13 5H7C5.9 5 5 5.9 5 7V13C5 14.1 5.9 15 7 15H9"
                stroke={theme.ink}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </>
          }
        />
        <div style={{ width: 6, flexShrink: 0 }} />
        <LogActionButton
          theme={theme}
          label="Очистить логи"
          disabled={actionsDisabled}
          onClick={onClear}
          icon={
            <path
              d="M5 7H19M10 11V17M14 11V17M9 7L10 4H14L15 7M7 7L8 20H16L17 7"
              stroke={theme.ink}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
        />
      </div>
      <div style={{ height: 1, background: theme.border, marginBottom: 12, flexShrink: 0 }} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        {logsLoading && logs.length === 0 ? (
          <span style={{ color: theme.mutedInk, font: "400 12px/1.5 'Inter', sans-serif" }}>
            Загрузка…
          </span>
        ) : logsError ? (
          <span style={{ color: theme.danger, font: "400 12px/1.5 'Inter', sans-serif" }}>
            {logsError}
          </span>
        ) : logs.length === 0 ? (
          <EmptyLogs theme={theme} />
        ) : (
          logs.map((entry, index) => (
            <div
              key={`${entry.source}-${index}`}
              style={{
                font: "400 12px/1.45 'Inter', sans-serif",
                color: theme.ink,
                overflowWrap: 'anywhere',
                whiteSpace: 'pre-wrap',
                paddingBottom: 2,
              }}
            >
              <span style={{ color: accent }}>[{entry.source}]</span> {entry.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LogActionButton({
  theme,
  label,
  disabled,
  onClick,
  icon,
}: {
  theme: Theme;
  label: string;
  disabled: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <Tooltip label={label} theme={theme} placement="bottom" disabled={disabled}>
      <Pressable
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        style={{ borderRadius: 10 }}
      >
        <div
          className="log-header-btn"
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            {icon}
          </svg>
        </div>
      </Pressable>
    </Tooltip>
  );
}

function EmptyLogs({ theme }: { theme: Theme }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 10,
      }}
    >
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={theme.mutedInk} strokeWidth="1.4" opacity="0.5" />
        <path
          d="M12 8v4M12 16h.01"
          stroke={theme.mutedInk}
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>
      <div style={{ font: "500 18px/1.2 'Source Serif 4', serif", color: theme.mutedInk }}>
        Логов пока нет
      </div>
    </div>
  );
}
