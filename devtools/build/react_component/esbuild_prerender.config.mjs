// The prerender bundle's twin of `esbuild_react_dedup.config.mjs`.
//
// Same reason for existing — one physical `react`, or React's dispatcher
// singleton tears and every render throws "Invalid hook call" — but for a
// bundle that runs in Node at build time rather than one that ships.
//
// Two deliberate differences from the browser config:
//
//   - No `entryNames`. That setting content-addresses the entry so a
//     browser never revalidates it; here nothing is served, and the file
//     is executed by the path `js_binary` was given. A hash in the name
//     would mean no name Bazel could declare as an output.
//   - `react-dom/server` is aliased alongside the client entries. It is a
//     separate export path, so the client aliases do not cover it, and it
//     is the one this bundle actually renders through.
export default {
  alias: {
    react: "./node_modules/react",
    "react-dom": "./node_modules/react-dom",
    "react-dom/server": "./node_modules/react-dom/server",
    "react/jsx-runtime": "./node_modules/react/jsx-runtime",
  },
  // Matches the shipped bundle: the components are rendered here exactly as
  // they will be in the browser, so a development-build divergence between
  // the two renders would be a divergence in the markup.
  conditions: ["production"],
};
