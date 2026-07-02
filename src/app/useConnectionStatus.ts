import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { commands, getErrorMessage } from './commands';
import type { ConnectionStatusDto, Phase } from './types';

const phaseFromStatus = (status: ConnectionStatusDto): Phase => {
  if (status.state === 'connected') return 'on';
  if (status.state === 'connecting') return 'connecting';
  return 'off';
};

export function useConnectionStatus(
  setSelectedServerId: Dispatch<SetStateAction<string>>,
  setAppError: Dispatch<SetStateAction<string>>,
) {
  const [phase, setPhase] = useState<Phase>('off');
  const [elapsed, setElapsed] = useState(0);

  const applyStatus = useCallback(
    (status: ConnectionStatusDto) => {
      setPhase(phaseFromStatus(status));
      if (status.server_id) setSelectedServerId(status.server_id);
      if (status.state === 'error') {
        setAppError(status.message ?? 'Соединение неожиданно завершено');
      }
    },
    [setAppError, setSelectedServerId],
  );

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

  return { phase, setPhase, elapsed, applyStatus };
}
