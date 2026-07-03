import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { commands, getErrorMessage } from '../../app/commands';
import { isRoutingMode } from '../../app/presentation';
import type { AutoRefreshMode, RoutingMode, SettingsDto } from '../../app/types';
import { DARK_THEME, LIGHT_THEME } from '../../ui/theme';

const AUTO_REFRESH_MODE_BY_DTO: Record<string, AutoRefreshMode> = {
  auto: 'Auto',
  off: 'Off',
  every_hours: 'EveryHours',
};

const ROUTING_MODE_BY_DTO: Record<string, RoutingMode> = {
  full: 'Full',
  bypass_local: 'BypassLocal',
  bypass_ru: 'BypassRu',
};

const AUTO_REFRESH_MODE_TO_DTO: Record<AutoRefreshMode, string> = {
  Auto: 'auto',
  Off: 'off',
  EveryHours: 'every_hours',
};

const ROUTING_MODE_TO_DTO: Record<RoutingMode, string> = {
  Full: 'full',
  BypassLocal: 'bypass_local',
  BypassRu: 'bypass_ru',
};

export function usePreferences(setAppError: Dispatch<SetStateAction<string>>) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [darkModeOn, setDarkModeOn] = useState(true);
  const [routingMode, setRoutingMode] = useState<RoutingMode>('BypassRu');
  const [autoRefreshMode, setAutoRefreshMode] = useState<AutoRefreshMode>('Auto');
  const [autoRefreshHours, setAutoRefreshHours] = useState(24);
  const [dnsDohUrl, setDnsDohUrl] = useState('https://1.1.1.1/dns-query');
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    },
    [],
  );

  useEffect(() => {
    void getCurrentWindow().setTheme(darkModeOn ? 'dark' : 'light');
  }, [darkModeOn]);

  const hydrate = useCallback(
    (settings: SettingsDto) => {
      setAutoRefreshMode(AUTO_REFRESH_MODE_BY_DTO[settings.auto_refresh_mode] ?? 'Auto');
      setAutoRefreshHours(settings.auto_refresh_hours);
      setDnsDohUrl(settings.dns_doh_url);
      const savedTheme = localStorage.getItem('karst-dark-mode');
      if (savedTheme !== null) setDarkModeOn(savedTheme === 'true');
      const savedRouting = localStorage.getItem('karst-routing-mode');
      const backendRouting = ROUTING_MODE_BY_DTO[settings.routing_mode] ?? 'BypassRu';
      const routing = savedRouting && isRoutingMode(savedRouting) ? savedRouting : backendRouting;
      setRoutingMode(routing);
      if (routing !== backendRouting) {
        void commands.setRoutingMode(ROUTING_MODE_TO_DTO[routing]).catch((error) => {
          setAppError(getErrorMessage(error));
        });
      }
    },
    [setAppError],
  );

  const open = () => {
    if (visible) return;
    setVisible(true);
    setClosing(false);
  };

  const close = () => {
    if (!visible || closing) return;
    setClosing(true);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, 320);
  };

  const prepareForRouteChange = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    setClosing(false);
  };

  const toggleDarkMode = () => {
    setThemeBusy(true);
    setDarkModeOn((previous) => {
      const next = !previous;
      localStorage.setItem('karst-dark-mode', String(next));
      return next;
    });
    requestAnimationFrame(() => setThemeBusy(false));
  };

  const setRouting = async (mode: RoutingMode) => {
    try {
      await commands.setRoutingMode(ROUTING_MODE_TO_DTO[mode]);
      setRoutingMode(mode);
      localStorage.setItem('karst-routing-mode', mode);
      setAppError('');
    } catch (error) {
      setAppError(getErrorMessage(error));
    }
  };

  const setAutoRefresh = async (mode: AutoRefreshMode) => {
    try {
      await commands.setAutoRefreshSettings(AUTO_REFRESH_MODE_TO_DTO[mode], null);
      setAutoRefreshMode(mode);
      setAppError('');
    } catch (error) {
      setAppError(getErrorMessage(error));
    }
  };

  const setAutoRefreshHoursValue = async (hours: number) => {
    try {
      await commands.setAutoRefreshSettings('every_hours', hours);
      setAutoRefreshHours(hours);
      setAutoRefreshMode('EveryHours');
      setAppError('');
    } catch (error) {
      setAppError(getErrorMessage(error));
    }
  };

  const setDnsDohUrlValue = async (url: string) => {
    try {
      await commands.setDnsDohUrl(url);
      setDnsDohUrl(url);
      setAppError('');
    } catch (error) {
      setAppError(getErrorMessage(error));
    }
  };

  return {
    visible,
    closing,
    themeBusy,
    darkModeOn,
    theme: darkModeOn ? DARK_THEME : LIGHT_THEME,
    routingMode,
    autoRefreshMode,
    autoRefreshHours,
    dnsDohUrl,
    hydrate,
    open,
    close,
    prepareForRouteChange,
    toggleDarkMode,
    setRouting,
    setAutoRefresh,
    setAutoRefreshHours: setAutoRefreshHoursValue,
    setDnsDohUrl: setDnsDohUrlValue,
  };
}
