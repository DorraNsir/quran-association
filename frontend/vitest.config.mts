import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

/** Frontend unit tests: jsdom, the "@/…" alias, React's automatic JSX runtime. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    env: { NEXT_PUBLIC_API_URL: "http://api.test/api", TZ: "UTC" },
    restoreMocks: true,
    setupFiles: ["./src/test/setup.ts"],
  },
})
