import React, { useRef, useState } from 'react';

export function useSheetDrag(onClose: () => void) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ active: false, startY: 0, startOffset: 0, offset: 0 });

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startY: e.clientY,
      startOffset: dragRef.current.offset,
      offset: dragRef.current.offset,
    };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const next = Math.max(0, dragRef.current.startOffset + (e.clientY - dragRef.current.startY));
    dragRef.current.offset = next;
    setOffset(next);
  };
  const endDrag = () => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    const finalOffset = dragRef.current.offset;
    dragRef.current.offset = 0;
    setDragging(false);
    setOffset(0);
    if (finalOffset > 110) onClose();
  };

  return {
    offset,
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
