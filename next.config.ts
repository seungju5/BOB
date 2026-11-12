import type { NextConfig } from "next";

type CssRule = {
  oneOf?: CssRule[];
  use?: Array<string | {loader?: string; options?: {importLoaders?: number}}>;
};

const staticExport = process.env.BAPMUNNA_STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_APP_BASE_PATH ?? "";
if (basePath && !/^\/[a-zA-Z0-9/_-]+$/.test(basePath)) throw new Error("Invalid app base path");
if (basePath.endsWith("/")) throw new Error("App base path must not end in a slash");

const nextConfig: NextConfig = {
  basePath,
  ...(staticExport ? { output: "export", distDir: "tmp/impact-final/build", trailingSlash: true, images: { unoptimized: true } } : {}),
  cacheComponents: !staticExport,
  partialPrefetching: !staticExport,
  // Keep the existing Tailwind loader in the Webpack fallback too. A successful
  // fallback build must contain utilities, not unprocessed @theme directives.
  webpack(config) {
    function addTailwind(rules: CssRule[]) {
      for (const rule of rules) {
        if (!rule || typeof rule !== "object") continue;
        if (rule.oneOf) addTailwind(rule.oneOf);
        if (!Array.isArray(rule.use) || !rule.use.some(item => typeof item === "object" && item.loader?.includes("postcss-loader"))) continue;
        // Extend Next's CSS pipeline so extraction and CSS Modules stay enabled.
        rule.use.push({loader: "@tailwindcss/turbopack"});
        for (const item of rule.use) {
          if (typeof item === "object" && typeof item.options?.importLoaders === "number") item.options.importLoaders++;
        }
      }
    }
    addTailwind(config.module.rules);
    return config;
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
