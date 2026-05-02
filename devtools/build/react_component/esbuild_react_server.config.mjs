// Server-side esbuild config for react_ssr_app.
//
// Same react-deduplication policy as `esbuild_react_dedup.config.mjs`
// (keep them in sync — the rule_esbuild config attr requires a single
// file, so we can't import from the base config) plus a `createRequire`
// banner: react-dom 19 ships `react-dom/server.node` as CJS that calls
// `require("util")` at module-init. esbuild's CJS-to-ESM transform
// rewrites most `require()` calls but for Node built-ins it preserves
// the dynamic require, which fails in ESM with "Dynamic require of
// 'util' is not supported". The shim defines `require` via
// `createRequire(import.meta.url)` so those calls resolve at runtime.
export default {
  alias: {
    react: "./node_modules/react",
    "react-dom": "./node_modules/react-dom",
    "react-dom/client": "./node_modules/react-dom/client",
    "react/jsx-runtime": "./node_modules/react/jsx-runtime",
  },
  conditions: ["production"],
  banner: {
    js:
      'import { createRequire as __panellet_cr } from "node:module";' +
      "const require = __panellet_cr(import.meta.url);",
  },
};
