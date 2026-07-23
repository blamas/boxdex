import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Pure logic only. Islands/pages need a browser and are out of scope. The worker
      // request path and its pure helpers are measured, box-contribute's GitHub REST
      // orchestration is integration-level and stays out.
      include: ["src/lib/**/*.ts", "worker/index.ts", "worker/resolve.ts", "worker/visitor.ts"],
      // No behaviour to test: ECharts registration, const tables, env-derived consts,
      // zod declarations (validated by `astro sync`), and history/location DOM glue.
      exclude: [
        "src/lib/echarts.ts",
        "src/lib/palette.ts",
        "src/lib/category.ts",
        "src/lib/site.ts",
        "src/lib/schemas.ts",
        "src/lib/url-state.ts",
        "src/lib/locale-client.ts",
        "src/lib/listbox-disclosure.ts",
        "src/lib/click-outside.ts",
      ],
      // Regressions below the current bar fail CI.
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
});
