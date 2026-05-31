import path from "node:path";
import { defineConfig } from "vitest/config";

// Node environment: the suite covers the data layer, detection logic, security
// guards, and route-handler validation — not React rendering — so no jsdom needed.
// `@/` resolves to the project root to match tsconfig `paths`.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true
  }
});
