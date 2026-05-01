import { defineConfig } from "tsup";

export default defineConfig([
  // ESM build with code splitting so dynamic-imported extensions and the
  // errors module land in separate chunks that only download when opted in.
  {
    entry: {
      index: "src/index.ts",
      server: "src/server.ts",
      react: "src/react.tsx",
      errors: "src/errors.ts",
    },
    format: ["esm"],
    dts: true,
    clean: true,
    splitting: true,
    external: ["react", "web-vitals"],
  },
  // CJS build: no splitting (poor dynamic-import support in legacy Node toolchains).
  // Pulls dynamic chunks into the main file. Acceptable since most modern users hit ESM.
  {
    entry: {
      index: "src/index.ts",
      server: "src/server.ts",
      react: "src/react.tsx",
      errors: "src/errors.ts",
    },
    format: ["cjs"],
    dts: false,
    clean: false,
    splitting: false,
    external: ["react", "web-vitals"],
  },
  // CDN: single minified IIFE for <script src> users.
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
