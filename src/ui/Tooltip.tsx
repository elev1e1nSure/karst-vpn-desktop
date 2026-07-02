import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Theme } from './theme';

const SHOW_DELAY_MS = 350;
const VIEWPORT_MARGIN = 8;

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
  const [shiftX, setShiftX] = useState(0);
  const anchorRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
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
      // anchorRef itself is `display: contents` and has no box of its own
      // (getBoundingClientRect would return a zero rect at 0,0), so measure
      // the actual rendered child instead.
      const el = anchorRef.current?.firstElementChild;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setShiftX(0);
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

  // Runs before paint: nudge the bubble back into the viewport if it would
  // otherwise clip against the window edge (e.g. an anchor near the right side).
  useLayoutEffect(() => {
    if (!visible || !rect) return;
    const bubble = bubbleRef.current;
    if (!bubble) return;
    const halfWidth = bubble.offsetWidth / 2;
    const minCenter = VIEWPORT_MARGIN + halfWidth;
    const maxCenter = window.innerWidth - VIEWPORT_MARGIN - halfWidth;
    const clampedX = Math.min(Math.max(rect.x, minCenter), maxCenter);
    setShiftX(clampedX - rect.x);
  }, [visible, rect]);

  const style: CSSProperties = rect
    ? ({
        position: 'fixed',
        left: rect.x,
        top: rect.y,
        '--tt-shift': `${shiftX}px`,
        marginTop: placement === 'top' ? -8 : 8,
        zIndex: 200,
        pointerEvents: 'none',
      } as CSSProperties)
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
            ref={bubbleRef}
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
