import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MouseEvent, SetStateAction } from 'react';
import { commands, getErrorMessage } from '../../app/commands';
import { buildGroups, formatPingLabel } from '../../app/models';
import type { ServerDto, SubscriptionDto } from '../../app/types';

type ServerCatalogOptions = {
  isBusy: boolean;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setAppError: Dispatch<SetStateAction<string>>;
};

export function useServerCatalog({ isBusy, setIsBusy, setAppError }: ServerCatalogOptions) {
  const [servers, setServers] = useState<ServerDto[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionDto[]>([]);
  const [pingMap, setPingMap] = useState<Record<string, number | null>>({});
  const [selectedServerId, setSelectedServerId] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [subscriptionMenuId, setSubscriptionMenuId] = useState<string | null>(null);
  const [addServerOpen, setAddServerOpen] = useState(false);
  const [addServerValue, setAddServerValue] = useState('');
  const addServerValueRef = useRef(addServerValue);
  addServerValueRef.current = addServerValue;
  const [addServerError, setAddServerError] = useState('');
  const [addServerLoading, setAddServerLoading] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [refreshAllLoading, setRefreshAllLoading] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    },
    [],
  );

  useEffect(() => {
    if (servers.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const results = await commands.pingServers();
        if (cancelled) return;
        setPingMap((previous) => {
          const next = { ...previous };
          for (const result of results) next[result.id] = result.latency_ms ?? null;
          return next;
        });
      } catch {
        // Ping is non-critical; the latency label stays empty on failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [servers]);

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
  const allServers = groups.flatMap((group) => group.servers);
  const selectedServer =
    allServers.find((server) => server.id === selectedServerId) ?? allServers[0] ?? null;

  const hydrate = useCallback(
    (
      serverList: ServerDto[],
      subscriptionList: SubscriptionDto[],
      preferredServerId?: string | null,
    ) => {
      setServers(serverList);
      setSubscriptions(subscriptionList);
      setSelectedServerId((current) => {
        if (preferredServerId && serverList.some((server) => server.id === preferredServerId)) {
          return preferredServerId;
        }
        if (current && serverList.some((server) => server.id === current)) return current;
        return serverList[0]?.id ?? '';
      });
    },
    [],
  );

  const openMenu = () => {
    if (menuVisible) return;
    setMenuVisible(true);
    setMenuClosing(false);
  };

  const closeMenu = useCallback(() => {
    if (!menuVisible || menuClosing) return;
    setMenuClosing(true);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      setMenuVisible(false);
      setMenuClosing(false);
      setSubscriptionMenuId(null);
    }, 320);
  }, [menuVisible, menuClosing]);

  const selectServer = (id: string) => {
    setSelectedServerId(id);
    closeMenu();
  };

  const removeServer = async (id: string, event: MouseEvent) => {
    event.stopPropagation();
    if (isBusy) return;
    setIsBusy(true);
    setAppError('');
    try {
      await commands.deleteServer(id);
      const next = servers.filter((server) => server.id !== id);
      setServers(next);
      setSelectedServerId((current) => (current === id ? (next[0]?.id ?? '') : current));
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const deleteSubscription = async (id: string) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await commands.deleteSubscription(id);
      const [serverList, subscriptionList] = await Promise.all([
        commands.listServers(),
        commands.listSubscriptions(),
      ]);
      setServers(serverList);
      setSubscriptions(subscriptionList);
      setSubscriptionMenuId(null);
      closeMenu();
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const openAddServer = () => {
    setAddServerOpen(true);
    setAddServerError('');
    setImportMessage('');
  };

  const closeAddServer = () => {
    setAddServerOpen(false);
    setAddServerValue('');
    setAddServerError('');
  };

  const changeAddServerValue = (value: string) => {
    setAddServerValue(value);
    setAddServerError('');
  };

  const submitAddServer = async () => {
    const value = addServerValueRef.current.trim();
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
        const [serverList, subscriptionList] = await Promise.all([
          commands.listServers(),
          commands.listSubscriptions(),
        ]);
        setServers(serverList);
        setSubscriptions(subscriptionList);
        const importedServer = serverList.find(
          (server) => server.subscription_id === summary.subscription_id,
        );
        setSelectedServerId(importedServer?.id ?? serverList[0]?.id ?? '');
        setImportMessage(`Импортировано ${summary.imported} сервер(ов)`);
      } else {
        const server = await commands.addManualLink(value);
        setServers((previous) => [server, ...previous.filter((item) => item.id !== server.id)]);
        setSelectedServerId(server.id);
      }
      setAppError('');
      closeAddServer();
    } catch (error) {
      setAddServerError(getErrorMessage(error));
    } finally {
      setAddServerLoading(false);
    }
  };

  const refreshAll = async () => {
    if (refreshAllLoading) return;
    setRefreshAllLoading(true);
    try {
      await commands.refreshAllSubscriptions();
      const [serverList, subscriptionList] = await Promise.all([
        commands.listServers(),
        commands.listSubscriptions(),
      ]);
      setServers(serverList);
      setSubscriptions(subscriptionList);
      setSelectedServerId((current) => {
        if (serverList.some((server) => server.id === current)) return current;
        const previous = servers.find((server) => server.id === current);
        if (!previous) return current;
        const match = serverList.find(
          (server) =>
            server.subscription_id === previous.subscription_id &&
            server.host === previous.host &&
            server.port === previous.port,
        );
        return match?.id ?? serverList[0]?.id ?? '';
      });
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setRefreshAllLoading(false);
    }
  };

  return {
    servers,
    groups,
    selectedServer,
    selectedServerId,
    setSelectedServerId,
    hydrate,
    menuVisible,
    menuClosing,
    openMenu,
    closeMenu,
    subscriptionMenuId,
    setSubscriptionMenuId,
    addServerOpen,
    addServerValue,
    addServerError,
    addServerLoading,
    importMessage,
    refreshAllLoading,
    selectServer,
    removeServer,
    deleteSubscription,
    openAddServer,
    closeAddServer,
    changeAddServerValue,
    submitAddServer,
    refreshAll,
  };
}
