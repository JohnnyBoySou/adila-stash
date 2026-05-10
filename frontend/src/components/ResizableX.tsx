import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface Props {
  storageKey: string;
  defaultWidth: number;
  min: number;
  max: number;
  children: ReactNode;
  className?: string;
}

export function ResizableX({
  storageKey,
  defaultWidth,
  min,
  max,
  children,
  className,
}: Props) {
  const [width, setWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const n = parseInt(saved, 10);
        if (!Number.isNaN(n)) return Math.min(max, Math.max(min, n));
      }
    } catch {
      /* ignore */
    }
    return defaultWidth;
  });

  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const widthRef = useRef(width);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const delta = e.clientX - startXRef.current;
      const next = Math.min(max, Math.max(min, startWidthRef.current + delta));
      setWidth(next);
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(storageKey, String(widthRef.current));
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [min, max, storageKey]);

  return (
    <div className={cn("relative h-full shrink-0", className)} style={{ width }}>
      {children}
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={(e) => {
          e.preventDefault();
          draggingRef.current = true;
          startXRef.current = e.clientX;
          startWidthRef.current = widthRef.current;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
        onDoubleClick={() => {
          setWidth(defaultWidth);
          try {
            localStorage.setItem(storageKey, String(defaultWidth));
          } catch {
            /* ignore */
          }
        }}
        className="group absolute inset-y-0 -right-0.5 z-20 w-1.5 cursor-col-resize"
        title="Arraste para redimensionar (duplo clique restaura)"
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-foreground/30" />
      </div>
    </div>
  );
}
