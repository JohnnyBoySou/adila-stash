import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Browser } from "@wailsio/runtime";
import { motion } from "framer-motion";
import {
  ExternalLink,
  GitPullRequest,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { GithubErrorBanner } from "@/components/GithubErrorBanner";
import { Mascot } from "@/components/Mascot";
import { useGitHubAuth } from "@/hooks/useGitHubAuth";
import { github, type PullRequestSummary } from "@/lib/github";
import { useRepo } from "@/lib/repo-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_layout/pull-requests")({
  component: PullRequestsView,
});

type StateFilter = "open" | "closed" | "all";

const FILTERS: { id: StateFilter; label: string }[] = [
  { id: "open", label: "Abertos" },
  { id: "closed", label: "Fechados" },
  { id: "all", label: "Todos" },
];

function PullRequestsView() {
  const { remote } = useRepo();
  const { user, loading: authLoading } = useGitHubAuth();
  const authed = !!user;

  const [filter, setFilter] = useState<StateFilter>("open");
  const [items, setItems] = useState<PullRequestSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const owner = remote?.owner ?? null;
  const name = remote?.name ?? null;
  const repoRef = useMemo(
    () => (owner && name ? { owner, name } : null),
    [owner, name],
  );

  const refresh = useCallback(async () => {
    if (!owner || !name || !authed) return;
    setLoading(true);
    setError(null);
    try {
      const list = await github.listPullRequests(owner, name, filter);
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [owner, name, authed, filter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Mascot message="Faça login no GitHub no canto superior direito para listar PRs." />
      </div>
    );
  }

  if (!repoRef) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Mascot message="Sem remote do GitHub neste repositório — não dá pra listar PRs." />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card px-3 text-[11px]">
        <GitPullRequest className="size-3.5 text-muted-foreground" />
        <span className="font-medium uppercase tracking-[0.08em]">Pull Requests</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          {repoRef.owner}/{repoRef.name}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "relative h-6 px-2 text-[10px] uppercase tracking-[0.08em] transition-colors hover:bg-accent",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="pr-filter-indicator"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground"
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  />
                )}
                {f.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="ml-1 flex h-6 w-6 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            title="Atualizar"
          >
            {loading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
          </button>
        </div>
      </div>

      {error && <GithubErrorBanner error={error} />}

      <div className="flex-1 overflow-y-auto">
        {loading && items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
            Carregando PRs…
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Mascot
              message={
                filter === "open"
                  ? "Nenhum PR aberto. Tudo limpo por aqui."
                  : "Nada pra mostrar com esse filtro."
              }
            />
          </div>
        ) : (
          <ul>
            {items.map((pr) => (
              <PullRequestRow key={pr.number} pr={pr} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PullRequestRow({ pr }: { pr: PullRequestSummary }) {
  const navigate = useNavigate();
  const updated = useMemo(() => formatRelative(pr.updatedAt), [pr.updatedAt]);
  const stateColor =
    pr.state === "open"
      ? pr.draft
        ? "text-muted-foreground"
        : "text-[color:var(--added)]"
      : "text-[color:var(--deleted)]";
  const stateLabel = pr.state === "open" ? (pr.draft ? "Draft" : "Aberto") : "Fechado";

  return (
    <li className="group border-b border-border transition-colors hover:bg-accent/40">
      <button
        type="button"
        onClick={() =>
          void navigate({
            to: "/pull-requests/$number",
            params: { number: pr.number },
          })
        }
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left"
      >
        <GitPullRequest className={cn("mt-0.5 size-4 shrink-0", stateColor)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] text-foreground">{pr.title}</span>
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              #{pr.number}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className={cn("uppercase tracking-[0.08em]", stateColor)}>{stateLabel}</span>
            <span>·</span>
            {pr.avatarUrl && (
              <img src={pr.avatarUrl} alt="" className="size-4 rounded-full border border-border" />
            )}
            <span className="truncate">{pr.author}</span>
            <span>·</span>
            <span className="font-mono text-[10px]">{pr.head}</span>
            <span className="text-muted-foreground/70">→</span>
            <span className="font-mono text-[10px]">{pr.base}</span>
            <span className="ml-auto shrink-0">{updated}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void Browser.OpenURL(pr.htmlUrl);
          }}
          className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          title="Abrir no GitHub"
        >
          <ExternalLink className="size-3.5" />
        </button>
      </button>
    </li>
  );
}

function formatRelative(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mês`;
  const years = Math.floor(days / 365);
  return `${years} a`;
}
