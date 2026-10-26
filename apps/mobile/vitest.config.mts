import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/logic/**/*.test.ts"],
    environment: "node",
  },
});
