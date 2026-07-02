import { useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Theme } from './theme';

const SHOW_DELAY_MS = 350;

export function Tooltip({
  label,
  theme,
  placement = 'top',
  disabled = false,
  children,
}: {
  label: string;
  theme: Theme;
  placement?: 'top' | 'bottom';
  disabled?: boolean;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<{ x: number; y: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearShowTimer = () => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };

  const scheduleShow = () => {
    if (disabled) return;
    clearShowTimer();
    showTimerRef.current = setTimeout(() => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({
        x: r.left + r.width / 2,
        y: placement === 'top' ? r.top : r.bottom,
      });
      setVisible(true);
    }, SHOW_DELAY_MS);
  };

  const hide = () => {
    clearShowTimer();
    setVisible(false);
  };

  const style: CSSProperties = rect
    ? {
        position: 'fixed',
        left: rect.x,
        top: rect.y,
        transform: `translate(-50%, ${placement === 'top' ? '-100%' : '0'})`,
        marginTop: placement === 'top' ? -8 : 8,
        zIndex: 200,
        pointerEvents: 'none',
      }
    : {};

  return (
    <div
      ref={anchorRef}
      onPointerEnter={scheduleShow}
      onPointerLeave={hide}
      onPointerDown={hide}
      style={{ display: 'contents' }}
    >
      {children}
      {visible &&
        rect &&
        createPortal(
          <div
            className={`app-tooltip ${placement === 'top' ? 'app-tooltip-top' : 'app-tooltip-bottom'}`}
            style={{
              ...style,
              background: theme.ink,
              color: theme.appBg,
            }}
          >
            {label}
          </div>,
          document.body,
        )}
    </div>
  );
}
