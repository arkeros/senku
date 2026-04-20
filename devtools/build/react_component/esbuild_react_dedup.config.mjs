// Force all `react`/`react-dom`/`react-dom/client`/`react/jsx-runtime`
// imports in the bundle to resolve to a single physical location —
// the one under the consumer's //:node_modules/.
//
// Without this, @panellet/i18n-runtime (or any other cross-repo-linked
// npm_package) resolves `react` starting from its own physical path
// (e.g. `external/senku+/node_modules/.aspect_rules_js/react@19.x/...`)
// instead of the consumer's. Under pnpm's virtual store, that path is
// a different physical copy than the consumer's `//:node_modules/react`,
// even when both pin the same version, so esbuild inlines two copies
// and React's dispatcher singleton ends up torn — "Invalid hook call".
//
// Alias RHS values go through normal Node module resolution but *from
// the bundle's working directory* (bazel execroot), not from each
// importer's own context. Esbuild's CWD is execroot and aspect_rules_js
// materializes the consumer's //:node_modules/ at `./node_modules/` in
// that tree, so these path-form values land deterministically on the
// consumer's copy.
export default {
  alias: {
    react: "./node_modules/react",
    "react-dom": "./node_modules/react-dom",
    "react-dom/client": "./node_modules/react-dom/client",
    "react/jsx-runtime": "./node_modules/react/jsx-runtime",
  },
  // React 19's package.json exports gate its production vs development
  // builds on the `production`/`development` export condition. Without
  // `production` set, esbuild picks `react.development.js`, which ships
  // hot-path hook warnings and slower dispatcher code to end users.
  // `define` + `minify` on the esbuild rule side cover the `process.env.NODE_ENV`
  // replacements and DCE; this selects the right export entry point.
  conditions: ["production"],
};
