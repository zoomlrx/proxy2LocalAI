import { homedir, platform } from "node:os";
import { join } from "node:path";

export function getDefaultBridgeDataDir(): string {
  if (platform() === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Proxy2LocalAI");
  }

  if (platform() === "darwin") {
    return join(homedir(), "Library", "Application Support", "Proxy2LocalAI");
  }

  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "proxy2localai");
}
