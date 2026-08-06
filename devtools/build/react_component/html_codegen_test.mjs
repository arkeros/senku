import { test } from "node:test";
import assert from "node:assert/strict";

import { generate, resolveCss, resolveEntry } from "./html_codegen.mjs";

// esbuild marks every code-split entry point, not just the one we asked
// for: each `lazy()` route shows up with its own `entryPoint`. Matching on
// "has an entryPoint" would find four outputs here and pick whichever came
// first, so the source path is what identifies ours.
const metafile = {
  outputs: {
    "apps/t/app_bundle/app_main-4WSWQT5M.js": { entryPoint: "apps/t/app_main.js" },
    "apps/t/app_bundle/Play-3YV3A6SW.js": { entryPoint: "apps/t/pages/Play/Play.js" },
    "apps/t/app_bundle/Layout-SOM3RGL5.js": { entryPoint: "apps/t/components/Layout/Layout.js" },
    "apps/t/app_bundle/chunk-AYBB77RQ.js": {},
    "apps/t/app_bundle/app_main-4WSWQT5M.js.map": { entryPoint: "apps/t/app_main.js" },
  },
};

const cssManifest = {
  "app_normalize.css": "app_normalize.4de6907a35c5.css",
  "app_styles.css": "app_styles.11cc90d013b2.css",
};

test("resolveEntry finds the hashed name for the source entry", () => {
  assert.equal(resolveEntry(metafile, "apps/t/app_main.js"), "app_main-4WSWQT5M.js");
});

test("resolveEntry ignores the sourcemap sharing the entry point", () => {
  const only = Object.keys(metafile.outputs).filter((k) =>
    k.startsWith("apps/t/app_bundle/app_main"),
  );
  assert.equal(only.length, 2, "fixture should contain the .js and its .map");
  assert.equal(resolveEntry(metafile, "apps/t/app_main.js"), "app_main-4WSWQT5M.js");
});

test("resolveEntry throws when the entry is absent", () => {
  assert.throws(
    () => resolveEntry(metafile, "apps/t/does_not_exist.js"),
    /does_not_exist\.js/,
  );
});

test("resolveCss preserves the order it is asked for", () => {
  assert.deepEqual(resolveCss(cssManifest, ["app_normalize.css", "app_styles.css"]), [
    "app_normalize.4de6907a35c5.css",
    "app_styles.11cc90d013b2.css",
  ]);
});

test("resolveCss throws on a name the manifest does not carry", () => {
  assert.throws(() => resolveCss(cssManifest, ["missing.css"]), /missing\.css/);
});

test("generate substitutes hashed URLs into the template", () => {
  const html = generate({
    template: "<head>{{HEAD}}</head><body>{{SCRIPTS}}</body>",
    metafile,
    cssManifest,
    entry: "apps/t/app_main.js",
    bundleDir: "app_bundle",
    css: ["app_normalize.css", "app_styles.css"],
    envScript: false,
  });

  assert.equal(
    html,
    "<head>" +
      '<link rel="stylesheet" href="/assets/app_normalize.4de6907a35c5.css" />' +
      '<link rel="stylesheet" href="/assets/app_styles.11cc90d013b2.css" />' +
      "</head><body>" +
      '<script type="module" src="/app_bundle/app_main-4WSWQT5M.js"></script>' +
      "</body>",
  );
});

// `window.__ENV__` has to exist before any module script runs, so the
// bootstrap is emitted ahead of the entry rather than alongside it.
test("generate puts the env bootstrap before the module entry", () => {
  const html = generate({
    template: "{{SCRIPTS}}",
    metafile,
    cssManifest,
    entry: "apps/t/app_main.js",
    bundleDir: "app_bundle",
    css: [],
    envScript: true,
  });

  assert.equal(
    html,
    '<script src="/env.js"></script>' +
      '<script type="module" src="/app_bundle/app_main-4WSWQT5M.js"></script>',
  );
});

// A template that still contains a placeholder means a tag silently did not
// ship — an app that renders without its stylesheet or without its bundle.
test("generate rejects a template with an unsubstituted placeholder", () => {
  assert.throws(
    () =>
      generate({
        template: "{{HEAD}}{{SCRIPTS}}{{TITLE}}",
        metafile,
        cssManifest,
        entry: "apps/t/app_main.js",
        bundleDir: "app_bundle",
        css: [],
        envScript: false,
      }),
    /TITLE/,
  );
});
