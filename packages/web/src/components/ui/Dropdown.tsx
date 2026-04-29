import { useRef, useLayoutEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../../utils/cn";

interface DropdownProps {
  open: boolean;
  onClose: () => void;
  /** 鼠标点击坐标（视口坐标系） */
  anchorPoint: { x: number; y: number };
  /** 定位 class，如 "left-0 top-full mt-1" 或 "right-0 top-full mt-2" */
  className?: string;
  children: ReactNode;
}

export function Dropdown({ open, onClose, anchorPoint, className, children }: DropdownProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState("50% 0%");

  useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const ox = ((anchorPoint.x - rect.left) / rect.width) * 100;
    const oy = ((anchorPoint.y - rect.top) / rect.height) * 100;
    setOrigin(`${Math.max(0, Math.min(100, ox))}% ${Math.max(0, Math.min(100, oy))}%`);
  }, [open, anchorPoint.x, anchorPoint.y]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.3 }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.3 }}
            style={{ transformOrigin: origin }}
            className={cn("absolute z-50 apple-dropdown", className)}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
