import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { commands, getErrorMessage } from './app/commands';
import { buildGroups, formatPingLabel } from './app/models';
import { formatElapsed, isRoutingMode, mood } from './app/presentation';
import type {
  AutoRefreshMode,
  LogEntryDto,
  RoutingMode,
  ServerDto,
  SubscriptionDto,
} from './app/types';
import { useConnectionStatus } from './app/useConnectionStatus';
import { ConnectButton, LocationChip } from './features/connection/ConnectionControls';
import { ServerSheet } from './features/servers/ServerSheet';
import { SettingsSheet } from './features/settings/SettingsSheet';
import { LogsScreen } from './ui/LogsScreen';
import { Pressable } from './ui/Pressable';
import { Tooltip } from './ui/Tooltip';
import { ACCENT, DARK_THEME, LIGHT_THEME, themeVars } from './ui/theme';
import { useSheetDrag } from './ui/useSheetDrag';
import './style.css';

export function App() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [isBusy, setIsBusy] = useState(false);
  const [appError, setAppError] = useState('');

  const [servers, setServers] = useState<ServerDto[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionDto[]>([]);
  const [pingMap, setPingMap] = useState<Record<string, number | null>>({});
  const [selectedServerId, setSelectedServerId] = useState('');
  const { phase, setPhase, elapsed, applyStatus, refreshStatus } = useConnectionStatus(
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
  }, [servers]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const isConnecting = phase === 'connecting' || (isBusy && phase === 'off');
  const isDisconnecting = phase === 'disconnecting';
  const isTransitioning = isConnecting || isDisconnecting;
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

  const statusLabel = isConnected
    ? 'Подключено'
    : isDisconnecting
      ? 'Отключаемся…'
      : isConnecting
        ? 'Подключаемся…'
        : 'Не подключено';
  const subLabel =
    appError ||
    (servers.length === 0
      ? 'Добавь VLESS-ссылку или подписку'
      : isDisconnecting
        ? 'Завершаем VPN-туннель'
        : isConnecting
          ? mood.subConnecting
          : mood.subOff);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const onTapButton = async () => {
    if (isBusy || phase === 'connecting' || phase === 'disconnecting') return;
    if (phase === 'off') {
      if (!selectedServer) {
        setAppError('Добавь VLESS-сервер перед подключением');
        return;
      }
      setIsBusy(true);
      setAppError('');
      setPhase('connecting');
      try {
        const status = await commands.connect(selectedServer.id);
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
      setPhase('disconnecting');
      try {
        const status = await commands.disconnect();
        applyStatus(status);
      } catch (err) {
        setAppError(getErrorMessage(err));
        try {
          await refreshStatus();
        } catch {
          setPhase('off');
        }
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
        return match?.id ?? serverList[0]?.id ?? '';
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

  const renderDragHandle = (drag: ReturnType<typeof useSheetDrag>) => (
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
            phase={isTransitioning && phase === 'off' ? 'connecting' : phase}
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
