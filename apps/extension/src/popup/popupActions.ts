import type { AppConfig, ProxyProfile } from "@proxy2localai/shared";

export interface PopupToggleDependencies {
  requestPermission(profile: ProxyProfile): Promise<boolean>;
  sync(config: AppConfig): Promise<void>;
  save(config: AppConfig): Promise<AppConfig>;
}

export interface PopupToggleResult {
  ok: boolean;
  config: AppConfig;
  message: string;
}

export async function toggleProfileEnabledTransaction(
  config: AppConfig,
  profileId: string,
  dependencies: PopupToggleDependencies
): Promise<PopupToggleResult> {
  const target = config.profiles.find((profile) => profile.id === profileId);
  if (!target) {
    return { ok: false, config, message: "未找到 Profile" };
  }

  const nextProfile = { ...target, enabled: !target.enabled };
  if (nextProfile.enabled) {
    const granted = await dependencies.requestPermission(nextProfile);
    if (!granted) {
      return { ok: false, config, message: "目标域名权限未授予" };
    }
  }

  const nextConfig = {
    ...config,
    profiles: config.profiles.map((profile) => profile.id === profileId ? nextProfile : profile)
  };

  try {
    await dependencies.sync(nextConfig);
    const saved = await dependencies.save(nextConfig);
    return {
      ok: true,
      config: saved,
      message: nextProfile.enabled ? "已启用代理" : "已停用代理"
    };
  } catch (error) {
    try {
      await dependencies.sync(config);
      await dependencies.save(config);
    } catch {
      // 保持原错误信息；回滚失败时 UI 仍回到原配置，用户可重新同步。
    }
    return {
      ok: false,
      config,
      message: error instanceof Error ? `切换失败，已保留原状态：${error.message}` : "切换失败，已保留原状态"
    };
  }
}
