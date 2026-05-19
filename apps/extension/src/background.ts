import { getChromeConfigStorage, STORAGE_KEY } from "./lib/storage";
import { syncBridgeThenApplyRules } from "./lib/sync";

async function refreshProxyState(): Promise<void> {
  const storage = getChromeConfigStorage();
  const config = await storage.load();
  try {
    await syncBridgeThenApplyRules(config);
  } catch {
    // Bridge 可能尚未启动，页面里会显示更具体的状态。
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void refreshProxyState();
});

chrome.runtime.onStartup.addListener(() => {
  void refreshProxyState();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STORAGE_KEY]) {
    void refreshProxyState();
  }
});
