import React from "react";
import type { ProxyProfile } from "@proxy2localai/shared";

interface ProfileListProps {
  profiles: ProxyProfile[];
  selectedId: string | null;
  onSelect: (profile: ProxyProfile) => void;
  onAdd: () => void;
  onToggleEnabled: (profile: ProxyProfile) => void;
}

export function ProfileList({ profiles, selectedId, onSelect, onAdd, onToggleEnabled }: ProfileListProps) {
  return (
    <aside className="profile-list">
      <div className="list-title">
        <strong>代理配置</strong>
        <button type="button" onClick={onAdd}>新增</button>
      </div>
      {profiles.map((profile) => (
        <div
          key={profile.id}
          className={profile.id === selectedId ? "profile-item active" : "profile-item"}
        >
          <button
            type="button"
            className="profile-item-name"
            onClick={() => onSelect(profile)}
          >
            <span>{profile.name}</span>
            <small>{profile.enabled ? "启用" : "停用"} · {profile.provider} · {profile.responseMode}</small>
          </button>
          <button
            type="button"
            className="secondary"
            onClick={(event) => {
              event.stopPropagation();
              onToggleEnabled(profile);
            }}
          >
            {profile.enabled ? "关闭" : "启动"}
          </button>
        </div>
      ))}
      {profiles.length === 0 && <p className="muted">还没有配置</p>}
    </aside>
  );
}
