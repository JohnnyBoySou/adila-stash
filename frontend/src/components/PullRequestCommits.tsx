import { useRef } from "react";
import { Browser } from "@wailsio/runtime";
import { ExternalLink, GitCommit } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { relativeTime } from "@/lib/format";
import type { PullRequestCommit } from "@/lib/github";

interface Props {
  commits: PullRequestCommit[];
}

const ROW_HEIGHT = 56;

export function PullRequestCommits({ commits }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    getItemKey: (i) => commits[i]?.sha ?? i,
  });

  if (commits.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-[12px] text-muted-foreground">
        Sem commits neste PR.
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((row) => {
            const c = commits[row.index];
            if (!c) return null;
            return (
              <div
                key={row.key}
                data-index={row.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 flex w-full items-start gap-3 border-b border-border/50 px-3 py-2"
                style={{ transform: `translateY(${row.start}px)` }}
              >
                {c.avatarUrl ? (
                  <img
                    src={c.avatarUrl}
                    alt=""
                    className="mt-0.5 size-5 shrink-0 rounded-full border border-border"
                  />
                ) : (
                  <GitCommit className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" title={c.subject}>
                    {c.subject}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="font-mono">{c.shortSha}</span>
                    <span>·</span>
                    <span className="truncate">{c.authorLogin || c.authorName}</span>
                    <span>·</span>
                    <span>{relativeTime(c.authoredAt)}</span>
                  </div>
                </div>
                {c.htmlUrl && (
                  <button
                    type="button"
                    onClick={() => void Browser.OpenURL(c.htmlUrl)}
                    className="mt-0.5 flex size-6 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title="Abrir commit no GitHub"
                  >
                    <ExternalLink className="size-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
