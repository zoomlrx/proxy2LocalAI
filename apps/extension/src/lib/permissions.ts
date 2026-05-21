import type { ProxyProfile } from "@proxy2localai/shared";

export async function requestProfilePermission(profile: ProxyProfile): Promise<boolean> {
  const origin = `${profile.targetOrigin}/*`;
  if (!chrome.permissions?.request) {
    return true;
  }
  return chrome.permissions.request({
    origins: [origin]
  });
}
