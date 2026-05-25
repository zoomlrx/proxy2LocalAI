import type { AppConfig, ProxyProfile, RequestDiagnosticDetail, RequestDiagnosticSummary } from "@proxy2localai/shared";

export interface BridgeHealth {
  ok: boolean;
  service?: string;
  version?: string;
  protocolVersion?: number;
  profileCount?: number;
}

export interface BridgeDoctorCheck {
  id: string;
  label: string;
  status: "ok" | "warning" | "error";
  message: string;
  details?: Record<string, unknown>;
}

export interface BridgeDoctorReport {
  ok: boolean;
  service: string;
  generatedAt: string;
  summary: {
    port: number;
    profileCount: number;
    enabledProfileCount: number;
  };
  checks: BridgeDoctorCheck[];
}

export async function getBridgeHealth(config: Pick<AppConfig, "bridgeBaseUrl">): Promise<BridgeHealth> {
  const response = await fetch(new URL("/health", config.bridgeBaseUrl), {
    method: "GET"
  });
  if (!response.ok) {
    throw new Error(`Bridge health check failed: ${response.status}`);
  }
  return response.json() as Promise<BridgeHealth>;
}

export async function getBridgeDoctor(config: AppConfig): Promise<BridgeDoctorReport> {
  const response = await fetch(new URL("/doctor", config.bridgeBaseUrl), {
    method: "GET",
    headers: {
      "x-proxy2localai-token": config.token
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bridge 自检失败: ${response.status} ${text}`);
  }
  return response.json() as Promise<BridgeDoctorReport>;
}

export interface TestProfileSample {
  headers?: Record<string, string>;
  body?: unknown;
}

export interface TestProfileStage {
  id: string;
  status: string;
  message?: string;
  duration?: number;
}

export interface TestProfileResult {
  ok: boolean;
  stages: TestProfileStage[];
  preview?: string;
}

export async function testBridgeProfile(
  config: AppConfig,
  profileId: string,
  sample: TestProfileSample = {}
): Promise<TestProfileResult> {
  const response = await fetch(
    new URL(`/admin/test-profile/${encodeURIComponent(profileId)}`, config.bridgeBaseUrl),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-proxy2localai-token": config.token
      },
      body: JSON.stringify({ sample })
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`测试代理失败: ${response.status} ${text}`);
  }
  return response.json() as Promise<TestProfileResult>;
}

export async function testBridgeProfileDraft(
  config: AppConfig,
  profile: ProxyProfile,
  sample: TestProfileSample = {}
): Promise<TestProfileResult> {
  const response = await fetch(
    new URL("/admin/test-profile-draft", config.bridgeBaseUrl),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-proxy2localai-token": config.token
      },
      body: JSON.stringify({ profile, sample })
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`测试草稿代理失败: ${response.status} ${text}`);
  }
  return response.json() as Promise<TestProfileResult>;
}

export interface TestProviderResult {
  ok: boolean;
  provider?: string;
  output?: string | null;
  outputChars?: number;
  duration?: number;
  error?: string;
}

export async function testBridgeProvider(config: AppConfig, profileId: string): Promise<TestProviderResult> {
  const response = await fetch(
    new URL(`/admin/test-provider/${encodeURIComponent(profileId)}`, config.bridgeBaseUrl),
    {
      method: "POST",
      headers: { "x-proxy2localai-token": config.token }
    }
  );
  if (!response.ok) {
    throw new Error(`测试 provider 失败: ${response.status}`);
  }
  return response.json() as Promise<TestProviderResult>;
}

export async function getRecentDiagnostics(config: AppConfig): Promise<{ items: RequestDiagnosticSummary[] }> {
  const response = await fetch(new URL("/diagnostics/recent", config.bridgeBaseUrl), {
    method: "GET",
    headers: { "x-proxy2localai-token": config.token }
  });
  if (!response.ok) {
    throw new Error(`获取诊断记录失败: ${response.status}`);
  }
  return response.json() as Promise<{ items: RequestDiagnosticSummary[] }>;
}

export async function getDiagnosticDetail(config: AppConfig, requestId: string): Promise<RequestDiagnosticDetail> {
  const response = await fetch(
    new URL(`/diagnostics/recent/${encodeURIComponent(requestId)}`, config.bridgeBaseUrl),
    {
      method: "GET",
      headers: { "x-proxy2localai-token": config.token }
    }
  );
  if (!response.ok) {
    throw new Error(`获取诊断详情失败: ${response.status}`);
  }
  return response.json() as Promise<RequestDiagnosticDetail>;
}

export async function exportDiagnostic(config: AppConfig, requestId: string): Promise<string> {
  const response = await fetch(
    new URL(`/diagnostics/recent/${encodeURIComponent(requestId)}/export`, config.bridgeBaseUrl),
    {
      method: "GET",
      headers: { "x-proxy2localai-token": config.token }
    }
  );
  if (!response.ok) {
    throw new Error(`导出诊断失败: ${response.status}`);
  }
  return response.text();
}

export async function syncProfilesToBridge(config: AppConfig): Promise<void> {
  const response = await fetch(new URL("/admin/profiles", config.bridgeBaseUrl), {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-proxy2localai-token": config.token
    },
    body: JSON.stringify({
      profiles: config.profiles
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`同步 bridge 失败: ${response.status} ${text}`);
  }
}
