import React, { useMemo, useState } from "react";
import { Plus, PanelRightOpen } from "lucide-react";
import type { ProxyProfile } from "@proxy2localai/shared";
import { Button, Panel, Pill, ToggleSwitch, cx } from "../../ui/components";

interface ProfileListProps {
  profiles: ProxyProfile[];
  selectedId: string | null;
  onSelect: (profile: ProxyProfile) => void;
  onEdit: (profile: ProxyProfile) => void;
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

export function ProfileList({ profiles, selectedId, onSelect, onEdit, onAdd, onToggleEnabled }: ProfileListProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [modeFilter, setModeFilter] = useState<"all" | ProxyProfile["responseMode"]>("all");

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return profiles.filter((profile) => {
      const matchesQuery = !normalizedQuery
        || profile.name.toLowerCase().includes(normalizedQuery)
        || profile.id.toLowerCase().includes(normalizedQuery)
        || profile.provider.toLowerCase().includes(normalizedQuery)
        || profile.responseMode.toLowerCase().includes(normalizedQuery)
        || `${profile.targetOrigin}${profile.targetPath}`.toLowerCase().includes(normalizedQuery);
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "enabled" ? profile.enabled : !profile.enabled);
      const matchesMode = modeFilter === "all" || profile.responseMode === modeFilter;
      return matchesQuery && matchesStatus && matchesMode;
    });
  }, [modeFilter, profiles, query, statusFilter]);

  return (
    <Panel padded={false} className="grid gap-3 p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-console-strong">路由列表</h2>
          <p className="mt-1 text-sm leading-6 text-console-subtle">启停、选择和测试常用 profile；完整字段进入详情抽屉编辑。</p>
        </div>
        <Pill tone={profiles.length === filteredProfiles.length ? "default" : "info"}>
          {filteredProfiles.length}/{profiles.length}
        </Pill>
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_150px_150px_auto]">
        <input
          value={query}
          placeholder="搜索路由名称、目标接口、Provider..."
          aria-label="搜索路由"
          onChange={(event) => setQuery(event.target.value)}
        />
        <select aria-label="按启用状态筛选" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
          <option value="all">状态：全部</option>
          <option value="enabled">状态：启用</option>
          <option value="disabled">状态：停用</option>
        </select>
        <select aria-label="按响应类型筛选" value={modeFilter} onChange={(event) => setModeFilter(event.target.value as typeof modeFilter)}>
          <option value="all">类型：全部</option>
          <option value="block">普通 JSON</option>
          <option value="stream">流式 SSE</option>
          <option value="custom_json">自定义 JSON</option>
          <option value="mapped_sse">映射 SSE</option>
        </select>
        <Button type="button" icon={<Plus size={16} aria-hidden="true" />} onClick={onAdd}>
          创建路由
        </Button>
      </div>

      {profiles.length === 0 ? (
        <div className="rounded-console border border-dashed border-console-border-strong bg-console-muted p-4">
          <strong className="text-sm text-console-strong">还没有配置</strong>
          <p className="mt-1 text-sm leading-6 text-console-subtle">建议从创建向导开始，粘贴 cURL 后完成测试和保存。</p>
        </div>
      ) : filteredProfiles.length === 0 ? (
        <div className="rounded-console border border-dashed border-console-border-strong bg-console-muted p-4">
          <strong className="text-sm text-console-strong">没有匹配的路由</strong>
          <p className="mt-1 text-sm leading-6 text-console-subtle">调整搜索词或筛选条件后重试。</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-console-sm border border-console-border">
          <table className="min-w-[940px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-console-border bg-console-muted text-xs font-bold text-console-subtle">
                <th className="w-14 py-2.5 pl-3 pr-2">状态</th>
                <th className="min-w-44 py-2.5 pr-2">规则</th>
                <th className="min-w-56 py-2.5 pr-2">目标接口</th>
                <th className="py-2.5 pr-2">Provider</th>
                <th className="py-2.5 pr-2">响应</th>
                <th className="w-28 min-w-28 py-2.5 pl-2 pr-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.map((profile) => (
                <tr
                  key={profile.id}
                  className={cx(
                    "border-b border-console-border align-middle last:border-b-0 hover:bg-console-raised",
                    profile.id === selectedId && "bg-console-primary-soft shadow-[inset_3px_0_0_var(--color-console-primary)]"
                  )}
                >
                  <td className="py-2.5 pl-3 pr-2">
                    <ToggleSwitch
                      checked={profile.enabled}
                      aria-label={`${profile.enabled ? "停用" : "启用"} ${profile.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleEnabled(profile);
                      }}
                    />
                  </td>
                  <td className="py-2.5 pr-2">
                    <button
                      type="button"
                      className="grid min-w-0 gap-1 text-left"
                      onClick={() => onSelect(profile)}
                    >
                      <strong className="truncate text-console-strong">{profile.name}</strong>
                      <span className="truncate font-mono text-xs text-console-subtle">{profile.id}</span>
                    </button>
                  </td>
                  <td className="py-2.5 pr-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="inline-flex min-w-11 justify-center rounded bg-console-primary-soft px-1.5 py-1 font-mono text-xs font-bold text-console-primary">
                        {profile.methods.join(",")}
                      </span>
                      <span className="max-w-[320px] truncate" title={`${profile.targetOrigin}${profile.targetPath}`}>
                        {profile.targetOrigin.replace(/^https?:\/\//, "")}{profile.targetPath}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-2">
                    <Pill tone="success">{profile.provider}</Pill>
                  </td>
                  <td className="py-2.5 pr-2">
                    <Pill tone={getResponseTone(profile.responseMode)}>{profile.responseMode}</Pill>
                  </td>
                  <td className="w-28 min-w-28 py-2.5 pl-2 pr-3">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="secondary" size="sm" className="whitespace-nowrap" icon={<PanelRightOpen size={14} aria-hidden="true" />} onClick={() => onEdit(profile)}>
                        详情
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
