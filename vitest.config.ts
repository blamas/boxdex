import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Pure logic only. Islands/pages need a browser and are out of scope.
      include: ["src/lib/**/*.ts"],
      // No behaviour to test: ECharts registration, const tables, env-derived consts.
      exclude: ["src/lib/echarts.ts", "src/lib/category.ts", "src/lib/site.ts"],
    },
  },
});
