import { useCallback, useEffect, useRef, useState } from 'react';
import { commands, getErrorMessage } from '../../app/commands';
import type { LogEntryDto } from '../../app/types';

export function useLogs() {
  const [logs, setLogs] = useState<LogEntryDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [toastClosing, setToastClosing] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    },
    [],
  );

  // Stable identity: consumed by an effect that reloads logs when the Logs tab opens.
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setLogs(await commands.listLogs());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  const showToast = (message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastClosing(false);
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => {
      setToastClosing(true);
      toastTimeoutRef.current = setTimeout(() => setToastMessage(''), 280);
    }, 1800);
  };

  const clear = async () => {
    setLoading(true);
    setError('');
    try {
      await commands.clearLogs();
      setLogs([]);
      showToast('Логи очищены');
    } catch (clearError) {
      setError(getErrorMessage(clearError));
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        logs.map((entry) => `[${entry.source}] ${entry.message}`).join('\n'),
      );
      showToast('Логи скопированы');
    } catch (copyError) {
      setError(getErrorMessage(copyError));
    }
  };

  return {
    logs,
    loading,
    error,
    toastMessage,
    toastClosing,
    load,
    clear,
    copy,
  };
}
