import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './style.css';

type Phase = 'off' | 'connecting' | 'on';

type ServerDto = {
  id: string;
  name: string;
  host: string;
  port: number;
  security: string;
  transport: string;
  flow?: string | null;
};

type ConnectionStatusDto = {
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
  server_id?: string | null;
  server_name?: string | null;
  message?: string | null;
};

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Не удалось выполнить команду';
};

const tagForServer = (server: ServerDto) => {
  const flow = server.flow ? ` · ${server.flow}` : '';
  return `${server.security.toUpperCase()} · ${server.transport} · ${server.host}:${server.port}${flow}`;
};

const phaseFromStatus = (status: ConnectionStatusDto): Phase => {
  if (status.state === 'connected') return 'on';
  if (status.state === 'connecting') return 'connecting';
  return 'off';
};

const moodMap = {
  calm: { ringDuration: '2.3s', iconStroke: '1.9', chipRadius: '16px', subOff: 'Нажми на кнопку, чтобы защититься', subConnecting: 'Устанавливаем безопасное соединение' },
  focused: { ringDuration: '1.7s', iconStroke: '2.2', chipRadius: '14px', subOff: 'Готов к подключению', subConnecting: 'Настраиваем туннель' },
  urgent: { ringDuration: '1s', iconStroke: '2.6', chipRadius: '10px', subOff: 'Защита выключена — нажми сейчас', subConnecting: 'Срочно шифруем соединение' },
};

export function App() {
  // Configurable properties (defaults)
  const defaultDarkMode = true;
  const defaultAccentColor = '#D97757';
  const defaultMood = 'focused' as 'calm' | 'focused' | 'urgent';

  // React State
  const [phase, setPhase] = useState<Phase>('off');
  const [elapsed, setElapsed] = useState(0);
  const [showBurst, setShowBurst] = useState(false);
  const [showFadeOut, setShowFadeOut] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [appError, setAppError] = useState('');
  
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState('');
  const [servers, setServers] = useState<ServerDto[]>([]);
  
  const [addServerOpen, setAddServerOpen] = useState(false);
  const [addServerValue, setAddServerValue] = useState('');
  const [addServerError, setAddServerError] = useState('');
  
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);
  
  const [darkModeOn, setDarkModeOn] = useState<boolean | null>(null);

  // Refs for timeouts
  const burstTimeoutRef = useRef<any>(null);
  const fadeOutTimeoutRef = useRef<any>(null);
  const menuCloseTimeoutRef = useRef<any>(null);
  const settingsCloseTimeoutRef = useRef<any>(null);

  // Connection timer effect
  useEffect(() => {
    let intervalId: any = null;
    if (phase === 'on') {
      intervalId = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [phase]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
      if (fadeOutTimeoutRef.current) clearTimeout(fadeOutTimeoutRef.current);
      if (menuCloseTimeoutRef.current) clearTimeout(menuCloseTimeoutRef.current);
      if (settingsCloseTimeoutRef.current) clearTimeout(settingsCloseTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadBackendState = async () => {
      try {
        const [serverList, status] = await Promise.all([
          invoke<ServerDto[]>('list_servers'),
          invoke<ConnectionStatusDto>('connection_status'),
        ]);
        if (cancelled) return;

        setServers(serverList);
        setPhase(phaseFromStatus(status));
        setSelectedServerId((current) => {
          if (status.server_id && serverList.some((server) => server.id === status.server_id)) {
            return status.server_id;
          }
          if (current && serverList.some((server) => server.id === current)) {
            return current;
          }
          return serverList[0]?.id ?? '';
        });
        setAppError(status.state === 'error' ? status.message ?? 'Ошибка соединения' : '');
      } catch (error) {
        if (!cancelled) setAppError(getErrorMessage(error));
      }
    };

    void loadBackendState();

    return () => {
      cancelled = true;
    };
  }, []);

  // Handlers
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
      if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);

      try {
        const status = await invoke<ConnectionStatusDto>('connect', { serverId: selectedServerId });
        setPhase(phaseFromStatus(status));
        if (status.server_id) setSelectedServerId(status.server_id);
        setShowBurst(true);
        burstTimeoutRef.current = setTimeout(() => setShowBurst(false), 600);
      } catch (error) {
        setPhase('off');
        setAppError(getErrorMessage(error));
      } finally {
        setIsBusy(false);
      }
    } else if (phase === 'on') {
      setIsBusy(true);
      setAppError('');
      try {
        const status = await invoke<ConnectionStatusDto>('disconnect');
        setPhase(phaseFromStatus(status));
        setShowFadeOut(true);
        if (fadeOutTimeoutRef.current) clearTimeout(fadeOutTimeoutRef.current);
        fadeOutTimeoutRef.current = setTimeout(() => setShowFadeOut(false), 400);
      } catch (error) {
        setAppError(getErrorMessage(error));
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

  const onCloseServerMenu = () => {
    if (!menuVisible || menuClosing) return;
    setMenuClosing(true);
    if (menuCloseTimeoutRef.current) clearTimeout(menuCloseTimeoutRef.current);
    menuCloseTimeoutRef.current = setTimeout(() => {
      setMenuVisible(false);
      setMenuClosing(false);
    }, 320);
  };

  const onSelectServer = (id: string) => {
    setSelectedServerId(id);
    onCloseServerMenu();
  };

  const onOpenAddServer = () => {
    setAddServerOpen(true);
    setAddServerError('');
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
      setAddServerError('Вставь vless:// ссылку');
      return;
    }

    setIsBusy(true);
    setAddServerError('');
    try {
      const server = await invoke<ServerDto>('add_manual_link', { vlessUri: value });
      setServers((prev) => [server, ...prev.filter((item) => item.id !== server.id)]);
      setSelectedServerId(server.id);
      setAppError('');
      closeAddServerForm();
    } catch (error) {
      setAddServerError(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const onRemoveServer = async (id: string, e: React.MouseEvent) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (isBusy) return;

    setIsBusy(true);
    setAppError('');
    try {
      await invoke<boolean>('delete_server', { serverId: id });
      const nextServers = servers.filter((server) => server.id !== id);
      setServers(nextServers);
      setSelectedServerId((current) => (current === id ? nextServers[0]?.id ?? '' : current));
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsBusy(false);
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

  const onToggleDarkMode = () => {
    setDarkModeOn((prev) => !(prev ?? defaultDarkMode));
  };

  // Calculations
  const isConnecting = phase === 'connecting' || (isBusy && phase === 'off');
  const isConnected = phase === 'on';
  const dark = darkModeOn ?? defaultDarkMode;
  const accent = defaultAccentColor;
  const mood = moodMap[defaultMood] || moodMap.calm;

  const theme = dark
    ? {
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
      }
    : {
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

  let buttonBg = '';
  let buttonShadow = '';
  let iconColor = '';
  let buttonBorder = '';
  const offShadowDark = dark ? '0,0,0' : '0,0,0';

  if (isConnected) {
    buttonBg = accent;
    buttonShadow = 'none';
    iconColor = '#fff';
    buttonBorder = `2.5px solid ${accent}`;
  } else if (isConnecting) {
    buttonBg = theme.buttonOffBg;
    buttonShadow = 'none';
    iconColor = accent;
    buttonBorder = `2.5px solid ${accent}`;
  } else {
    buttonBg = theme.buttonOffBg;
    buttonShadow = 'none';
    iconColor = theme.buttonOffIcon;
    buttonBorder = `2.5px solid ${theme.buttonOffBorder}`;
  }

  const buttonAnim = showBurst
    ? 'buttonConnectPulse 0.4s cubic-bezier(0.4,0,0.2,1) both'
    : showFadeOut
    ? 'buttonDisconnectPulse 0.4s cubic-bezier(0.4,0,0.2,1) both'
    : 'none';

  const buttonStyle: React.CSSProperties = {
    position: 'relative',
    zIndex: 2,
    width: '172px',
    height: '172px',
    borderRadius: '50%',
    backgroundColor: buttonBg,
    border: buttonBorder,
    boxShadow: buttonShadow,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'default',
    outline: 'none',
    WebkitTapHighlightColor: 'transparent',
    animation: buttonAnim,
    transition: 'border-color 0.4s cubic-bezier(0.4,0,0.2,1), box-shadow 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.15s ease',
  };

  const statusLabel = isConnected ? 'Подключено' : isConnecting ? 'Подключаемся…' : 'Не подключено';
  const subLabel = appError || (servers.length === 0 ? 'Добавь VLESS-сервер для подключения' : isConnecting ? mood.subConnecting : mood.subOff);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const selectedServer = servers.find((server) => server.id === selectedServerId) ?? servers[0] ?? null;

  const menuAnim = `${menuClosing ? 'menuSlideDown' : 'menuSlideUp'} 0.38s cubic-bezier(0.4,0,0.2,1) both`;
  const backdropAnim = `${menuClosing ? 'backdropOut' : 'backdropIn'} 0.32s cubic-bezier(0.4,0,0.2,1) both`;
  const settingsAnim = `${settingsClosing ? 'menuSlideDown' : 'menuSlideUp'} 0.38s cubic-bezier(0.4,0,0.2,1) both`;
  const settingsBackdropAnim = `${settingsClosing ? 'backdropOut' : 'backdropIn'} 0.32s cubic-bezier(0.4,0,0.2,1) both`;

  const switchTrack = (on: boolean) => (on ? `color-mix(in oklch, ${accent} 70%, transparent)` : theme.border);
  const switchKnob = (on: boolean) => (on ? '21px' : '3px');



  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        padding: '20px 28px 32px',
        background: theme.appBg,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        // CSS variables passed to let hover/active styles work in style.css
        '--card-bg': theme.cardBg,
        '--theme-ink': theme.ink,
        '--theme-muted-ink': theme.mutedInk,
        '--theme-border': theme.border,
        '--accent': accent,
      } as React.CSSProperties}
    >
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <div
          onClick={onOpenSettings}
          className="settings-btn"
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: theme.cardBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'default',
            flexShrink: 0,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 15.5C13.933 15.5 15.5 13.933 15.5 12C15.5 10.067 13.933 8.5 12 8.5C10.067 8.5 8.5 10.067 8.5 12C8.5 13.933 10.067 15.5 12 15.5Z"
              stroke={theme.mutedInk}
              strokeWidth="1.8"
            ></path>
            <path
              d="M19.4 13.5C19.46 13.01 19.5 12.51 19.5 12C19.5 11.49 19.46 10.99 19.4 10.5L21.34 8.97C21.53 8.82 21.58 8.55 21.46 8.34L19.74 5.36C19.62 5.15 19.36 5.07 19.14 5.15L16.87 6.06C16.18 5.53 15.42 5.11 14.6 4.82L14.25 2.42C14.21 2.18 14.01 2 13.77 2H10.33C10.09 2 9.89 2.18 9.85 2.42L9.5 4.82C8.68 5.11 7.92 5.54 7.23 6.06L4.96 5.15C4.74 5.07 4.48 5.15 4.36 5.36L2.64 8.34C2.52 8.55 2.57 8.82 2.76 8.97L4.7 10.5C4.64 10.99 4.6 11.5 4.6 12C4.6 12.5 4.64 13.01 4.7 13.5L2.76 15.03C2.57 15.18 2.52 15.45 2.64 15.66L4.36 18.64C4.48 18.85 4.74 18.93 4.96 18.85L7.23 17.94C7.92 18.47 8.68 18.89 9.5 19.18L9.85 21.58C9.89 21.82 10.09 22 10.33 22H13.77C14.01 22 14.21 21.82 14.25 21.58L14.6 19.18C15.42 18.89 16.18 18.46 16.87 17.94L19.14 18.85C19.36 18.93 19.62 18.85 19.74 18.64L21.46 15.66C21.58 15.45 21.53 15.18 21.34 15.03L19.4 13.5Z"
              stroke={theme.mutedInk}
              strokeWidth="1.5"
              strokeLinejoin="round"
            ></path>
          </svg>
        </div>
      </div>

      {/* center stage */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '28px' }}>
        <div style={{ position: 'relative', width: '228px', height: '228px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isConnected && (
            <div
              style={{
                position: 'absolute',
                zIndex: 1,
                width: '196px',
                height: '196px',
                borderRadius: '50%',
                background: `color-mix(in oklch, ${accent} 12%, ${theme.pageBg})`,
                border: `1.5px solid color-mix(in oklch, ${accent} 18%, ${theme.pageBg})`,
                pointerEvents: 'none',
                boxSizing: 'border-box',
              }}
            />
          )}
          <button
            onClick={onTapButton}
            style={buttonStyle}
            className="connect-btn"
            aria-label="Подключить VPN"
          >
            {isConnecting ? (
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  border: '3px solid rgba(255,255,255,0.35)',
                  borderTopColor: '#fff',
                  animation: 'spin 0.85s linear infinite',
                }}
              />
            ) : (
              <svg width="46" height="46" viewBox="0 0 24 24" fill="none">
                <path d="M12 3V12" stroke={iconColor} strokeWidth={mood.iconStroke} strokeLinecap="round"></path>
                <path
                  d="M6.5 6.5C5 8.1 4 10.2 4 12.5C4 17.2 7.8 21 12.5 21C17.2 21 21 17.2 21 12.5C21 10.1 19.9 7.9 18.3 6.4"
                  stroke={iconColor}
                  strokeWidth={mood.iconStroke}
                  strokeLinecap="round"
                  fill="none"
                  transform="translate(-1,0)"
                ></path>
              </svg>
            )}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minHeight: '78px' }}>
          <div style={{ font: "500 27px/1.15 'Source Serif 4', serif", color: theme.ink }}>{statusLabel}</div>
          {isConnected ? (
            <div style={{ font: "500 15px/1 'Inter', sans-serif", color: theme.mutedInk, letterSpacing: '0.3px', fontVariantNumeric: 'tabular-nums' }}>
              {formatElapsed(elapsed)}
            </div>
          ) : (
            <div style={{ font: "400 15px/1.4 'Inter', sans-serif", color: theme.mutedInk, maxWidth: '240px', textAlign: 'center' }}>
              {subLabel}
            </div>
          )}
        </div>
      </div>

      {/* location chip */}
      <div
        onClick={onOpenServerMenu}
        className="location-chip"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '16px 18px',
          borderRadius: mood.chipRadius,
          background: theme.cardBg,
          border: `2px solid ${theme.border}`,
          cursor: 'default',
        }}
      >
        <div style={{ width: '38px', height: '38px', borderRadius: '11px', background: theme.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: '15px', height: '15px', borderRadius: '50%', border: `2px solid ${theme.mutedInk}` }}></div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "500 15px/1.3 'Inter', sans-serif", color: theme.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedServer?.name ?? 'Сервер не выбран'}</div>
          <div style={{ font: "400 13px/1.3 'Inter', sans-serif", color: theme.mutedInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedServer ? tagForServer(selectedServer) : 'Добавь VLESS-ссылку'}</div>
        </div>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
          <path d="M9 6L15 12L9 18" stroke={theme.mutedInk} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
        </svg>
      </div>

      {/* server menu overlay */}
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
              maxHeight: '78%',
              display: 'flex',
              flexDirection: 'column',
              background: theme.appBg,
              borderRadius: '22px 22px 0 0',
              boxShadow: '0 -18px 40px -16px rgba(0,0,0,0.4)',
              padding: '8px 22px 28px',
              boxSizing: 'border-box',
              zIndex: 6,
              animation: menuAnim,
            }}
          >
            <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: theme.border, margin: '4px auto 10px' }}></div>
            <div style={{ font: "500 20px/1.2 'Source Serif 4', serif", color: theme.ink, marginBottom: '0px' }}>Выбор сервера</div>
            <div style={{ height: '1px', background: theme.border, margin: '16px 0' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'auto' }}>
              {servers.map((srv) => {
                const isSelected = srv.id === selectedServerId;
                const dotColor = isSelected ? accent : theme.border;
                return (
                  <div
                    key={srv.id}
                    onClick={() => onSelectServer(srv.id)}
                    className="server-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '12px 10px',
                      borderRadius: '14px',
                      cursor: 'default',
                    }}
                  >
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor, flexShrink: 0 }}></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: "500 14.5px/1.3 'Inter', sans-serif", color: theme.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{srv.name}</div>
                      <div style={{ font: "400 12px/1.3 'Inter', sans-serif", color: theme.mutedInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tagForServer(srv)}</div>
                    </div>
                    <span style={{ font: "500 10px/1 'Inter', sans-serif", color: accent, background: `color-mix(in oklch, ${accent} 16%, transparent)`, padding: '3px 7px', borderRadius: '6px', flexShrink: 0 }}>
                      VLESS
                    </span>
                    {isSelected && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M5 13L9.5 17.5L19 7" stroke={accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"></path>
                      </svg>
                    )}
                    <div
                      onClick={(e) => onRemoveServer(srv.id, e)}
                      className="remove-server-btn"
                      style={{ width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'default' }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                        <path d="M5 5L19 19M19 5L5 19" stroke={theme.mutedInk} strokeWidth="2" strokeLinecap="round"></path>
                      </svg>
                    </div>
                  </div>
                );
              })}
              {servers.length === 0 && (
                <div style={{ padding: '18px 10px', font: "400 13px/1.4 'Inter', sans-serif", color: theme.mutedInk }}>
                  Список пуст. Добавь сервер по VLESS-ссылке ниже.
                </div>
              )}
            </div>

            <div style={{ marginTop: '6px' }}>
              {!addServerOpen ? (
                <div
                  onClick={onOpenAddServer}
                  className="add-server-trigger"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '13px 10px',
                    borderRadius: '14px',
                    border: `1.5px dashed ${theme.border}`,
                    cursor: 'default',
                  }}
                >
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: theme.cardBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ font: "400 15px/1 'Inter', sans-serif", color: theme.mutedInk }}>+</span>
                  </div>
                  <span style={{ font: "500 14px/1.3 'Inter', sans-serif", color: theme.mutedInk }}>Добавить сервер по VLESS-ссылке</span>
                </div>
              ) : (
                <div className="add-server-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px', borderRadius: '14px', background: theme.cardBg }}>
                  <span style={{ font: "500 12px/1.3 'Inter', sans-serif", color: theme.mutedInk, letterSpacing: '0.2px' }}>VLESS-ссылка</span>
                  <input
                    value={addServerValue}
                    onChange={(e) => setAddServerValue(e.target.value)}
                    placeholder="vless://uuid@host:port?...#Имя"
                    style={{
                      font: "400 13px/1.4 'Inter', ui-monospace, monospace",
                      color: theme.ink,
                      background: theme.pageBg,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '10px',
                      padding: '10px 12px',
                      outline: 'none',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  />
                  {addServerError && <span style={{ font: "400 12px/1.3 'Inter', sans-serif", color: theme.danger }}>{addServerError}</span>}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <div
                      onClick={onCancelAddServer}
                      className="btn-cancel"
                      style={{ flex: 1, textAlign: 'center', padding: '10px', borderRadius: '10px', border: `1px solid ${theme.border}`, font: "500 13px/1 'Inter', sans-serif", color: theme.mutedInk, cursor: 'default' }}
                    >
                      Отмена
                    </div>
                    <div
                      onClick={onSubmitAddServer}
                      className="btn-submit"
                      style={{ flex: 1, textAlign: 'center', padding: '10px', borderRadius: '10px', background: accent, font: "500 13px/1 'Inter', sans-serif", color: '#fff', cursor: 'default' }}
                    >
                      Добавить
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* settings overlay */}
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
              maxHeight: '40%',
              display: 'flex',
              flexDirection: 'column',
              background: theme.appBg,
              borderRadius: '22px 22px 0 0',
              boxShadow: '0 -18px 40px -16px rgba(0,0,0,0.4)',
              padding: '8px 22px 28px',
              boxSizing: 'border-box',
              zIndex: 6,
              animation: settingsAnim,
              gap: '4px',
              overflow: 'hidden',
            }}
          >
            <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: theme.border, margin: '4px auto 10px' }}></div>
            <div style={{ font: "500 20px/1.2 'Source Serif 4', serif", color: theme.ink, marginBottom: '0px' }}>Настройки</div>

            {/* toggle rows */}
            <div style={{ height: '1px', background: theme.border, margin: '16px 0' }} />
            <div
              onClick={onToggleDarkMode}
              className="settings-row"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 8px', cursor: 'default' }}
            >
              <div>
                <div style={{ font: "500 14.5px/1.3 'Inter', sans-serif", color: theme.ink }}>Тёмная тема</div>
                <div style={{ font: "400 12px/1.3 'Inter', sans-serif", color: theme.mutedInk }}>Спокойнее для глаз вечером</div>
              </div>
              <div
                className="switch-btn"
                style={{ width: '46px', height: '28px', borderRadius: '14px', background: switchTrack(dark), position: 'relative', flexShrink: 0 }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: '3px',
                    left: switchKnob(dark),
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    transition: 'left 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
