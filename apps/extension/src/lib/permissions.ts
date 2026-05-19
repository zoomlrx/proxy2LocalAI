import type { ProxyProfile } from "@web2LocalAgent/shared";

export async function requestProfilePermission(profile: ProxyProfile): Promise<boolean> {
  const origin = `${profile.targetOrigin}/*`;
  if (!chrome.permissions?.request) {
    return true;
  }
  return chrome.permissions.request({
    origins: [origin]
  });
}
