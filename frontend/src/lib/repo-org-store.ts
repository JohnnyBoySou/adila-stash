import { create } from "zustand";

import { config, CONFIG_KEYS } from "@/lib/config";

const LEGACY_STORAGE_KEY = "stash:repo-org";

export interface Collection {
  id: string;
  name: string;
  order: number;
  collapsed: boolean;
}

interface PersistedShape {
  collections: Collection[];
  pinned: string[];
  assignments: Record<string, string>;
  uncategorizedCollapsed: boolean;
  sidebarCollapsed: boolean;
}

interface RepoOrgState extends PersistedShape {
  hydrated: boolean;

  togglePin: (path: string) => void;
  isPinned: (path: string) => boolean;

  createCollection: (name: string) => string;
  renameCollection: (id: string, name: string) => void;
  deleteCollection: (id: string) => void;
  toggleCollapsed: (id: string | null) => void;
  reorderCollection: (id: string, dir: "up" | "down") => void;

  assignToCollection: (path: string, collectionId: string | null) => void;
  cleanupForPaths: (existingPaths: string[]) => void;

  toggleSidebar: () => void;

  hydrate: () => Promise<void>;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const DEFAULTS: PersistedShape = {
  collections: [],
  pinned: [],
  assignments: {},
  uncategorizedCollapsed: false,
  sidebarCollapsed: false,
};

function snapshot(state: RepoOrgState): PersistedShape {
  return {
    collections: state.collections,
    pinned: state.pinned,
    assignments: state.assignments,
    uncategorizedCollapsed: state.uncategorizedCollapsed,
    sidebarCollapsed: state.sidebarCollapsed,
  };
}

function normalize(raw: unknown): PersistedShape | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<PersistedShape>;
  return {
    collections: Array.isArray(r.collections) ? r.collections : [],
    pinned: Array.isArray(r.pinned) ? r.pinned : [],
    assignments:
      r.assignments && typeof r.assignments === "object"
        ? (r.assignments as Record<string, string>)
        : {},
    uncategorizedCollapsed: Boolean(r.uncategorizedCollapsed),
    sidebarCollapsed: Boolean(r.sidebarCollapsed),
  };
}

export const useRepoOrgStore = create<RepoOrgState>()((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  togglePin: (path) =>
    set((s) => ({
      pinned: s.pinned.includes(path)
        ? s.pinned.filter((p) => p !== path)
        : [...s.pinned, path],
    })),

  isPinned: (path) => get().pinned.includes(path),

  createCollection: (name) => {
    const id = genId();
    set((s) => ({
      collections: [
        ...s.collections,
        { id, name: name.trim(), order: s.collections.length, collapsed: false },
      ],
    }));
    return id;
  },

  renameCollection: (id, name) =>
    set((s) => ({
      collections: s.collections.map((c) =>
        c.id === id ? { ...c, name: name.trim() } : c,
      ),
    })),

  deleteCollection: (id) =>
    set((s) => {
      const nextAssignments = { ...s.assignments };
      for (const [path, cid] of Object.entries(nextAssignments)) {
        if (cid === id) delete nextAssignments[path];
      }
      return {
        collections: s.collections
          .filter((c) => c.id !== id)
          .map((c, i) => ({ ...c, order: i })),
        assignments: nextAssignments,
      };
    }),

  toggleCollapsed: (id) =>
    set((s) => {
      if (id === null) {
        return { uncategorizedCollapsed: !s.uncategorizedCollapsed };
      }
      return {
        collections: s.collections.map((c) =>
          c.id === id ? { ...c, collapsed: !c.collapsed } : c,
        ),
      };
    }),

  reorderCollection: (id, dir) =>
    set((s) => {
      const sorted = [...s.collections].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((c) => c.id === id);
      if (idx < 0) return {};
      const swap = dir === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= sorted.length) return {};
      [sorted[idx], sorted[swap]] = [sorted[swap], sorted[idx]];
      return { collections: sorted.map((c, i) => ({ ...c, order: i })) };
    }),

  assignToCollection: (path, collectionId) =>
    set((s) => {
      const next = { ...s.assignments };
      if (collectionId === null) {
        delete next[path];
      } else {
        next[path] = collectionId;
      }
      return { assignments: next };
    }),

  cleanupForPaths: (existingPaths) =>
    set((s) => {
      const known = new Set(existingPaths);
      const nextAssignments: Record<string, string> = {};
      for (const [path, cid] of Object.entries(s.assignments)) {
        if (known.has(path)) nextAssignments[path] = cid;
      }
      return {
        assignments: nextAssignments,
        pinned: s.pinned.filter((p) => known.has(p)),
      };
    }),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  hydrate: async () => {
    if (get().hydrated) return;

    try {
      const persisted = await config.get<unknown>(CONFIG_KEYS.repoOrg, null);
      const data = normalize(persisted);
      if (data) {
        set({ ...data, hydrated: true });
        return;
      }
    } catch {
      /* ignore */
    }

    // Migração: se houver dados antigos no localStorage (legado do Zustand
    // persist), importa de uma vez e limpa.
    try {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy) as { state?: PersistedShape } | PersistedShape;
        const inner =
          parsed && typeof parsed === "object" && "state" in parsed
            ? (parsed as { state?: unknown }).state
            : parsed;
        const data = normalize(inner);
        if (data) {
          set({ ...data, hydrated: true });
          void config.set(CONFIG_KEYS.repoOrg, data).catch(() => undefined);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          return;
        }
      }
    } catch {
      /* ignore */
    }

    set({ hydrated: true });
  },
}));

// Auto-persist: depois da hidratação, qualquer mudança nos campos persistidos
// é gravada no Config do Go (debounce na própria camada Go via saveLoop).
let lastSnapshot: string | null = null;
useRepoOrgStore.subscribe((state) => {
  if (!state.hydrated) return;
  const snap = snapshot(state);
  const serialized = JSON.stringify(snap);
  if (serialized === lastSnapshot) return;
  lastSnapshot = serialized;
  void config.set(CONFIG_KEYS.repoOrg, snap).catch(() => undefined);
});
