import type { AppConfig } from "@proxy2localai/shared";
import { buildDynamicRules } from "./rules";

export interface DnrApi {
  getDynamicRules(): Promise<Array<{ id: number }>>;
  updateDynamicRules(options: {
    removeRuleIds?: number[];
    addRules?: chrome.declarativeNetRequest.Rule[];
  }): Promise<void>;
}

export async function applyDynamicRules(
  config: AppConfig,
  api: DnrApi = chrome.declarativeNetRequest
): Promise<void> {
  const existingRules = await api.getDynamicRules();
  const removeRuleIds = existingRules.map((rule) => rule.id);
  if (removeRuleIds.length > 0) {
    await api.updateDynamicRules({ removeRuleIds });
  }

  const addRules = buildDynamicRules(config);
  if (addRules.length > 0) {
    await api.updateDynamicRules({ addRules });
  }
}
