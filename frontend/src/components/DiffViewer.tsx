import { useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  FileText,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { DiffView, DiffModeEnum, SplitSide } from "@git-diff-view/react";
import { generateDiffFile } from "@git-diff-view/file";

import { Mascot } from "@/components/Mascot";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useSettings } from "@/lib/settings-store";
import { cn } from "@/lib/utils";
import type { DiffResult } from "@/lib/git";

const EMPTY_MESSAGES = [
  "Nada selecionado. Stashie está de boa.",
  "Selecione um arquivo para ver o diff.",
  "Quietinho aqui... cadê o diff?",
  "Aguardando ordens, capitão.",
  "Pode escolher um arquivo, sem pressa.",
];

const BINARY_MESSAGES = [
  "Arquivo binário — Stashie não consegue ler isso.",
  "Bytes demais, letras de menos.",
  "Diff binário não vai rolar dessa vez.",
];

const LOCK_MESSAGES = [
  "Arquivo .lock — Stashie não vai abrir essa caixa.",
  "Lockfile gigante, melhor pular pra não travar.",
  "Esse aqui é gerado automático, deixa quieto.",
];

function isLockFile(path: string): boolean {
  const base = path.split("/").pop()?.toLowerCase() ?? "";
  return base.endsWith(".lock") || base === "package-lock.json";
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface DiffComment {
  id: string | number;
  side: "LEFT" | "RIGHT";
  line: number;
  author: string;
  avatarUrl?: string;
  createdAt: string;
  body: string;
}

type CommentSubmit = (input: { line: number; side: "LEFT" | "RIGHT"; body: string }) => Promise<void>;

interface Props {
  diff: DiffResult | null;
  loading: boolean;
  comments?: DiffComment[];
  commentsEnabled?: boolean;
  onCreateComment?: CommentSubmit;
  marked?: boolean;
  onToggleMark?: () => void;
}

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  go: "go",
  rs: "rust",
  py: "python",
  json: "json",
  jsonc: "json",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
  md: "markdown",
  mdx: "markdown",
  html: "xml",
  htm: "xml",
  xml: "xml",
  svg: "xml",
  css: "css",
  scss: "scss",
  sass: "scss",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  sql: "sql",
  diff: "diff",
  patch: "diff",
  dockerfile: "dockerfile",
};

function ImageDiff({
  oldSrc,
  newSrc,
  status,
}: {
  oldSrc?: string;
  newSrc?: string;
  status: string;
}) {
  const showOnlyNew = !oldSrc && newSrc;
  const showOnlyOld = oldSrc && !newSrc;

  if (showOnlyNew || showOnlyOld) {
    const src = (showOnlyNew ? newSrc : oldSrc) as string;
    const label = showOnlyNew ? "Adicionado" : "Removido";
    const tone = showOnlyNew ? "var(--added)" : "var(--removed)";
    return (
      <div className="flex h-full w-full items-center justify-center overflow-auto p-6">
        <figure className="flex max-h-full flex-col items-center gap-2">
          <span
            className="text-[10px] font-medium uppercase tracking-[0.12em]"
            style={{ color: tone }}
          >
            {label}
          </span>
          <img
            src={src}
            alt={label}
            className="max-h-[70vh] max-w-full border border-border bg-[var(--checker)] object-contain"
            style={{
              backgroundImage:
                "linear-gradient(45deg, color-mix(in srgb, var(--muted) 50%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--muted) 50%, transparent) 75%), linear-gradient(45deg, color-mix(in srgb, var(--muted) 50%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--muted) 50%, transparent) 75%)",
              backgroundPosition: "0 0, 8px 8px",
              backgroundSize: "16px 16px",
            }}
          />
        </figure>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-start justify-center overflow-auto p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ImagePane src={oldSrc!} label="Antes" tone="var(--removed)" />
        <ImagePane src={newSrc!} label={status === "renamed" ? "Depois (renomeado)" : "Depois"} tone="var(--added)" />
      </div>
    </div>
  );
}

function ImagePane({ src, label, tone }: { src: string; label: string; tone: string }) {
  return (
    <figure className="flex flex-col items-center gap-2">
      <span
        className="text-[10px] font-medium uppercase tracking-[0.12em]"
        style={{ color: tone }}
      >
        {label}
      </span>
      <img
        src={src}
        alt={label}
        className="max-h-[60vh] max-w-full border border-border object-contain"
        style={{
          backgroundImage:
            "linear-gradient(45deg, color-mix(in srgb, var(--muted) 50%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--muted) 50%, transparent) 75%), linear-gradient(45deg, color-mix(in srgb, var(--muted) 50%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--muted) 50%, transparent) 75%)",
          backgroundPosition: "0 0, 8px 8px",
          backgroundSize: "16px 16px",
        }}
      />
    </figure>
  );
}

function inferLang(path: string): string {
  const base = path.split("/").pop() ?? path;
  if (base.toLowerCase() === "dockerfile") return "dockerfile";
  const ext = base.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext] ?? "plaintext";
}

export function DiffViewer({
  diff,
  loading,
  comments,
  commentsEnabled = false,
  onCreateComment,
  marked,
  onToggleMark,
}: Props) {
  const { settings } = useSettings();

  const lock = !!diff && isLockFile(diff.path);

  const diffFile = useMemo(() => {
    if (!diff || diff.isBinary || isLockFile(diff.path)) return null;
    const lang = inferLang(diff.path);
    const file = generateDiffFile(
      diff.path,
      diff.oldText,
      diff.path,
      diff.newText,
      lang,
      lang,
    );
    file.initTheme(settings.theme === "ultra-dark" ? "dark" : "light");
    file.init();
    if (settings.diffStyle === "split") file.buildSplitDiffLines();
    else file.buildUnifiedDiffLines();
    return file;
  }, [diff, settings.theme, settings.diffStyle]);


  const extendData = useMemo(() => {
    if (!commentsEnabled || !comments || comments.length === 0) return undefined;
    const oldFile: Record<string, { data: DiffComment[] }> = {};
    const newFile: Record<string, { data: DiffComment[] }> = {};
    for (const c of comments) {
      const target = c.side === "LEFT" ? oldFile : newFile;
      const key = String(c.line);
      if (!target[key]) target[key] = { data: [] };
      target[key].data.push(c);
    }
    return { oldFile, newFile };
  }, [comments, commentsEnabled]);

  const renderExtendLine = useMemo(() => {
    if (!commentsEnabled) return undefined;
    return ({ data }: { data: DiffComment[] }) => (
      <div className="flex flex-col gap-2 border-y border-border bg-background/40 px-3 py-2">
        {data.map((c) => (
          <InlineCommentRow key={c.id} comment={c} />
        ))}
      </div>
    );
  }, [commentsEnabled]);

  const renderWidgetLine = useMemo(() => {
    if (!commentsEnabled || !onCreateComment) return undefined;
    return ({
      side,
      lineNumber,
      onClose,
    }: {
      side: SplitSide;
      lineNumber: number;
      onClose: () => void;
    }) => (
      <div className="border-y border-border bg-background/40 px-3 py-2">
        <InlineComposer
          onCancel={onClose}
          onSubmit={async (body) => {
            await onCreateComment({
              line: lineNumber,
              side: side === SplitSide.old ? "LEFT" : "RIGHT",
              body,
            });
            onClose();
          }}
        />
      </div>
    );
  }, [commentsEnabled, onCreateComment]);

  const headerHeight = settings.compactMode ? "h-8" : "h-12";
  const diffStyle = {
    tabSize: settings.tabWidth,
    MozTabSize: settings.tabWidth,
  } as React.CSSProperties;

  const scrollRef = useRef<HTMLDivElement | null>(null);

  function jumpTo(end: boolean) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: end ? el.scrollHeight : 0, behavior: "smooth" });
  }

  return (
    <div
      className="flex h-full flex-1 flex-col"
      data-line-numbers={settings.showLineNumbers ? "on" : "off"}
      data-diff-style={settings.diffStyle}
      style={diffStyle}
    >
      {settings.showFileHeader && (
        <>
          <div className={`${headerHeight} flex items-center gap-2 px-3 text-sm font-semibold`}>
            <FileText className="size-4 text-muted-foreground" />
            {diff ? <span className="font-mono text-xs">{diff.path}</span> : "Diff"}
            {diff && (
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal uppercase text-muted-foreground">
                {diff.status}
              </span>
            )}
            {diffFile && (
              <span className="ml-auto flex items-center gap-2 font-mono text-[11px] tabular-nums">
                <span className="text-[color:var(--added)]">+{diffFile.additionLength}</span>
                <span className="text-[color:var(--deleted)]">−{diffFile.deletionLength}</span>
              </span>
            )}
            {diff && (
              <span className={cn("flex items-center gap-1", !diffFile && "ml-auto")}>
                {onToggleMark && (
                  <button
                    type="button"
                    onClick={onToggleMark}
                    className={cn(
                      "flex h-6 items-center gap-1 border px-2 text-[10px] uppercase tracking-[0.08em] transition-colors",
                      marked
                        ? "border-[color:var(--added)]/40 bg-[color:var(--added)]/10 text-[color:var(--added)] hover:bg-[color:var(--added)]/15"
                        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                    title={marked ? "Marcar como não visto" : "Marcar como visto"}
                    aria-pressed={marked}
                  >
                    <Check className="size-3" />
                    {marked ? "Visto" : "Marcar visto"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => jumpTo(false)}
                  className="flex size-6 items-center justify-center border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Ir ao início (Home)"
                  aria-label="Ir ao início"
                >
                  <ArrowUpToLine className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => jumpTo(true)}
                  className="flex size-6 items-center justify-center border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Ir ao fim (End)"
                  aria-label="Ir ao fim"
                >
                  <ArrowDownToLine className="size-3" />
                </button>
              </span>
            )}
          </div>
          <Separator />
        </>
      )}

      <div ref={scrollRef} className="flex-1 overflow-auto">
        {loading && (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Carregando diff…
          </div>
        )}
        {!loading && !diff && (
          <div className="flex h-full items-center justify-center">
            <Mascot message={pick(EMPTY_MESSAGES)} />
          </div>
        )}
        {!loading && diff && lock && (
          <div className="flex h-full items-center justify-center">
            <Mascot message={pick(LOCK_MESSAGES)} />
          </div>
        )}
        {!loading && diff && !lock && diff.isBinary && (diff.oldImage || diff.newImage) && (
          <ImageDiff oldSrc={diff.oldImage} newSrc={diff.newImage} status={diff.status} />
        )}
        {!loading && diff && !lock && diff.isBinary && !diff.oldImage && !diff.newImage && (
          <div className="flex h-full items-center justify-center">
            <Mascot message={pick(BINARY_MESSAGES)} />
          </div>
        )}
        {!loading && diffFile && (
          <DiffView<DiffComment[]>
            diffFile={diffFile}
            diffViewMode={settings.diffStyle === "split" ? DiffModeEnum.Split : DiffModeEnum.Unified}
            diffViewTheme={settings.theme === "ultra-dark" ? "dark" : "light"}
            diffViewFontSize={settings.diffFontSize}
            diffViewHighlight={settings.syntaxHighlight}
            diffViewWrap={settings.wrapLines}
            diffViewAddWidget={commentsEnabled && !!onCreateComment}
            extendData={extendData}
            renderExtendLine={renderExtendLine}
            renderWidgetLine={renderWidgetLine}
          />
        )}
      </div>
    </div>
  );
}

function InlineCommentRow({ comment }: { comment: DiffComment }) {
  return (
    <div className="border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-2 py-1 text-[11px]">
        {comment.avatarUrl && (
          <img
            src={comment.avatarUrl}
            alt=""
            className="size-4 rounded-full border border-border"
          />
        )}
        <span className="font-medium">{comment.author}</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {formatRelativeShort(comment.createdAt)}
        </span>
      </div>
      <Markdown className="px-2 py-1.5">{comment.body}</Markdown>
    </div>
  );
}

function InlineComposer({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const trimmed = body.trim();

  async function submit() {
    if (!trimmed) return;
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(trimmed);
      setBody("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-border bg-card p-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Comentário inline…"
        rows={3}
        className="text-[12px]"
        disabled={busy}
        autoFocus
      />
      {err && <p className="mt-1 text-[11px] text-destructive">{err}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          <X className="size-3" />
          Cancelar
        </Button>
        <Button size="sm" onClick={() => void submit()} disabled={busy || !trimmed}>
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
          Enviar
        </Button>
      </div>
    </div>
  );
}

function formatRelativeShort(iso: string): string {
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
