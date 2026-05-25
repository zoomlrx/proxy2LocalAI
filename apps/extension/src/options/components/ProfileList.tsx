import React from "react";
import { Plus, FlaskConical } from "lucide-react";
import type { ProxyProfile } from "@proxy2localai/shared";
import { Button, Panel, Pill, ToggleSwitch, cx } from "../../ui/components";

interface ProfileListProps {
  profiles: ProxyProfile[];
  selectedId: string | null;
  onSelect: (profile: ProxyProfile) => void;
  onAdd: () => void;
  onToggleEnabled: (profile: ProxyProfile) => void;
}

function getResponseTone(responseMode: ProxyProfile["responseMode"]) {
  if (responseMode === "stream" || responseMode === "mapped_sse") {
    return "info" as const;
  }
  if (responseMode === "custom_json") {
    return "warning" as const;
  }
  return "default" as const;
}

export function ProfileList({ profiles, selectedId, onSelect, onAdd, onToggleEnabled }: ProfileListProps) {
  return (
    <Panel className="grid gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-console-strong">代理规则</h2>
          <p className="mt-1 text-sm leading-6 text-console-subtle">启停、选择和测试常用规则；完整字段在下方编辑区分层展开。</p>
        </div>
        <Button type="button" icon={<Plus size={16} aria-hidden="true" />} onClick={onAdd}>
          新增
        </Button>
      </div>

      {profiles.length === 0 ? (
        <div className="rounded-console border border-dashed border-console-border-strong bg-console-muted p-4">
          <strong className="text-sm text-console-strong">还没有配置</strong>
          <p className="mt-1 text-sm leading-6 text-console-subtle">建议从创建向导开始，粘贴 cURL 后完成测试和保存。</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-console-border text-xs font-bold text-console-subtle">
                <th className="w-16 py-3 pr-3">状态</th>
                <th className="min-w-48 py-3 pr-3">规则</th>
                <th className="min-w-56 py-3 pr-3">目标接口</th>
                <th className="py-3 pr-3">Provider</th>
                <th className="py-3 pr-3">响应</th>
                <th className="py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr
                  key={profile.id}
                  className={cx(
                    "border-b border-console-border align-middle last:border-b-0",
                    profile.id === selectedId && "bg-console-primary-soft shadow-[inset_3px_0_0_var(--color-console-primary)]"
                  )}
                >
                  <td className="py-3 pr-3">
                    <ToggleSwitch
                      checked={profile.enabled}
                      aria-label={`${profile.enabled ? "停用" : "启用"} ${profile.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleEnabled(profile);
                      }}
                    />
                  </td>
                  <td className="py-3 pr-3">
                    <button
                      type="button"
                      className="grid min-w-0 gap-1 text-left"
                      onClick={() => onSelect(profile)}
                    >
                      <strong className="truncate text-console-strong">{profile.name}</strong>
                      <span className="truncate font-mono text-xs text-console-subtle">{profile.id}</span>
                    </button>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="inline-flex min-w-11 justify-center rounded bg-[#edf1f4] px-1.5 py-1 font-mono text-xs font-bold text-[#25333b]">
                        {profile.methods.join(",")}
                      </span>
                      <span className="max-w-[320px] truncate" title={`${profile.targetOrigin}${profile.targetPath}`}>
                        {profile.targetOrigin.replace(/^https?:\/\//, "")}{profile.targetPath}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <Pill tone="success">{profile.provider}</Pill>
                  </td>
                  <td className="py-3 pr-3">
                    <Pill tone={getResponseTone(profile.responseMode)}>{profile.responseMode}</Pill>
                  </td>
                  <td className="py-3">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="secondary" size="sm" icon={<FlaskConical size={14} aria-hidden="true" />} onClick={() => onSelect(profile)}>
                        编辑
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
