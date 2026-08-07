import { test } from "node:test";
import assert from "node:assert/strict";

import { generate, resolveEntry, resolvePreloads } from "./html_codegen.mjs";

// The entry's static imports are the modules that must load before anything
// runs; its dynamic imports are the lazy routes, which must not be preloaded
// or code splitting buys nothing. The metafile lists both side by side and
// only `kind` tells them apart.
const metafileWithImports = {
  outputs: {
    "apps/t/app_bundle/app_main-4WSWQT5M.js": {
      entryPoint: "apps/t/app_main.js",
      imports: [
        { path: "apps/t/app_bundle/chunk-VENDOR1.js", kind: "import-statement" },
        { path: "apps/t/app_bundle/Play-3YV3A6SW.js", kind: "dynamic-import" },
        { path: "apps/t/app_bundle/NotFound-AXA4SC4Y.js", kind: "dynamic-import" },
      ],
    },
    "apps/t/app_bundle/chunk-VENDOR1.js": {
      imports: [{ path: "apps/t/app_bundle/chunk-VENDOR2.js", kind: "import-statement" }],
    },
    "apps/t/app_bundle/chunk-VENDOR2.js": { imports: [] },
    "apps/t/app_bundle/Play-3YV3A6SW.js": { entryPoint: "apps/t/pages/Play/Play.js" },
  },
};

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

test("resolvePreloads takes static imports and refuses dynamic ones", () => {
  const got = resolvePreloads(metafileWithImports, "apps/t/app_main.js");
  assert.ok(!got.includes("Play-3YV3A6SW.js"), "a lazy route must not be preloaded");
  assert.ok(!got.includes("NotFound-AXA4SC4Y.js"), "a lazy route must not be preloaded");
});

// A chunk the entry imports may import further chunks of its own, and every
// one of them has to arrive before the app runs. Preloading only the entry's
// direct imports would leave the next level to be discovered after parsing.
test("resolvePreloads follows the static graph transitively", () => {
  assert.deepEqual(resolvePreloads(metafileWithImports, "apps/t/app_main.js"), [
    "chunk-VENDOR1.js",
    "chunk-VENDOR2.js",
  ]);
});

test("resolvePreloads is empty when the entry imports nothing", () => {
  assert.deepEqual(resolvePreloads(metafile, "apps/t/app_main.js"), []);
});

// The document materialised at a route's own path knows which route it
// serves, so it can start that chunk downloading immediately instead of
// waiting for the router to ask. The chunk is reachable from the entry only
// by a dynamic import, so it is never in the base set.
test("resolvePreloads adds the route's own chunk when given one", () => {
  const got = resolvePreloads(
    metafileWithImports,
    "apps/t/app_main.js",
    "apps/t/pages/Play/Play.js",
  );
  assert.deepEqual(got, ["chunk-VENDOR1.js", "chunk-VENDOR2.js", "Play-3YV3A6SW.js"]);
});

// A route chunk has static imports of its own. Those are usually shared with
// the entry, and preloading a chunk twice would emit a duplicate link.
test("resolvePreloads does not repeat a chunk the entry already pulled in", () => {
  const shared = {
    outputs: {
      "apps/t/app_bundle/app_main-X.js": {
        entryPoint: "apps/t/app_main.js",
        imports: [{ path: "apps/t/app_bundle/chunk-SHARED.js", kind: "import-statement" }],
      },
      "apps/t/app_bundle/chunk-SHARED.js": { imports: [] },
      "apps/t/app_bundle/Play-Y.js": {
        entryPoint: "apps/t/pages/Play/Play.js",
        imports: [{ path: "apps/t/app_bundle/chunk-SHARED.js", kind: "import-statement" }],
      },
    },
  };

  assert.deepEqual(
    resolvePreloads(shared, "apps/t/app_main.js", "apps/t/pages/Play/Play.js"),
    ["chunk-SHARED.js", "Play-Y.js"],
  );
});

test("generate emits a modulepreload per static import", () => {
  const html = generate({
    template: "<head>{{HEAD}}</head>",
    metafile: metafileWithImports,
    entry: "apps/t/app_main.js",
    bundleDir: "app_bundle",
    css: [],
    envScript: false,
  });

  assert.equal(
    html,
    "<head>" +
      '<link rel="modulepreload" href="/app_bundle/chunk-VENDOR1.js" />' +
      '<link rel="modulepreload" href="/app_bundle/chunk-VENDOR2.js" />' +
      "</head>",
  );
});

// The stylesheets are inlined, not linked: a `<link>` in the head is a
// second round trip that first paint waits on, and these two are small
// enough that their bytes cost less than the trip to fetch them. See
// docs/adr/0012-inline-critical-css.md.
test("generate inlines the stylesheets into the document", () => {
  const html = generate({
    template: "<head>{{HEAD}}</head><body>{{SCRIPTS}}</body>",
    metafile,
    entry: "apps/t/app_main.js",
    bundleDir: "app_bundle",
    css: ["body{margin:0}", ".x{color:red}"],
    envScript: false,
  });

  assert.equal(
    html,
    "<head>" +
      "<style>body{margin:0}</style>" +
      "<style>.x{color:red}</style>" +
      "</head><body>" +
      '<script type="module" src="/app_bundle/app_main-4WSWQT5M.js"></script>' +
      "</body>",
  );
});

// Source order is the cascade — normalize has to stay ahead of the app's
// own styles or it wins every tie it should lose.
test("generate keeps the stylesheets in the order it is given", () => {
  const html = generate({
    template: "{{HEAD}}{{SCRIPTS}}",
    metafile,
    entry: "apps/t/app_main.js",
    bundleDir: "app_bundle",
    css: ["/*first*/", "/*second*/"],
    envScript: false,
  });

  assert.ok(html.indexOf("/*first*/") < html.indexOf("/*second*/"));
});

// Inlining puts CSS bytes into HTML parsing context, where `</style>`
// closes the block early and the remaining rules render as body text. A
// stylesheet can legitimately contain the sequence inside a string, so
// this is a real input, not a hypothetical one — and silently mangling
// the page is the one outcome worse than failing the build.
test("generate rejects a stylesheet that would close its own style tag", () => {
  assert.throws(
    () =>
      generate({
        template: "{{HEAD}}{{SCRIPTS}}",
        metafile,
        entry: "apps/t/app_main.js",
        bundleDir: "app_bundle",
        css: ['a::after{content:"</style>"}'],
        envScript: false,
      }),
    /<\/style/,
  );
});

test("generate rejects the closing sequence whatever its case or spacing", () => {
  for (const hostile of ["</STYLE>", "</StYlE >", "</style\t>"]) {
    assert.throws(
      () =>
        generate({
          template: "{{HEAD}}{{SCRIPTS}}",
          metafile,
          entry: "apps/t/app_main.js",
          bundleDir: "app_bundle",
          css: [`a::after{content:"${hostile}"}`],
          envScript: false,
        }),
      /<\/style/,
      `'${hostile}' must be rejected`,
    );
  }
});

// `window.__ENV__` has to exist before any module script runs, so the
// bootstrap is emitted ahead of the entry rather than alongside it.
test("generate puts the env bootstrap before the module entry", () => {
  const html = generate({
    template: "{{SCRIPTS}}",
    metafile,
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
        entry: "apps/t/app_main.js",
        bundleDir: "app_bundle",
        css: [],
        envScript: false,
      }),
    /TITLE/,
  );
});
