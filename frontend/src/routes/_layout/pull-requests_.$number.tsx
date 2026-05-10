import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Browser } from "@wailsio/runtime";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ExternalLink,
  GitCommit,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  X,
} from "lucide-react";

import { GithubErrorBanner } from "@/components/GithubErrorBanner";
import { Markdown } from "@/components/Markdown";
import { PullRequestCommits } from "@/components/PullRequestCommits";
import { PullRequestFiles } from "@/components/PullRequestFiles";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useGitHubAuth } from "@/hooks/useGitHubAuth";
import {
  github,
  type IssueComment,
  type PullRequestCommit,
  type PullRequestDetail,
  type PullRequestFile,
  type PullRequestReview,
  type ReviewComment,
  type ReviewEvent,
} from "@/lib/github";
import { useRepo } from "@/lib/repo-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_layout/pull-requests_/$number")({
  parseParams: (params) => ({
    number: Number(params.number),
  }),
  component: PullRequestDetailView,
});

type Tab = "about" | "commits" | "files";

function PullRequestDetailView() {
  const { number } = Route.useParams();
  const { remote } = useRepo();
  const { user, loading: authLoading } = useGitHubAuth();
  const navigate = useNavigate();

  const owner = remote?.owner ?? null;
  const repo = remote?.name ?? null;

  const [tab, setTab] = useState<Tab>("about");
  const [detail, setDetail] = useState<PullRequestDetail | null>(null);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [reviews, setReviews] = useState<PullRequestReview[]>([]);
  const [reviewComments, setReviewComments] = useState<ReviewComment[]>([]);
  const [files, setFiles] = useState<PullRequestFile[]>([]);
  const [prCommits, setPrCommits] = useState<PullRequestCommit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    if (!owner || !repo || !user) return;
    setLoading(true);
    setError(null);
    try {
      const [d, ic, rv, rc, f, cm] = await Promise.all([
        github.getPullRequest(owner, repo, number),
        github.listIssueComments(owner, repo, number),
        github.listReviews(owner, repo, number),
        github.listReviewComments(owner, repo, number),
        github.listPullRequestFiles(owner, repo, number),
        github.listPullRequestCommits(owner, repo, number),
      ]);
      setDetail(d);
      setComments(ic);
      setReviews(rv);
      setReviewComments(rc);
      setFiles(f);
      setPrCommits(cm);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [owner, repo, user, number]);

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

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center text-[12px] text-muted-foreground">
        Faça login no GitHub para ver este PR.
      </div>
    );
  }

  if (!owner || !repo) {
    return (
      <div className="flex flex-1 items-center justify-center text-[12px] text-muted-foreground">
        Sem remote do GitHub neste repositório.
      </div>
    );
  }

  if (loading && !detail) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="flex flex-1 flex-col">
        <GithubErrorBanner error={error} />
        <div className="flex flex-1 items-center justify-center">
          <Button size="sm" variant="secondary" onClick={() => void refresh()}>
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        detail={detail}
        owner={owner}
        repo={repo}
        loading={loading}
        onBack={() => void navigate({ to: "/pull-requests" })}
        onRefresh={() => void refresh()}
      />
      <div className="flex shrink-0 items-center border-b border-border bg-card text-[11px]">
        <TabButton active={tab === "about"} onClick={() => setTab("about")}>
          <MessageSquare className="size-3" />
          Sobre
          <span className="ml-1 text-muted-foreground tabular-nums">
            {detail.commentsCount + reviews.length}
          </span>
        </TabButton>
        <TabButton active={tab === "commits"} onClick={() => setTab("commits")}>
          <GitCommit className="size-3" />
          Commits
          <span className="ml-1 text-muted-foreground tabular-nums">{detail.commits}</span>
        </TabButton>
        <TabButton active={tab === "files"} onClick={() => setTab("files")}>
          <GitPullRequest className="size-3" />
          Arquivos
          <span className="ml-1 text-muted-foreground tabular-nums">{detail.changedFiles}</span>
        </TabButton>
      </div>
      <div className="flex flex-1 overflow-hidden">
        {tab === "about" && (
          <ConversationTab
            owner={owner}
            repo={repo}
            number={number}
            detail={detail}
            comments={comments}
            reviews={reviews}
            reviewComments={reviewComments}
            currentUserLogin={user.login}
            onChange={() => void refresh()}
          />
        )}
        {tab === "commits" && <PullRequestCommits commits={prCommits} />}
        {tab === "files" && (
          <PullRequestFiles
            owner={owner}
            repo={repo}
            number={number}
            files={files}
            reviewComments={reviewComments}
            commitId={detail.headSha}
            onChange={() => void refresh()}
          />
        )}
      </div>
    </div>
  );
}

function Header({
  detail,
  owner,
  repo,
  loading,
  onBack,
  onRefresh,
}: {
  detail: PullRequestDetail;
  owner: string;
  repo: string;
  loading: boolean;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const status = stateBadge(detail);
  return (
    <div className="shrink-0 border-b border-border bg-card">
      <div className="flex h-9 items-center gap-2 px-3 text-[11px]">
        <button
          type="button"
          onClick={onBack}
          className="flex size-6 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Voltar"
        >
          <ArrowLeft className="size-3.5" />
        </button>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 border px-1.5 py-0.5 uppercase tracking-[0.08em]",
            status.classes,
          )}
          title={status.label}
        >
          <status.icon className="size-3" />
        </span>
        <span className="shrink-0 font-mono text-muted-foreground">#{detail.number}</span>
        <span className="min-w-0 flex-1 truncate text-foreground" title={detail.title}>
          {detail.title}
        </span>
        <span className="hidden shrink-0 truncate text-muted-foreground/60 sm:inline" title={`${owner}/${repo}`}>
          {owner}/{repo}
        </span>
        <button
          type="button"
          onClick={() => void Browser.OpenURL(detail.htmlUrl)}
          className="flex size-6 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Abrir no GitHub"
        >
          <ExternalLink className="size-3" />
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex size-6 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
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
  );
}

type TimelineItem =
  | { kind: "comment"; at: string; data: IssueComment }
  | { kind: "review"; at: string; data: PullRequestReview };

function ConversationTab({
  owner,
  repo,
  number,
  detail,
  comments,
  reviews,
  reviewComments,
  currentUserLogin,
  onChange,
}: {
  owner: string;
  repo: string;
  number: number;
  detail: PullRequestDetail;
  comments: IssueComment[];
  reviews: PullRequestReview[];
  reviewComments: ReviewComment[];
  currentUserLogin: string;
  onChange: () => void;
}) {
  const reviewCommentsByReview = useMemo(() => {
    const map = new Map<number, ReviewComment[]>();
    for (const rc of reviewComments) {
      const k = rc.pullRequestReviewId;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(rc);
    }
    return map;
  }, [reviewComments]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    for (const c of comments) items.push({ kind: "comment", at: c.createdAt, data: c });
    for (const r of reviews) {
      if (r.state === "PENDING") continue;
      items.push({ kind: "review", at: r.submittedAt || "", data: r });
    }
    items.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
    return items;
  }, [comments, reviews]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <AboutCard detail={detail} />

          <CommentBubble
            author={detail.author}
            avatarUrl={detail.avatarUrl}
            createdAt={detail.createdAt}
            body={detail.body}
            isSelf={detail.author === currentUserLogin}
            tone="initial"
          />

          {timeline.map((item, i) =>
            item.kind === "comment" ? (
              <CommentBubble
                key={`c-${item.data.id}-${i}`}
                author={item.data.author}
                avatarUrl={item.data.avatarUrl}
                createdAt={item.data.createdAt}
                body={item.data.body}
                isSelf={item.data.author === currentUserLogin}
              />
            ) : (
              <ReviewBubble
                key={`r-${item.data.id}-${i}`}
                review={item.data}
                inlineComments={reviewCommentsByReview.get(item.data.id) ?? []}
                isSelf={item.data.author === currentUserLogin}
              />
            ),
          )}

          {timeline.length === 0 && (
            <div className="border border-dashed border-border bg-card/40 p-6 text-center text-[11px] text-muted-foreground">
              Sem comentários nem reviews. Comece a conversa abaixo.
            </div>
          )}
        </div>
      </div>

      <ReviewForm
        owner={owner}
        repo={repo}
        number={number}
        canApprove={detail.author !== currentUserLogin}
        onSubmitted={onChange}
      />
    </div>
  );
}

function AboutCard({ detail }: { detail: PullRequestDetail }) {
  return (
    <section className="grid grid-cols-2 gap-x-4 gap-y-1.5 border border-border bg-card px-3 py-2 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground/60">Autor</span>
        {detail.avatarUrl && (
          <img
            src={detail.avatarUrl}
            alt=""
            className="size-4 rounded-full border border-border"
          />
        )}
        <span className="truncate">{detail.author}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground/60">Branches</span>
        <span className="truncate font-mono text-[10px]">{detail.head}</span>
        <span className="text-muted-foreground/60">→</span>
        <span className="truncate font-mono text-[10px]">{detail.base}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground/60">Mudanças</span>
        <span className="tabular-nums">
          <span className="text-[color:var(--added)]">+{detail.additions}</span>{" "}
          <span className="text-[color:var(--deleted)]">−{detail.deletions}</span>
        </span>
      </div>
      <div className="flex items-center gap-2 tabular-nums">
        <span className="text-muted-foreground/60">Total</span>
        <span>{detail.commits} commits</span>
        <span className="text-muted-foreground/60">·</span>
        <span>{detail.changedFiles} arquivos</span>
      </div>
    </section>
  );
}

function CommentBubble({
  author,
  avatarUrl,
  createdAt,
  body,
  isSelf = false,
  tone = "default",
}: {
  author: string;
  avatarUrl: string;
  createdAt: string;
  body: string;
  isSelf?: boolean;
  tone?: "default" | "initial";
}) {
  return (
    <article
      className={cn(
        "flex flex-col border border-border bg-card",
        tone === "initial" && "border-foreground/30",
      )}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px]">
        {avatarUrl && (
          <img src={avatarUrl} alt="" className="size-5 rounded-full border border-border" />
        )}
        <span className={cn("font-medium", isSelf && "text-foreground")}>{author}</span>
        <span className="text-muted-foreground">comentou</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {formatRelative(createdAt)}
        </span>
      </header>
      <CommentBody body={body} />
    </article>
  );
}

function ReviewBubble({
  review,
  inlineComments,
  isSelf,
}: {
  review: PullRequestReview;
  inlineComments: ReviewComment[];
  isSelf: boolean;
}) {
  const meta = reviewStateMeta(review.state);
  return (
    <article className={cn("flex flex-col border bg-card", meta.borderClass)}>
      <header className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px]">
        {review.avatarUrl && (
          <img
            src={review.avatarUrl}
            alt=""
            className="size-5 rounded-full border border-border"
          />
        )}
        <span className={cn("font-medium", isSelf && "text-foreground")}>{review.author}</span>
        <span className={cn("uppercase tracking-[0.08em]", meta.toneClass)}>{meta.label}</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {formatRelative(review.submittedAt)}
        </span>
      </header>
      {review.body.trim() && <CommentBody body={review.body} />}
      {inlineComments.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border bg-background/40 px-3 py-2">
          {inlineComments.map((c) => (
            <InlineCommentPreview key={c.id} comment={c} />
          ))}
        </div>
      )}
    </article>
  );
}

function InlineCommentPreview({ comment }: { comment: ReviewComment }) {
  return (
    <div className="border border-border bg-card">
      <div className="flex items-center gap-1.5 border-b border-border bg-background/40 px-2 py-1 text-[10px] text-muted-foreground">
        <FileDiffIcon />
        <span className="truncate font-mono">{comment.path}</span>
        {comment.line > 0 && (
          <span className="ml-auto shrink-0 font-mono text-muted-foreground/60">
            L{comment.line}
          </span>
        )}
      </div>
      {comment.diffHunk && <DiffHunk hunk={comment.diffHunk} highlightLine={comment.line} />}
      <div className="flex items-center gap-2 border-t border-border px-2 py-1.5 text-[11px]">
        {comment.avatarUrl && (
          <img
            src={comment.avatarUrl}
            alt=""
            className="size-4 rounded-full border border-border"
          />
        )}
        <span className="font-medium">{comment.author}</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {formatRelative(comment.createdAt)}
        </span>
      </div>
      <Markdown className="px-2 pb-2">{comment.body}</Markdown>
    </div>
  );
}

function FileDiffIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden
    >
      <path d="M13 6V2.5L9.5 6H13zM2.5 1.5h7L13 5v9.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 .5-.5z" />
      <path d="M5 12h6M5 9h6" />
    </svg>
  );
}

function DiffHunk({ hunk, highlightLine }: { hunk: string; highlightLine: number }) {
  const lines = hunk.split("\n");
  let newCursor = 0;
  let inHunk = false;
  return (
    <div className="overflow-x-auto bg-background/40 font-mono text-[10px] leading-[1.5]">
      {lines.map((raw, i) => {
        let kind: "header" | "add" | "del" | "ctx" = "ctx";
        let text = raw;
        let lineNum: number | null = null;
        if (raw.startsWith("@@")) {
          kind = "header";
          const m = raw.match(/\+(\d+)/);
          if (m) {
            newCursor = parseInt(m[1], 10) - 1;
            inHunk = true;
          }
        } else if (raw.startsWith("+")) {
          kind = "add";
          text = raw.slice(1);
          if (inHunk) newCursor += 1;
          lineNum = newCursor;
        } else if (raw.startsWith("-")) {
          kind = "del";
          text = raw.slice(1);
        } else {
          if (raw.startsWith(" ")) text = raw.slice(1);
          if (inHunk) newCursor += 1;
          lineNum = newCursor;
        }
        const isHighlighted = lineNum !== null && lineNum === highlightLine;
        return (
          <div
            key={i}
            className={cn(
              "flex min-w-fit",
              kind === "header" &&
                "bg-[color:var(--muted)]/40 text-muted-foreground",
              kind === "add" && "bg-[color:var(--added)]/10 text-foreground",
              kind === "del" && "bg-[color:var(--deleted)]/10 text-foreground",
              isHighlighted && "ring-1 ring-inset ring-foreground/30",
            )}
          >
            <span
              className={cn(
                "w-8 shrink-0 select-none px-1 text-right text-muted-foreground/50 tabular-nums",
                kind === "add" && "text-[color:var(--added)]/80",
                kind === "del" && "text-[color:var(--deleted)]/80",
              )}
            >
              {kind === "header" ? "" : lineNum ?? ""}
            </span>
            <span
              className={cn(
                "w-3 shrink-0 select-none text-center",
                kind === "add" && "text-[color:var(--added)]",
                kind === "del" && "text-[color:var(--deleted)]",
                kind === "header" && "text-muted-foreground/60",
              )}
            >
              {kind === "header" ? "@" : kind === "add" ? "+" : kind === "del" ? "−" : ""}
            </span>
            <span className="min-w-0 flex-1 whitespace-pre px-2">{text || " "}</span>
          </div>
        );
      })}
    </div>
  );
}

function CommentBody({ body }: { body: string }) {
  if (!body.trim()) {
    return (
      <div className="px-3 py-3 text-[11px] italic text-muted-foreground">Sem descrição.</div>
    );
  }
  return <Markdown className="px-3 py-3">{body}</Markdown>;
}

function ReviewForm({
  owner,
  repo,
  number,
  canApprove,
  onSubmitted,
}: {
  owner: string;
  repo: string;
  number: number;
  canApprove: boolean;
  onSubmitted: () => void;
}) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState<ReviewEvent | "comment" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const trimmed = body.trim();

  async function submitComment() {
    if (!trimmed) return;
    setSubmitting("comment");
    setErr(null);
    try {
      await github.createIssueComment(owner, repo, number, trimmed);
      setBody("");
      onSubmitted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(null);
    }
  }

  async function submitReview(event: Exclude<ReviewEvent, "">) {
    if (event !== "APPROVE" && !trimmed) {
      setErr("Body é obrigatório para esse tipo de review.");
      return;
    }
    setSubmitting(event);
    setErr(null);
    try {
      await github.createReview(owner, repo, number, event, trimmed, []);
      setBody("");
      onSubmitted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(null);
    }
  }

  const busy = submitting !== null;

  return (
    <div className="shrink-0 border-t border-border bg-card">
      <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Deixe um comentário ou review…"
          rows={3}
          className="text-[12px]"
          disabled={busy}
        />
        {err && (
          <div className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
            <AlertCircle className="mt-0.5 size-3 shrink-0" />
            <span className="min-w-0 flex-1 break-words">{err}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void submitComment()}
            disabled={busy || !trimmed}
          >
            {submitting === "comment" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Send className="size-3" />
            )}
            Comentar
          </Button>
          {canApprove && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void submitReview("APPROVE")}
              disabled={busy}
              className="border-[color:var(--added)]/40 text-[color:var(--added)] hover:bg-[color:var(--added)]/10"
            >
              {submitting === "APPROVE" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Check className="size-3" />
              )}
              Aprovar
            </Button>
          )}
          {canApprove && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void submitReview("REQUEST_CHANGES")}
              disabled={busy || !trimmed}
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              {submitting === "REQUEST_CHANGES" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <X className="size-3" />
              )}
              Pedir mudanças
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => void submitReview("COMMENT")}
            disabled={busy || !trimmed}
          >
            {submitting === "COMMENT" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <MessageSquare className="size-3" />
            )}
            Review
          </Button>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-2 border-r border-border px-3 font-medium uppercase tracking-[0.1em] transition-colors hover:bg-accent",
        active ? "bg-background text-foreground" : "text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function stateBadge(detail: PullRequestDetail): {
  label: string;
  classes: string;
  icon: typeof GitPullRequest;
} {
  if (detail.merged) {
    return {
      label: "Merged",
      classes:
        "border-[color:var(--branch-merged,#a371f7)]/40 bg-[color:var(--branch-merged,#a371f7)]/10 text-[color:var(--branch-merged,#a371f7)]",
      icon: GitMerge,
    };
  }
  if (detail.state === "closed") {
    return {
      label: "Fechado",
      classes: "border-destructive/40 bg-destructive/10 text-destructive",
      icon: GitPullRequestClosed,
    };
  }
  if (detail.draft) {
    return {
      label: "Draft",
      classes: "border-border bg-background/40 text-muted-foreground",
      icon: GitPullRequest,
    };
  }
  return {
    label: "Aberto",
    classes:
      "border-[color:var(--added)]/40 bg-[color:var(--added)]/10 text-[color:var(--added)]",
    icon: GitPullRequest,
  };
}

function reviewStateMeta(state: string): {
  label: string;
  toneClass: string;
  borderClass: string;
} {
  switch (state) {
    case "APPROVED":
      return {
        label: "aprovou",
        toneClass: "text-[color:var(--added)]",
        borderClass: "border-[color:var(--added)]/40",
      };
    case "CHANGES_REQUESTED":
      return {
        label: "pediu mudanças",
        toneClass: "text-destructive",
        borderClass: "border-destructive/40",
      };
    case "DISMISSED":
      return {
        label: "review descartada",
        toneClass: "text-muted-foreground",
        borderClass: "border-border",
      };
    default:
      return {
        label: "comentou",
        toneClass: "text-muted-foreground",
        borderClass: "border-border",
      };
  }
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

