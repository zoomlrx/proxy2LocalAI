import type { AppConfig } from "@proxy2localai/shared";

export interface BridgeHealth {
  ok: boolean;
  service?: string;
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
