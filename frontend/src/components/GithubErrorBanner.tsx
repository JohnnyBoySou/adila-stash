import { AlertCircle, ExternalLink } from "lucide-react";
import { Browser } from "@wailsio/runtime";

import { describeGithubError } from "@/lib/github-errors";
import { cn } from "@/lib/utils";

interface Props {
  error: unknown;
  className?: string;
}

export function GithubErrorBanner({ error, className }: Props) {
  if (!error) return null;
  const info = describeGithubError(error);

  return (
    <div
      className={cn(
        "flex items-start gap-2 border-b border-border bg-[color:var(--deleted)]/10 px-3 py-2 text-[11px]",
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-[color:var(--deleted)]" />
      <div className="min-w-0 flex-1">
        <p className="text-[color:var(--deleted)]">{info.message}</p>
        {info.hint && (
          <p className="mt-0.5 text-muted-foreground">{info.hint}</p>
        )}
      </div>
      {info.action && (
        <button
          type="button"
          onClick={() => void Browser.OpenURL(info.action!.url)}
          className="flex shrink-0 items-center gap-1 border border-border bg-card px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ExternalLink className="size-3" />
          {info.action.label}
        </button>
      )}
    </div>
  );
}
