import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(import.meta.dirname),
  publicDir: resolve(import.meta.dirname, "../../assets"),
  resolve: { alias: { "/src": resolve(import.meta.dirname, "../../src") } },
  define: { __QA_ENABLED__: "true" },
  server: { port: 4188 },
});
