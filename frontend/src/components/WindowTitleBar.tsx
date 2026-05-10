import { useEffect, useState } from "react";
import { Window } from "@wailsio/runtime";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Square, SquareStack, X } from "lucide-react";

import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

const DRAG_STYLE = { "--wails-draggable": "drag" } as React.CSSProperties;
const NO_DRAG_STYLE = { "--wails-draggable": "no-drag" } as React.CSSProperties;

export function WindowTitleBar({ title = "stash" }: { title?: string }) {
  const [maximised, setMaximised] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      void Window.IsMaximised().then((m) => {
        if (!cancelled) setMaximised(m);
      });
    };
    sync();
    const id = window.setInterval(sync, 500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div
      style={DRAG_STYLE}
      onDoubleClick={() => void Window.ToggleMaximise()}
      className="flex h-8 shrink-0 select-none items-center gap-2 border-b border-border bg-card pl-3 text-[11px]"
    >
      <Logo className="h-6 w-auto" />
      <span className="font-medium uppercase tracking-[0.12em] text-muted-foreground">{title}</span>
      <div style={NO_DRAG_STYLE} className="ml-auto flex items-stretch">
        <TitleBarButton onClick={() => void Window.Minimise()} aria-label="Minimizar">
          <Minus className="size-3.5" />
        </TitleBarButton>
        <TitleBarButton
          onClick={() => void Window.ToggleMaximise()}
          aria-label={maximised ? "Restaurar" : "Maximizar"}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={maximised ? "restore" : "maximise"}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="flex items-center justify-center"
            >
              {maximised ? <SquareStack className="size-3.5" /> : <Square className="size-3" />}
            </motion.span>
          </AnimatePresence>
        </TitleBarButton>
        <TitleBarButton
          onClick={() => void Window.Close()}
          aria-label="Fechar"
          className="hover:bg-destructive hover:text-destructive-foreground"
        >
          <X className="size-3.5" />
        </TitleBarButton>
      </div>
    </div>
  );
}

function TitleBarButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      style={NO_DRAG_STYLE}
      className={cn(
        "flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}
