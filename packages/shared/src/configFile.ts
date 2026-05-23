import {
  DEFAULT_LOCAL_TOKEN,
  normalizeConfig,
  type AppConfig,
  type ProxyProfile
} from "./profile";

export const CONFIG_FILE_APP = "Proxy2LocalAI";
export const CONFIG_FILE_SCHEMA_VERSION = 1;
export const TEMPLATE_PROJECT_DIR_PLACEHOLDER = "请在导入后填写本机项目路径";

export type ConfigExportMode = "backup" | "template";

export interface ConfigExportOptions {
  mode: ConfigExportMode;
}

export interface PortableAppConfig {
  bridgeBaseUrl: string;
  token?: string;
  profiles: ProxyProfile[];
}

export interface PortableConfigFile {
  app: typeof CONFIG_FILE_APP;
  schemaVersion: typeof CONFIG_FILE_SCHEMA_VERSION;
  mode: ConfigExportMode;
  exportedAt: string;
  config: PortableAppConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createTemplateProfile(profile: ProxyProfile): ProxyProfile {
  const { lastTestResult, ...rest } = profile;
  return {
    ...rest,
    enabled: false,
    projectDir: TEMPLATE_PROJECT_DIR_PLACEHOLDER
  };
}

export function createConfigExport(
  config: AppConfig,
  options: ConfigExportOptions = { mode: "backup" }
): PortableConfigFile {
  const normalized = normalizeConfig(config);
  const portableConfig: PortableAppConfig = options.mode === "template"
    ? {
        bridgeBaseUrl: normalized.bridgeBaseUrl,
        profiles: normalized.profiles.map(createTemplateProfile)
      }
    : normalized;

  return {
    app: CONFIG_FILE_APP,
    schemaVersion: CONFIG_FILE_SCHEMA_VERSION,
    mode: options.mode,
    exportedAt: new Date().toISOString(),
    config: portableConfig
  };
}

export function parseConfigImport(input: unknown): AppConfig {
  if (isRecord(input) && input.app === CONFIG_FILE_APP && input.config !== undefined) {
    if (input.schemaVersion !== CONFIG_FILE_SCHEMA_VERSION) {
      throw new Error(`不支持的配置文件版本: ${String(input.schemaVersion)}`);
    }
    return normalizeConfig(input.config);
  }

  const config = normalizeConfig(input);
  return {
    ...config,
    token: config.token || DEFAULT_LOCAL_TOKEN
  };
}
