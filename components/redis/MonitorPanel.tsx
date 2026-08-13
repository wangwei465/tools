"use client";

import { useState } from "react";
import type { RedisConnection } from "@/lib/redis/types";
import { InfoPanel } from "@/components/redis/InfoPanel";
import { SlowlogPanel } from "@/components/redis/SlowlogPanel";

/** 监控子视图。 */
type MonitorTab = "metrics" | "slowlog";

/**
 * 监控视图容器：在「指标（INFO）」与「慢查询」子视图间切换，默认「指标」。
 * 复用既有顶层「监控」入口，不新增顶层视图 tab（导航复杂度不变）。
 */
export function MonitorPanel({ conn }: { conn: RedisConnection }) {
  const [tab, setTab] = useState<MonitorTab>("metrics");

  return (
    <div className="redis-monitor">
      <div className="redis-subtabs">
        {(
          [
            ["metrics", "指标"],
            ["slowlog", "慢查询"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`redis-subtab${tab === key ? " active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "metrics" ? <InfoPanel conn={conn} /> : <SlowlogPanel conn={conn} />}
    </div>
  );
}
