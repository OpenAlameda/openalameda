import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["src/**/*.test.ts"] },
      },
      {
        resolve: { alias },
        test: { name: "e2e", include: ["test/e2e/**/*.test.ts"] },
      },
    ],
  },
});
