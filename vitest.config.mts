import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  // Inline PostCSS config: Vite cannot load postcss.config.mjs (Next's string plugin form), and tests need no Tailwind.
  css: { postcss: {} },
  test: {
    environment: "jsdom",
    // RTL only auto-cleans the DOM between tests when afterEach is global
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // jsdom has a window, so lib/env.ts validates only client vars; Vitest does not load .env
    env: { NEXT_PUBLIC_ENVIRONMENT: "dev" },
  },
});
