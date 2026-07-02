import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';

type Ripple = { id: number; x: number; y: number };

export function Pressable({
  onClick,
  disabled = false,
  pressedScale = 1,
  ripple = true,
  borderRadius,
  style,
  className = '',
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  pressedScale?: number;
  ripple?: boolean;
  borderRadius?: number;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const rippleIdRef = useRef(0);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(
    () => () => {
      for (const timer of timersRef.current) clearTimeout(timer);
    },
    [],
  );

  const createRipple = (event: PointerEvent<HTMLDivElement>) => {
    if (!ripple) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const id = ++rippleIdRef.current;
    setRipples((current) => [
      ...current,
      { id, x: event.clientX - rect.left, y: event.clientY - rect.top },
    ]);
    const timer = setTimeout(() => {
      setRipples((current) => current.filter((item) => item.id !== id));
      timersRef.current.delete(timer);
    }, 400);
    timersRef.current.add(timer);
  };

  return (
    <div
      className={`pressable ${className}`}
      style={{
        ...style,
        position: 'relative',
        overflow: ripple ? 'hidden' : undefined,
        borderRadius: borderRadius ?? style?.borderRadius,
        transform: pressed && !disabled ? `scale(${pressedScale})` : undefined,
        opacity: disabled ? 0.55 : 1,
        cursor: 'default',
      }}
      onPointerDown={(event) => {
        if (!disabled) {
          setPressed(true);
          createRipple(event);
        }
      }}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={disabled ? undefined : onClick}
    >
      {children}
      {ripple &&
        ripples.map((item) => (
          <span key={item.id} className="touch-ripple" style={{ left: item.x, top: item.y }} />
        ))}
    </div>
  );
}
