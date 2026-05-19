import type { AppConfig } from "@proxy2localai/shared";
import { syncProfilesToBridge } from "./bridgeApi";
import { applyDynamicRules } from "./dnr";

export interface SyncDependencies {
  syncProfiles(config: AppConfig): Promise<void>;
  applyRules(config: AppConfig): Promise<void>;
}

export async function syncBridgeThenApplyRules(
  config: AppConfig,
  dependencies: SyncDependencies = {
    syncProfiles: syncProfilesToBridge,
    applyRules: applyDynamicRules
  }
): Promise<void> {
  await dependencies.syncProfiles(config);
  await dependencies.applyRules(config);
}
