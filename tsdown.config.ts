import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm"],
  outExtensions: () => ({ js: ".js" }),
  platform: "node",
  target: "node22",
  clean: true,
  minify: true,
  shims: true,
  dts: false,
  deps: {
    alwaysBundle: [/.*/],
    onlyBundle: false,
  },
});
