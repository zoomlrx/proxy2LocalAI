import {
  createEmptyConfig,
  normalizeConfig,
  type AppConfig
} from "@proxy2localai/shared";

export const STORAGE_KEY = "proxy2localai.config";

export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
}

export function createConfigStorage(area: StorageArea) {
  return {
    async load(): Promise<AppConfig> {
      const stored = await area.get(STORAGE_KEY);
      const raw = stored[STORAGE_KEY];
      if (!raw) {
        return createEmptyConfig();
      }
      return normalizeConfig(raw);
    },

    async save(config: unknown): Promise<AppConfig> {
      const normalized = normalizeConfig(config);
      await area.set({ [STORAGE_KEY]: normalized });
      return normalized;
    }
  };
}

export function getChromeConfigStorage() {
  return createConfigStorage(chrome.storage.local);
}
