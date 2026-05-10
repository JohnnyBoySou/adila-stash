import { useRef } from "react";
import { GitCommit, Loader2 } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import type { CommitInfo } from "@/lib/git";

interface Props {
  commits: CommitInfo[];
  selected: CommitInfo | null;
  onSelect: (c: CommitInfo) => void;
  loading: boolean;
}

const ROW_HEIGHT = 56;

export function HistoryPanel({ commits, selected, onSelect, loading }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    getItemKey: (i) => commits[i]?.hash ?? i,
  });

  return (
    <div className="flex h-full w-full flex-col border-r border-border">
      <div className="flex h-10 items-center gap-2 border-b border-border px-3 text-[11px] font-medium uppercase tracking-[0.1em]">
        Histórico
        {loading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        <span className="ml-auto text-muted-foreground tabular-nums">{commits.length}</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto">
        {commits.length === 0 && !loading ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            Sem commits ainda.
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const c = commits[row.index];
              if (!c) return null;
              return (
                <button
                  key={row.key}
                  data-index={row.index}
                  ref={virtualizer.measureElement}
                  onClick={() => onSelect(c)}
                  className={cn(
                    "absolute left-0 top-0 flex w-full items-start gap-3 border-b border-border/50 px-3 py-2 text-left transition-colors hover:bg-accent",
                    selected?.hash === c.hash && "bg-accent",
                  )}
                  style={{ transform: `translateY(${row.start}px)` }}
                >
                  <GitCommit className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.subject}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="font-mono">{c.shortHash}</span>
                      <span>·</span>
                      <span className="truncate">{c.authorName}</span>
                      <span>·</span>
                      <span>{relativeTime(c.authoredAt)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
