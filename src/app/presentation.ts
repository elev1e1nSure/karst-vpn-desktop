import type { RoutingMode } from './types';

export const formatElapsed = (s: number): string => {
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

export const isRoutingMode = (value: string): value is RoutingMode =>
  value === 'Full' || value === 'BypassLocal' || value === 'BypassRu';

export function formatUpdateInterval(hours: number | null | undefined): string {
  if (!hours || hours <= 0) return 'Не указан';
  return `${hours} ч`;
}

export const mood = {
  ringDuration: '1.7s',
  iconStroke: '2.2',
  chipRadius: '14px',
  subOff: 'Готов к подключению',
  subConnecting: 'Настраиваем туннель',
};
