import { Call } from "@wailsio/runtime";

const SERVICE = "main.Config";

function call<T>(method: string, ...args: unknown[]): Promise<T> {
  return Call.ByName(`${SERVICE}.${method}`, ...args) as Promise<T>;
}

export const config = {
  get: <T>(key: string, defaultValue: T) => call<T>("Get", key, defaultValue),
  set: (key: string, value: unknown) => call<void>("Set", key, value),
  reset: (key: string) => call<void>("Reset", key),
};

export const CONFIG_KEYS = {
  repoPaths: "repos.paths",
  repoOrg: "repos.org",
} as const;
