import { useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react';

export function Pressable({
  onClick,
  disabled = false,
  pressedScale = 1,
  borderRadius,
  style,
  className = '',
  children,
}: {
  onClick?: (event?: ReactMouseEvent<HTMLDivElement>) => void;
  disabled?: boolean;
  pressedScale?: number;
  borderRadius?: number;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <div
      className={`pressable ${className}`}
      style={{
        ...style,
        position: 'relative',
        borderRadius: borderRadius ?? style?.borderRadius,
        transform: pressed && !disabled ? `scale(${pressedScale})` : undefined,
        opacity: disabled ? 0.55 : 1,
        cursor: 'default',
      }}
      onPointerDown={() => {
        if (!disabled) {
          setPressed(true);
        }
      }}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={disabled ? undefined : onClick}
    >
      {children}
    </div>
  );
}
