import type { AppConfig, ProxyProfile } from "@proxy2localai/shared";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ruleIdForIndex(index: number): number {
  return index + 1;
}

function methodForDnr(method: string): chrome.declarativeNetRequest.RequestMethod {
  return method.toLowerCase() as chrome.declarativeNetRequest.RequestMethod;
}

function buildRule(
  profile: ProxyProfile,
  index: number,
  bridgeUrl: URL,
  token: string
): chrome.declarativeNetRequest.Rule {
  const targetUrl = new URL(profile.targetOrigin);
  const localPath = `/proxy/${encodeURIComponent(profile.id)}`;
  const port = bridgeUrl.port || (bridgeUrl.protocol === "https:" ? "443" : "80");

  return {
    id: ruleIdForIndex(index),
    priority: 1,
    action: {
      type: "redirect" as chrome.declarativeNetRequest.RuleActionType,
      redirect: {
        transform: {
          scheme: bridgeUrl.protocol.replace(":", ""),
          host: bridgeUrl.hostname,
          port,
          path: localPath,
          queryTransform: {
            addOrReplaceParams: [
              {
                key: "token",
                value: token
              }
            ]
          }
        }
      }
    },
    condition: {
      requestDomains: [targetUrl.hostname],
      regexFilter: `^${escapeRegExp(profile.targetOrigin)}${escapeRegExp(profile.targetPath)}(?:\\?.*)?$`,
      requestMethods: profile.methods.map(methodForDnr),
      resourceTypes: [
        "xmlhttprequest" as chrome.declarativeNetRequest.ResourceType
      ]
    }
  };
}

export function buildDynamicRules(config: AppConfig): chrome.declarativeNetRequest.Rule[] {
  const bridgeUrl = new URL(config.bridgeBaseUrl);
  return config.profiles
    .filter((profile) => profile.enabled)
    .map((profile, index) => buildRule(profile, index, bridgeUrl, config.token));
}
