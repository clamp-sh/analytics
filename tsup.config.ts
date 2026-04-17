import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      server: "src/server.ts",
      react: "src/react.tsx",
    },
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    splitting: false,
    external: ["react"],
  },
  {
    entry: { cdn: "src/index.ts" },
    format: ["iife"],
    globalName: "clamp",
    platform: "browser",
    minify: true,
    dts: false,
    clean: false,
    splitting: false,
  },
]);
