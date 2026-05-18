/** @type {import('next').NextConfig} */

const nextConfig = {
  // Standalone output: self-contained server.js + minimal node_modules
  // This eliminates the need to copy the full node_modules into Docker production images
  output: "standalone",

  // Disable dev indicators unless explicitly enabled via environment variable
  devIndicators:
    process.env.NEXT_PUBLIC_SHOW_COPILOT_DEV_TOOLS === "true"
      ? { position: "bottom-right" }
      : false,

  // Transpile mermaid and related packages for proper ESM handling
  transpilePackages: ["mermaid"],

  // Turbopack configuration (used when running `npm run dev:turbo`)
  turbopack: {
    // Pin the workspace root to web/ so Turbopack ignores docs/package-lock.json
    // (VitePress for the docs site) and stops emitting the multi-lockfile warning.
    root: __dirname,
    resolveAlias: {
      // Fix for mermaid's cytoscape dependency - use CJS version
      cytoscape: "cytoscape/dist/cytoscape.cjs.js",
    },
  },

  // Webpack configuration (used for production builds - next build)
  webpack: (config) => {
    const path = require("path");
    config.resolve.alias = {
      ...config.resolve.alias,
      cytoscape: path.resolve(
        __dirname,
        "node_modules/cytoscape/dist/cytoscape.cjs.js",
      ),
    };
    return config;
  },
};

module.exports = nextConfig;
