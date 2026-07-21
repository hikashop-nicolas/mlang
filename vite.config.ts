import { defineConfig } from "vite";

// Demo in demo/, built to demo-dist/ for GitHub Pages; base "./" works from a subpath.
// Vitest runs the pure tests under node.
export default defineConfig({
  root: "demo",
  base: "./",
  build: { outDir: "../demo-dist", emptyOutDir: true },
  test: {
    root: ".",
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
