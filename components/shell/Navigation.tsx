"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 工具注册表：新增工具只需在此追加一条记录。 */
const TOOLS = [
  { href: "/compare", label: "数据比对" },
  { href: "/signature", label: "生成签名" },
  { href: "/api-client", label: "接口调试" },
  { href: "/redis", label: "Redis管理" },
  { href: "/convert", label: "编码转换" },
  // 未来工具在此注册
] as const;

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      <div className="nav-brand">🛠 工具集</div>
      <div className="nav-links">
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className={`nav-link${pathname.startsWith(tool.href) ? " active" : ""}`}
          >
            {tool.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
