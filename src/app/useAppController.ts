import { useEffect, useState } from 'react';
import { commands, getErrorMessage } from './commands';
import { mood } from './presentation';
import { useConnectionStatus } from './useConnectionStatus';
import { useLogs } from '../features/diagnostics/useLogs';
import { usePreferences } from '../features/settings/usePreferences';
import { useServerCatalog } from '../features/servers/useServerCatalog';

export function useAppController() {
  const [isBusy, setIsBusy] = useState(false);
  const [appError, setAppError] = useState('');
  const catalog = useServerCatalog({ isBusy, setIsBusy, setAppError });
  const preferences = usePreferences(setAppError);
  const logs = useLogs();
  const { phase, setPhase, elapsed, applyStatus, refreshStatus } = useConnectionStatus(
    catalog.setSelectedServerId,
    setAppError,
  );

  const hydrateCatalog = catalog.hydrate;
  const hydratePreferences = preferences.hydrate;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [serverList, subscriptionList, status, settings] = await Promise.all([
          commands.listServers(),
          commands.listSubscriptions(),
          commands.connectionStatus(),
          commands.getSettings(),
        ]);
        if (cancelled) return;
        applyStatus(status);
        hydrateCatalog(serverList, subscriptionList, status.server_id);
        setAppError(status.state === 'error' ? (status.message ?? 'Ошибка соединения') : '');
        hydratePreferences(settings);
      } catch (error) {
        if (!cancelled) setAppError(getErrorMessage(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyStatus, hydrateCatalog, hydratePreferences]);

  const isConnecting = phase === 'connecting' || (isBusy && phase === 'off');
  const isDisconnecting = phase === 'disconnecting';
  const isTransitioning = isConnecting || isDisconnecting;
  const isConnected = phase === 'on';
  const statusLabel = isConnected
    ? 'Подключено'
    : isDisconnecting
      ? 'Отключаемся…'
      : isConnecting
        ? 'Подключаемся…'
        : 'Не подключено';
  const subLabel =
    appError ||
    (catalog.servers.length === 0
      ? 'Добавь VLESS-ссылку или подписку'
      : isDisconnecting
        ? 'Завершаем VPN-туннель'
        : isConnecting
          ? mood.subConnecting
          : mood.subOff);

  const toggleConnection = async () => {
    if (isBusy || phase === 'connecting' || phase === 'disconnecting') return;
    if (phase === 'off') {
      if (!catalog.selectedServer) {
        setAppError('Добавь VLESS-сервер перед подключением');
        return;
      }
      setIsBusy(true);
      setAppError('');
      setPhase('connecting');
      try {
        applyStatus(await commands.connect(catalog.selectedServer.id));
      } catch (error) {
        setPhase('off');
        setAppError(getErrorMessage(error));
      } finally {
        setIsBusy(false);
      }
    } else if (phase === 'on') {
      setIsBusy(true);
      setAppError('');
      setPhase('disconnecting');
      try {
        applyStatus(await commands.disconnect());
      } catch (error) {
        setAppError(getErrorMessage(error));
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

  const openLogs = () => {
    preferences.prepareForRouteChange();
    logs.open();
  };

  return {
    appError,
    phase,
    elapsed,
    isTransitioning,
    isConnected,
    statusLabel,
    subLabel,
    toggleConnection,
    catalog,
    preferences,
    logs,
    openLogs,
  };
}

export type AppController = ReturnType<typeof useAppController>;
