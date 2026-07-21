import { useMemo, useState } from 'react';
import type { LogEntryDto } from '../app/types';
import type { ReactNode } from 'react';
import { Pressable } from './Pressable';
import { themeVars } from './theme';
import type { Theme } from './theme';
import { Tooltip } from './Tooltip';

type LogGroup = 'app' | 'sing-box' | 'xray';

const GROUP_LABELS: Record<LogGroup, string> = {
  app: 'Приложение',
  'sing-box': 'sing-box',
  xray: 'Xray',
};

// Rotated files arrive as "<source>.1"; both halves belong to the same group.
function groupOf(source: string): LogGroup {
  const base = source.replace(/\.1$/, '');
  return base === 'sing-box' || base === 'xray' ? base : 'app';
}

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
  onBack?: () => void;
  onClear: () => void;
  onCopy: () => void;
}) {
  const [group, setGroup] = useState<LogGroup | 'all'>('all');

  const available = useMemo(() => {
    const seen = new Set<LogGroup>();
    for (const entry of logs) seen.add(groupOf(entry.source));
    return (['app', 'sing-box', 'xray'] as LogGroup[]).filter((item) => seen.has(item));
  }, [logs]);

  // A group vanishes once its file rotates away; fall back rather than showing an empty list.
  const activeGroup = group !== 'all' && !available.includes(group) ? 'all' : group;
  const visibleLogs = useMemo(
    () =>
      activeGroup === 'all' ? logs : logs.filter((entry) => groupOf(entry.source) === activeGroup),
    [logs, activeGroup],
  );

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
        padding: '22px 26px 24px',
        overflow: 'hidden',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10, flexShrink: 0 }}
      >
        {onBack && (
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
        )}
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
        <div style={{ width: 8, flexShrink: 0 }} />
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
      {available.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexShrink: 0 }}>
          {(['all', ...available] as (LogGroup | 'all')[]).map((item) => (
            <FilterChip
              key={item}
              theme={theme}
              accent={accent}
              label={item === 'all' ? 'Все' : GROUP_LABELS[item]}
              selected={activeGroup === item}
              onClick={() => setGroup(item)}
            />
          ))}
        </div>
      )}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {logsLoading && logs.length === 0 ? (
          <span style={{ color: theme.mutedInk, font: "400 13.5px/1.5 'Inter', sans-serif" }}>
            Загрузка…
          </span>
        ) : logsError ? (
          <span style={{ color: theme.danger, font: "400 13.5px/1.5 'Inter', sans-serif" }}>
            {logsError}
          </span>
        ) : visibleLogs.length === 0 ? (
          <EmptyLogs theme={theme} />
        ) : (
          visibleLogs.map((entry, index) => (
            <div
              key={`${entry.source}-${index}`}
              style={{
                font: "400 13.5px/1.5 'Inter', sans-serif",
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

function FilterChip({
  theme,
  accent,
  label,
  selected,
  onClick,
}: {
  theme: Theme;
  accent: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Pressable onClick={onClick} borderRadius={999}>
      <div
        className="log-header-btn"
        style={{
          padding: '6px 12px',
          borderRadius: 999,
          font: "500 12.5px/1 'Inter', sans-serif",
          color: selected ? accent : theme.mutedInk,
          border: `1px solid ${selected ? accent : 'transparent'}`,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
    </Pressable>
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
      <Pressable onClick={disabled ? undefined : onClick} disabled={disabled} borderRadius={12}>
        <div
          className="log-header-btn"
          style={{
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
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
      <div style={{ font: "500 22px/1.2 'Source Serif 4', serif", color: theme.mutedInk }}>
        Логов пока нет
      </div>
    </div>
  );
}
