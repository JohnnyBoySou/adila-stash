import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { config, CONFIG_KEYS } from "@/lib/config";
import {
  extractErrorMessage,
  git,
  type AheadBehind,
  type BranchInfo,
  type CommitDiffResult,
  type CommitInfo,
  type DiffResult,
  type FileChange,
  type RemoteInfo,
  type RepoInfo,
  type StatusResult,
} from "@/lib/git";
import { useRepoOrgStore } from "@/lib/repo-org-store";

const LEGACY_STORAGE_KEY = "stash:repos";

type RepoContextValue = {
  repos: RepoInfo[];
  hydrated: boolean;
  activePath: string | null;
  activeRepo: RepoInfo | null;

  status: StatusResult | null;
  statusBusy: boolean;

  commits: CommitInfo[];
  logBusy: boolean;

  selectedFile: FileChange | null;
  setSelectedFile: (f: FileChange | null) => void;
  diff: DiffResult | null;
  diffBusy: boolean;

  selectedCommit: CommitInfo | null;
  setSelectedCommit: (c: CommitInfo | null) => void;
  commitDiff: CommitDiffResult | null;
  commitDiffBusy: boolean;

  branches: BranchInfo[];
  branchesBusy: boolean;
  remote: RemoteInfo | null;
  currentAheadBehind: AheadBehind | null;

  error: string | null;

  setActivePath: (path: string | null) => void;
  addRepo: (path: string) => Promise<void>;
  removeRepo: (path: string) => void;
  stage: (f: FileChange) => Promise<void>;
  unstage: (f: FileChange) => Promise<void>;
  commit: (message: string) => Promise<void>;
  refreshBranches: () => Promise<void>;
  checkoutBranch: (name: string) => Promise<void>;
  createBranch: (name: string, checkout: boolean) => Promise<void>;
  pushCurrent: () => Promise<void>;
  stashChanges: (message?: string) => Promise<void>;
  discardChanges: () => Promise<void>;
  discardFile: (f: FileChange) => Promise<void>;
  stageMany: (files: FileChange[]) => Promise<void>;
  unstageMany: (files: FileChange[]) => Promise<void>;
  discardMany: (files: FileChange[]) => Promise<void>;
};

const RepoContext = createContext<RepoContextValue | null>(null);

export function RepoProvider({ children }: { children: ReactNode }) {
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [activePath, setActivePath] = useState<string | null>(null);

  const [status, setStatus] = useState<StatusResult | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [logBusy, setLogBusy] = useState(false);

  const [selectedFile, setSelectedFile] = useState<FileChange | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffBusy, setDiffBusy] = useState(false);

  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null);
  const [commitDiff, setCommitDiff] = useState<CommitDiffResult | null>(null);
  const [commitDiffBusy, setCommitDiffBusy] = useState(false);

  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [branchesBusy, setBranchesBusy] = useState(false);
  const [remote, setRemote] = useState<RemoteInfo | null>(null);
  const [currentAheadBehind, setCurrentAheadBehind] = useState<AheadBehind | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void useRepoOrgStore.getState().hydrate();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let paths: string[] = [];
      try {
        paths = await config.get<string[]>(CONFIG_KEYS.repoPaths, []);
      } catch {
        paths = [];
      }

      if (paths.length === 0) {
        try {
          const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacy) {
            const parsed = JSON.parse(legacy) as string[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              paths = parsed;
              void config.set(CONFIG_KEYS.repoPaths, paths).catch(() => undefined);
              localStorage.removeItem(LEGACY_STORAGE_KEY);
            }
          }
        } catch {
          /* ignore */
        }
      }

      if (paths.length === 0) {
        if (!cancelled) setHydrated(true);
        return;
      }

      const results = await Promise.allSettled(paths.map((p) => git.openRepo(p)));
      if (cancelled) return;
      const opened = results
        .filter((r): r is PromiseFulfilledResult<RepoInfo> => r.status === "fulfilled")
        .map((r) => r.value);
      setRepos(opened);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void config
      .set(CONFIG_KEYS.repoPaths, repos.map((r) => r.path))
      .catch(() => undefined);
  }, [repos, hydrated]);

  const activeRepo = useMemo(
    () => repos.find((r) => r.path === activePath) ?? null,
    [repos, activePath],
  );

  const refreshStatus = useCallback(async (path: string) => {
    setStatusBusy(true);
    try {
      setStatus(await git.status(path));
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setStatusBusy(false);
    }
  }, []);

  const refreshLog = useCallback(async (path: string) => {
    setLogBusy(true);
    try {
      setCommits(await git.log(path, 200));
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setLogBusy(false);
    }
  }, []);

  const refreshBranchesFor = useCallback(async (path: string) => {
    setBranchesBusy(true);
    try {
      const list = await git.branches(path);
      setBranches(list);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBranchesBusy(false);
    }
  }, []);

  const refreshRemote = useCallback(async (path: string) => {
    try {
      const info = await git.remoteInfo(path);
      setRemote(info);
    } catch {
      setRemote(null);
    }
  }, []);

  useEffect(() => {
    if (!activePath) {
      setBranches([]);
      setRemote(null);
      setCurrentAheadBehind(null);
      return;
    }
    setSelectedFile(null);
    setSelectedCommit(null);
    setDiff(null);
    setCommitDiff(null);
    void refreshStatus(activePath);
    void refreshLog(activePath);
    void refreshBranchesFor(activePath);
    void refreshRemote(activePath);
  }, [activePath, refreshStatus, refreshLog, refreshBranchesFor, refreshRemote]);

  useEffect(() => {
    if (!activePath) {
      setCurrentAheadBehind(null);
      return;
    }
    const current = branches.find((b) => b.isCurrent);
    if (!current?.upstream) {
      setCurrentAheadBehind(null);
      return;
    }
    let cancelled = false;
    git
      .aheadBehind(activePath, current.upstream, current.name)
      .then((ab) => {
        if (!cancelled) setCurrentAheadBehind(ab);
      })
      .catch(() => {
        if (!cancelled) setCurrentAheadBehind(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activePath, branches, commits]);

  useEffect(() => {
    if (!activePath || !selectedCommit) {
      setCommitDiff(null);
      return;
    }
    setCommitDiffBusy(true);
    let cancelled = false;
    git
      .commitDiff(activePath, selectedCommit.hash)
      .then((d) => {
        if (!cancelled) setCommitDiff(d);
      })
      .catch((e) => {
        if (!cancelled) setError(extractErrorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setCommitDiffBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activePath, selectedCommit]);

  useEffect(() => {
    if (!activePath || !selectedFile) {
      setDiff(null);
      return;
    }
    setDiffBusy(true);
    let cancelled = false;
    git
      .fileDiff(activePath, selectedFile.path, selectedFile.staged)
      .then((d) => {
        if (!cancelled) setDiff(d);
      })
      .catch((e) => {
        if (!cancelled) setError(extractErrorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setDiffBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activePath, selectedFile]);

  const addRepo = useCallback(async (path: string) => {
    const info = await git.openRepo(path);
    setRepos((prev) => {
      const existing = prev.findIndex((r) => r.path === info.path);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = info;
        return next;
      }
      return [...prev, info];
    });
    setActivePath(info.path);
  }, []);

  const removeRepo = useCallback(
    (path: string) => {
      void git.closeRepo(path).catch(() => undefined);
      setRepos((prev) => prev.filter((r) => r.path !== path));
      if (activePath === path) {
        setActivePath((prev) => {
          const remaining = repos.filter((r) => r.path !== prev);
          return remaining[0]?.path ?? null;
        });
      }
    },
    [activePath, repos],
  );

  const stage = useCallback(
    async (f: FileChange) => {
      if (!activePath) return;
      await git.stage(activePath, f.path);
      await refreshStatus(activePath);
    },
    [activePath, refreshStatus],
  );

  const unstage = useCallback(
    async (f: FileChange) => {
      if (!activePath) return;
      await git.unstage(activePath, f.path);
      await refreshStatus(activePath);
    },
    [activePath, refreshStatus],
  );

  const commit = useCallback(
    async (message: string) => {
      if (!activePath) return;
      await git.commit(activePath, message);
      await Promise.all([refreshStatus(activePath), refreshLog(activePath)]);
      setSelectedFile(null);
    },
    [activePath, refreshStatus, refreshLog],
  );

  const refreshBranches = useCallback(async () => {
    if (!activePath) return;
    await refreshBranchesFor(activePath);
  }, [activePath, refreshBranchesFor]);

  const reloadActiveRepo = useCallback(async (path: string) => {
    try {
      const info = await git.openRepo(path);
      setRepos((prev) => prev.map((r) => (r.path === path ? info : r)));
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  }, []);

  const checkoutBranch = useCallback(
    async (name: string) => {
      if (!activePath) return;
      await git.checkout(activePath, name);
      await Promise.all([
        refreshStatus(activePath),
        refreshLog(activePath),
        refreshBranchesFor(activePath),
        reloadActiveRepo(activePath),
      ]);
    },
    [activePath, refreshStatus, refreshLog, refreshBranchesFor, reloadActiveRepo],
  );

  const createBranch = useCallback(
    async (name: string, checkout: boolean) => {
      if (!activePath) return;
      await git.createBranch(activePath, name, checkout);
      await refreshBranchesFor(activePath);
      if (checkout) {
        await Promise.all([
          refreshStatus(activePath),
          refreshLog(activePath),
          reloadActiveRepo(activePath),
        ]);
      }
    },
    [activePath, refreshBranchesFor, refreshStatus, refreshLog, reloadActiveRepo],
  );

  const pushCurrent = useCallback(async () => {
    if (!activePath || !activeRepo) return;
    await git.push(activePath, activeRepo.currentBranch);
    await refreshBranchesFor(activePath);
    setCurrentAheadBehind({ ahead: 0, behind: 0 });
  }, [activePath, activeRepo, refreshBranchesFor]);

  const stashChanges = useCallback(
    async (message = "") => {
      if (!activePath) return;
      await git.stashPush(activePath, message);
      await Promise.all([refreshStatus(activePath), reloadActiveRepo(activePath)]);
    },
    [activePath, refreshStatus, reloadActiveRepo],
  );

  const discardChanges = useCallback(async () => {
    if (!activePath) return;
    await git.discardLocalChanges(activePath);
    await Promise.all([refreshStatus(activePath), reloadActiveRepo(activePath)]);
  }, [activePath, refreshStatus, reloadActiveRepo]);

  const discardFile = useCallback(
    async (f: FileChange) => {
      if (!activePath) return;
      const untracked = f.status === "untracked";
      await git.discardFile(activePath, f.path, untracked);
      await Promise.all([refreshStatus(activePath), reloadActiveRepo(activePath)]);
      setSelectedFile((prev) =>
        prev && prev.path === f.path && prev.staged === f.staged ? null : prev,
      );
    },
    [activePath, refreshStatus, reloadActiveRepo],
  );

  const stageMany = useCallback(
    async (files: FileChange[]) => {
      if (!activePath || files.length === 0) return;
      await git.stageFiles(activePath, files.map((f) => f.path));
      await refreshStatus(activePath);
    },
    [activePath, refreshStatus],
  );

  const unstageMany = useCallback(
    async (files: FileChange[]) => {
      if (!activePath || files.length === 0) return;
      await git.unstageFiles(activePath, files.map((f) => f.path));
      await refreshStatus(activePath);
    },
    [activePath, refreshStatus],
  );

  const discardMany = useCallback(
    async (files: FileChange[]) => {
      if (!activePath || files.length === 0) return;
      const tracked: string[] = [];
      const untracked: string[] = [];
      for (const f of files) {
        if (f.status === "untracked") untracked.push(f.path);
        else tracked.push(f.path);
      }
      await git.discardFiles(activePath, tracked, untracked);
      await Promise.all([refreshStatus(activePath), reloadActiveRepo(activePath)]);
      const removed = new Set(files.map((f) => `${f.staged ? "s" : "u"}:${f.path}`));
      setSelectedFile((prev) =>
        prev && removed.has(`${prev.staged ? "s" : "u"}:${prev.path}`) ? null : prev,
      );
    },
    [activePath, refreshStatus, reloadActiveRepo],
  );

  const value = useMemo<RepoContextValue>(
    () => ({
      repos,
      hydrated,
      activePath,
      activeRepo,
      status,
      statusBusy,
      commits,
      logBusy,
      selectedFile,
      setSelectedFile,
      diff,
      diffBusy,
      selectedCommit,
      setSelectedCommit,
      commitDiff,
      commitDiffBusy,
      branches,
      branchesBusy,
      remote,
      currentAheadBehind,
      error,
      setActivePath,
      addRepo,
      removeRepo,
      stage,
      unstage,
      commit,
      refreshBranches,
      checkoutBranch,
      createBranch,
      pushCurrent,
      stashChanges,
      discardChanges,
      discardFile,
      stageMany,
      unstageMany,
      discardMany,
    }),
    [
      repos,
      hydrated,
      activePath,
      activeRepo,
      status,
      statusBusy,
      commits,
      logBusy,
      selectedFile,
      diff,
      diffBusy,
      selectedCommit,
      commitDiff,
      commitDiffBusy,
      branches,
      branchesBusy,
      remote,
      currentAheadBehind,
      error,
      addRepo,
      removeRepo,
      stage,
      unstage,
      commit,
      refreshBranches,
      checkoutBranch,
      createBranch,
      pushCurrent,
      stashChanges,
      discardChanges,
      discardFile,
      stageMany,
      unstageMany,
      discardMany,
    ],
  );

  return <RepoContext value={value}>{children}</RepoContext>;
}

export function useRepo() {
  const ctx = use(RepoContext);
  if (!ctx) throw new Error("useRepo must be used inside <RepoProvider>");
  return ctx;
}
