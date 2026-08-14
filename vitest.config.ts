import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * vitest 配置。
 *
 * 唯一职责：让测试能解析项目约定的 `@/` 路径别名（与 tsconfig.json 的
 * paths 保持一致）。在此之前测试全部使用相对 import 故未暴露该问题，
 * 而 API 路由按项目惯例用 `@/lib/...` 引用，其测试需要这层解析。
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
