import { useShallow } from "zustand/react/shallow";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme =
  | "ultra-dark"
  | "ultra-white"
  | "off-white"
  | "ultra-deep"
  | "ultra-aqua";
export type MonoFont = "google" | "jetbrains" | "fira" | "ibm" | "system";
export type DiffStyle = "unified" | "split" | "inline" | "collapsed";
export type FontSize = 12 | 13 | 14 | 15;
export type TabWidth = 2 | 4 | 8;
export type WindowOpacity = 0.5 | 0.6 | 0.7 | 0.75 | 0.8 | 0.85 | 0.9 | 0.95 | 1;
export type WindowBlur = 0 | 4 | 8 | 12 | 16 | 24 | 32 | 48;
export type Radius = 0 | 2 | 4 | 6;
export type AccentTint = "neutral" | "cool" | "warm" | "violet";

export interface Settings {
  theme: Theme;
  monoFont: MonoFont;
  windowOpacity: WindowOpacity;
  windowBlur: WindowBlur;
  radius: Radius;
  accentTint: AccentTint;
  reduceMotion: boolean;
  diffFontSize: FontSize;
  diffStyle: DiffStyle;
  showLineNumbers: boolean;
  wrapLines: boolean;
  syntaxHighlight: boolean;
  tabWidth: TabWidth;
  showFileHeader: boolean;
  compactMode: boolean;
}

const DEFAULTS: Settings = {
  theme: "ultra-dark",
  monoFont: "google",
  windowOpacity: 0.85,
  windowBlur: 24,
  radius: 0,
  accentTint: "neutral",
  reduceMotion: false,
  diffFontSize: 12,
  diffStyle: "unified",
  showLineNumbers: true,
  wrapLines: false,
  syntaxHighlight: true,
  tabWidth: 2,
  showFileHeader: true,
  compactMode: false,
};

const MONO_STACKS: Record<MonoFont, string> = {
  google: '"Google Sans Code", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  jetbrains: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  fira: '"Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace',
  ibm: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  system: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

export const MONO_FONT_LABELS: Record<MonoFont, string> = {
  google: "Google Sans Code",
  jetbrains: "JetBrains Mono",
  fira: "Fira Code",
  ibm: "IBM Plex Mono",
  system: "Sistema",
};

interface SettingsState extends Settings {
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      update: (key, value) => set({ [key]: value } as Pick<Settings, typeof key>),
      reset: () => set(DEFAULTS),
    }),
    {
      name: "stash:settings",
      version: 4,
      migrate: (persisted, fromVersion) => {
        if (fromVersion < 2 && persisted && typeof persisted === "object") {
          return { ...DEFAULTS, ...(persisted as Partial<Settings>), monoFont: "google" };
        }
        if (fromVersion < 4 && persisted && typeof persisted === "object") {
          const { sansFont: _sansFont, uiFontSize: _uiFontSize, ...rest } =
            persisted as Partial<Settings> & { sansFont?: unknown; uiFontSize?: unknown };
          return { ...DEFAULTS, ...rest };
        }
        return persisted as Settings;
      },
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(([k]) => k in DEFAULTS),
        ) as Settings,
    },
  ),
);

const ACCENT_TINTS: Record<AccentTint, { hue: number; chroma: number }> = {
  neutral: { hue: 0, chroma: 0 },
  cool: { hue: 240, chroma: 0.04 },
  warm: { hue: 50, chroma: 0.04 },
  violet: { hue: 300, chroma: 0.05 },
};

function applySettings(s: Settings) {
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  const stack = MONO_STACKS[s.monoFont];
  root.style.setProperty("--font-mono", stack);
  root.style.setProperty("--font-sans", stack);
  root.style.setProperty("--window-bg-alpha", String(s.windowOpacity));
  root.style.setProperty("--window-blur", `${s.windowBlur}px`);
  root.style.setProperty("--radius", `${s.radius}px`);

  const tint = ACCENT_TINTS[s.accentTint];
  const isDarkTheme = s.theme === "ultra-dark" || s.theme === "ultra-deep";
  const isOffWhite = s.theme === "off-white";
  const isAqua = s.theme === "ultra-aqua";
  if (tint.chroma === 0) {
    const neutralAccent = isDarkTheme
      ? s.theme === "ultra-deep"
        ? "oklch(0.18 0.04 250)"
        : "oklch(0.14 0 0)"
      : isOffWhite
        ? "oklch(0.9 0.005 85)"
        : isAqua
          ? "oklch(0.9 0.04 220)"
          : "oklch(0.93 0 0)";
    root.style.setProperty("--accent", neutralAccent);
  } else {
    const l = isDarkTheme ? 0.16 : isOffWhite ? 0.88 : isAqua ? 0.88 : 0.91;
    root.style.setProperty("--accent", `oklch(${l} ${tint.chroma} ${tint.hue})`);
  }

  root.dataset.reduceMotion = s.reduceMotion ? "true" : "false";
}

if (typeof document !== "undefined") {
  applySettings(useSettingsStore.getState());
  useSettingsStore.subscribe((state) => applySettings(state));
}

export function useSettings() {
  const settings = useSettingsStore(
    useShallow((s) => ({
      theme: s.theme,
      monoFont: s.monoFont,
      windowOpacity: s.windowOpacity,
      windowBlur: s.windowBlur,
      radius: s.radius,
      accentTint: s.accentTint,
      reduceMotion: s.reduceMotion,
      diffFontSize: s.diffFontSize,
      diffStyle: s.diffStyle,
      showLineNumbers: s.showLineNumbers,
      wrapLines: s.wrapLines,
      syntaxHighlight: s.syntaxHighlight,
      tabWidth: s.tabWidth,
      showFileHeader: s.showFileHeader,
      compactMode: s.compactMode,
    })),
  );
  const update = useSettingsStore((s) => s.update);
  const reset = useSettingsStore((s) => s.reset);
  return { settings, update, reset };
}
