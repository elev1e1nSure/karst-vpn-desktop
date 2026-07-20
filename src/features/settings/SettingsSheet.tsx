import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AutoRefreshMode } from '../../app/types';
import { Pressable } from '../../ui/Pressable';
import { Tooltip } from '../../ui/Tooltip';
import { themeVars } from '../../ui/theme';
import type { Theme } from '../../ui/theme';

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
  // Off-track needs to read against both the row's rest bg and its hover tint,
  // so it uses a dedicated recessed color rather than a nearby surface token.
  const trackColor = checked ? `color-mix(in oklch, ${accent} 70%, transparent)` : theme.switchOff;
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

export function SettingsSheet({
  theme,
  accent,
  darkModeOn,
  bypassLocal,
  bypassRu,
  autoRefreshMode,
  autoRefreshHours,
  dnsDohUrl,
  onToggleDarkMode,
  onToggleBypassLocal,
  onToggleBypassRu,
  onSetAutoRefreshMode,
  onSetAutoRefreshHours,
  onSetDnsDohUrl,
}: {
  theme: Theme;
  accent: string;
  darkModeOn: boolean;
  bypassLocal: boolean;
  bypassRu: boolean;
  autoRefreshMode: AutoRefreshMode;
  autoRefreshHours: number;
  dnsDohUrl: string;
  onToggleDarkMode: () => void;
  onToggleBypassLocal: () => void;
  onToggleBypassRu: () => void;
  onSetAutoRefreshMode: (m: AutoRefreshMode) => void;
  onSetAutoRefreshHours: (h: number) => void;
  onSetDnsDohUrl: (url: string) => void;
}) {
  return (
    <div style={{ overflow: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ToggleRow
          theme={theme}
          accent={accent}
          title="Тёмная тема"
          subtitle="Тёмное оформление интерфейса"
          checked={darkModeOn}
          onToggle={onToggleDarkMode}
        />
        <ToggleRow
          theme={theme}
          accent={accent}
          title="Обход локальной сети"
          subtitle="Локальные адреса и домены (.local, .lan) напрямую"
          checked={bypassLocal}
          onToggle={onToggleBypassLocal}
        />
        <ToggleRow
          theme={theme}
          accent={accent}
          title="Обход сайтов РФ"
          subtitle="Домены .ru, .su, .рф напрямую"
          checked={bypassRu}
          onToggle={onToggleBypassRu}
        />
        <AutoRefreshSection
          theme={theme}
          accent={accent}
          mode={autoRefreshMode}
          hours={autoRefreshHours}
          onSetMode={onSetAutoRefreshMode}
          onSetHours={onSetAutoRefreshHours}
        />
        <DnsSection theme={theme} url={dnsDohUrl} onSetUrl={onSetDnsDohUrl} />
      </div>
    </div>
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
            <Tooltip key={m} label={REFRESH_SUBTITLES[m]} theme={theme} placement="top">
              <SettingsChoiceRow
                theme={theme}
                accent={accent}
                title={REFRESH_LABELS[m]}
                selected={mode === m}
                onClick={() => {
                  onSetMode(m);
                  if (m !== 'EveryHours') dismissDialog();
                }}
              />
            </Tooltip>
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
                background: theme.inputBg,
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

function DnsSection({
  theme,
  url,
  onSetUrl,
}: {
  theme: Theme;
  url: string;
  onSetUrl: (url: string) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogClosing, setDialogClosing] = useState(false);
  const [urlText, setUrlText] = useState(url);
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
    setUrlText(url);
  }, [url]);
  useEffect(() => {
    return () => {
      if (closeRef.current) clearTimeout(closeRef.current);
    };
  }, []);

  return (
    <>
      <SettingsActionRow
        theme={theme}
        title="DNS-сервер"
        subtitle={url}
        onClick={() => {
          setDialogOpen(true);
          setDialogClosing(false);
        }}
      />
      {dialogOpen && (
        <SettingsPickerDialog
          theme={theme}
          title="DNS-сервер"
          isClosing={dialogClosing}
          onDismiss={dismissDialog}
        >
          <input
            className="hours-input"
            type="text"
            value={urlText}
            onChange={(e) => setUrlText(e.target.value)}
            onBlur={() => {
              const trimmed = urlText.trim();
              if (trimmed && trimmed !== url) onSetUrl(trimmed);
            }}
            placeholder="https://1.1.1.1/dns-query"
            style={{
              font: "400 14px/1 'Inter', sans-serif",
              color: theme.ink,
              background: theme.inputBg,
              borderRadius: 10,
              padding: '10px 12px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
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
          boxShadow: '0 20px 48px -12px rgba(0,0,0,0.5)',
          padding: '4px 16px',
          ...themeVars(theme),
        }}
      >
        <div
          style={{
            font: "500 19px/1.2 'Source Serif 4', serif",
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
  subtitle?: string;
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
          padding: '16px 16px',
        }}
      >
        <div>
          <div style={{ font: "600 18px/1.3 'Inter', sans-serif", color: theme.ink }}>{title}</div>
          {subtitle && (
            <div style={{ font: "400 13px/1.35 'Inter', sans-serif", color: theme.mutedInk }}>
              {subtitle}
            </div>
          )}
        </div>
        <div
          style={{
            width: 20,
            height: 20,
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
          padding: '16px 18px',
        }}
      >
        <div>
          <div style={{ font: "500 16px/1.3 'Inter', sans-serif", color: theme.ink }}>{title}</div>
          <div style={{ font: "400 13px/1.35 'Inter', sans-serif", color: theme.mutedInk }}>
            {subtitle}
          </div>
        </div>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
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
          padding: '16px 18px',
        }}
      >
        <div>
          <div style={{ font: "500 16px/1.3 'Inter', sans-serif", color: theme.ink }}>{title}</div>
          <div style={{ font: "400 13px/1.35 'Inter', sans-serif", color: theme.mutedInk }}>
            {subtitle}
          </div>
        </div>
        <MiniSwitch checked={checked} accent={accent} theme={theme} onToggle={onToggle} />
      </div>
    </Pressable>
  );
}

// Dragged-down bottom sheet: snaps back if released before the close threshold.
