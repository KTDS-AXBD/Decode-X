import { defineConfig, type Plugin } from "vitest/config";

// In Vitest context, WASM ESM imports are not supported.
// This plugin intercepts .wasm imports and returns a null export so
// initJavaParserWorkers() fails gracefully (caught by try/catch in index.ts).
const wasmNullPlugin: Plugin = {
  name: "wasm-null-for-tests",
  load(id) {
    if (id.endsWith(".wasm")) {
      return "export default null;";
    }
  },
};

export default defineConfig({
  plugins: [wasmNullPlugin],
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/env.ts", "src/index.ts"],
    },
  },
});
