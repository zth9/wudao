import { useState, useCallback } from "react";

export interface AnchorPoint {
  x: number;
  y: number;
}

export function useDropdownTrigger() {
  const [open, setOpen] = useState(false);
  const [anchorPoint, setAnchorPoint] = useState<AnchorPoint>({ x: 0, y: 0 });

  const onTriggerClick = useCallback((e: React.MouseEvent) => {
    setAnchorPoint({ x: e.clientX, y: e.clientY });
    setOpen((prev) => !prev);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return { open, setOpen, close, anchorPoint, onTriggerClick };
}
