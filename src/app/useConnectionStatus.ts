import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { commands, getErrorMessage } from './commands';
import type { ConnectionStatusDto, Phase } from './types';

const phaseFromStatus = (status: ConnectionStatusDto): Phase => {
  if (status.state === 'connected') return 'on';
  if (status.state === 'connecting') return 'connecting';
  if (status.state === 'disconnecting') return 'disconnecting';
  return 'off';
};

export function useConnectionStatus(
  setSelectedServerId: Dispatch<SetStateAction<string>>,
  setAppError: Dispatch<SetStateAction<string>>,
) {
  const [phase, setPhase] = useState<Phase>('off');
  const [elapsed, setElapsed] = useState(0);
  const statusRequestRef = useRef(0);

  const applyStatusValue = useCallback(
    (status: ConnectionStatusDto) => {
      setPhase(phaseFromStatus(status));
      if (status.server_id) setSelectedServerId(status.server_id);
      if (status.state === 'error') {
        setAppError(status.message ?? 'Соединение неожиданно завершено');
      }
    },
    [setAppError, setSelectedServerId],
  );

  const applyStatus = useCallback(
    (status: ConnectionStatusDto) => {
      statusRequestRef.current += 1;
      applyStatusValue(status);
    },
    [applyStatusValue],
  );

  const refreshStatus = useCallback(async () => {
    const requestId = ++statusRequestRef.current;
    const status = await commands.connectionStatus();
    if (requestId === statusRequestRef.current) applyStatusValue(status);
    return status;
  }, [applyStatusValue]);

  useEffect(() => {
    if (phase !== 'on') {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => setElapsed((value) => value + 1), 1_000);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase === 'off') return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const status = await commands.connectionStatus();
        if (cancelled) return;
        applyStatus(status);
        if (status.state === 'error') return;
      } catch (error) {
        if (!cancelled) setAppError(getErrorMessage(error));
      }
      if (!cancelled) timeout = setTimeout(poll, 2_000);
    };
    timeout = setTimeout(poll, 2_000);
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [applyStatus, phase, setAppError]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) return;
        void refreshStatus().catch((error) => {
          if (!disposed) setAppError(getErrorMessage(error));
        });
      })
      .then((removeListener) => {
        if (disposed) removeListener();
        else unlisten = removeListener;
      })
      .catch((error) => {
        if (!disposed) setAppError(getErrorMessage(error));
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [refreshStatus, setAppError]);

  return { phase, setPhase, elapsed, applyStatus, refreshStatus };
}
