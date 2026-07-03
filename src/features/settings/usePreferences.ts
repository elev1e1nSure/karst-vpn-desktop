import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { commands, getErrorMessage } from '../../app/commands';
import { isRoutingMode } from '../../app/presentation';
import type { AutoRefreshMode, RoutingMode, SettingsDto } from '../../app/types';
import { DARK_THEME, LIGHT_THEME } from '../../ui/theme';

export function usePreferences(setAppError: Dispatch<SetStateAction<string>>) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [darkModeOn, setDarkModeOn] = useState(true);
  const [routingMode, setRoutingMode] = useState<RoutingMode>('BypassRu');
  const [autoRefreshMode, setAutoRefreshMode] = useState<AutoRefreshMode>('Auto');
  const [autoRefreshHours, setAutoRefreshHours] = useState(24);
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

  const hydrate = useCallback((settings: SettingsDto) => {
    const modeMap: Record<string, AutoRefreshMode> = {
      auto: 'Auto',
      off: 'Off',
      every_hours: 'EveryHours',
    };
    setAutoRefreshMode(modeMap[settings.auto_refresh_mode] ?? 'Auto');
    setAutoRefreshHours(settings.auto_refresh_hours);
    const savedTheme = localStorage.getItem('karst-dark-mode');
    if (savedTheme !== null) setDarkModeOn(savedTheme === 'true');
    const savedRouting = localStorage.getItem('karst-routing-mode');
    if (savedRouting && isRoutingMode(savedRouting)) setRoutingMode(savedRouting);
  }, []);

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

  const setRouting = (mode: RoutingMode) => {
    setRoutingMode(mode);
    localStorage.setItem('karst-routing-mode', mode);
  };

  const setAutoRefresh = async (mode: AutoRefreshMode) => {
    const commandMode = mode === 'Auto' ? 'auto' : mode === 'Off' ? 'off' : 'every_hours';
    try {
      await commands.setAutoRefreshSettings(commandMode, null);
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

  return {
    visible,
    closing,
    themeBusy,
    darkModeOn,
    theme: darkModeOn ? DARK_THEME : LIGHT_THEME,
    routingMode,
    autoRefreshMode,
    autoRefreshHours,
    hydrate,
    open,
    close,
    prepareForRouteChange,
    toggleDarkMode,
    setRouting,
    setAutoRefresh,
    setAutoRefreshHours: setAutoRefreshHoursValue,
  };
}
