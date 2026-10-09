import { defineConfig } from "vitest/config";

// Unit tests run on Node.js (the Cloudflare plugin in vite.config.ts is not used because it boots the whole Worker)
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
