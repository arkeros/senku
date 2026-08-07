#!/usr/bin/env node
/**
 * Render a webroot's index.html, resolving content-addressed names.
 *
 * Every file index.html points at carries a hash of its own bytes, so none
 * of those names exists until the bytes do and none can be substituted at
 * analysis time. The entry bundle's name comes from esbuild's metafile, and
 * this is where it is resolved — index.html is the one object left whose
 * name is fixed, which is what makes it the document the whole site is
 * reachable through.
 *
 * The stylesheets are the exception, and they are not named at all: their
 * bytes are inlined into the document. See
 * docs/adr/0010-content-addressed-webroot.md and
 * docs/adr/0012-inline-critical-css.md.
 *
 * Usage: html_codegen.mjs --template <p> --out <p> --metafile <p>
 *          --entry <source path> --bundle-dir <name>
 *          [--css <path>]... [--env-script]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// rules_js' js_binary wrapper cds into bazel-bin but exposes the execroot
// via this env var — paths from Bazel args are relative to execroot, so we
// resolve against it. Same pattern as asset_codegen.mjs.
const execroot = process.env.JS_BINARY__EXECROOT || process.cwd();

/**
 * The hashed basename esbuild wrote for a given source entry point.
 *
 * Every code-split route is an entry point in its own right, so the metafile
 * carries several outputs with an `entryPoint` and only the source path
 * tells them apart. Sourcemaps repeat their target's `entryPoint`, so they
 * are excluded rather than tie-broken.
 */
function entryOutput(metafile, entry) {
  const matches = Object.keys(metafile.outputs ?? {}).filter(
    (out) => metafile.outputs[out].entryPoint === entry && !out.endsWith(".map"),
  );
  if (matches.length !== 1) {
    throw new Error(
      `html_codegen: expected exactly one non-sourcemap output for entry point ` +
        `'${entry}', found ${matches.length}${matches.length ? `: ${matches.join(", ")}` : ""}`,
    );
  }
  return matches[0];
}

export function resolveEntry(metafile, entry) {
  return entryOutput(metafile, entry).split("/").pop();
}

/**
 * The chunks a browser needs before the entry can finish executing.
 *
 * Only `import-statement` edges are followed. The other kind, `dynamic-import`,
 * is a `lazy()` route — preloading those would fetch every route on every
 * page and undo the code splitting that produced them. The metafile lists
 * both in one array and only `kind` separates them.
 *
 * The walk is transitive because a chunk the entry imports may import further
 * chunks, and the browser cannot discover those until it has parsed the one
 * above. Preloading only the entry's direct imports would move the waterfall
 * down a level rather than removing it.
 */
function staticClosure(metafile, root, seen, out) {
  const queue = [root];
  while (queue.length) {
    const current = queue.shift();
    for (const imported of metafile.outputs[current]?.imports ?? []) {
      if (imported.kind !== "import-statement" || seen.has(imported.path)) continue;
      seen.add(imported.path);
      out.push(imported.path.split("/").pop());
      queue.push(imported.path);
    }
  }
}

export function resolvePreloads(metafile, entry, routeEntry = null) {
  const seen = new Set();
  const out = [];
  staticClosure(metafile, entryOutput(metafile, entry), seen, out);

  // The entry itself is not preloaded — it is the `<script src>`. A route
  // chunk is the opposite: nothing on the page names it, because the entry
  // reaches it by dynamic import, so it has to be listed to be fetched
  // early. Its own static imports usually overlap the entry's, and `seen`
  // is shared so the overlap is not emitted twice.
  if (routeEntry) {
    const output = entryOutput(metafile, routeEntry);
    if (!seen.has(output)) {
      seen.add(output);
      out.push(output.split("/").pop());
    }
    staticClosure(metafile, output, seen, out);
  }
  return out;
}

/**
 * The one sequence that cannot survive being inlined.
 *
 * Inside `<style>`, the HTML tokenizer looks for nothing but the end tag, so
 * a stylesheet is otherwise passed through untouched — no entity escaping,
 * no quoting. But it does end the block at `</style`, and the spec's match
 * is case-insensitive and admits whitespace before the `>`. A rule like
 * `content: "</style>"` is legal CSS, so this is reachable input.
 */
const STYLE_CLOSE = /<\/style/i;

/** `text` wrapped in a `<style>` block, or a thrown error if it cannot be. */
function styleBlock(text) {
  if (STYLE_CLOSE.test(text)) {
    throw new Error(
      "html_codegen: stylesheet contains '</style', which would close the " +
        "inline block early and render the rest of the sheet as page text",
    );
  }
  return `<style>${text}</style>`;
}

export function generate({
  template,
  metafile,
  entry,
  bundleDir,
  css,
  envScript,
  routeEntry = null,
}) {
  // Stylesheets first, and inline: a `<link>` here would be a second round
  // trip that first paint waits on, discovered only once this document has
  // arrived. Inlining makes the CSS arrive *with* the document, which is
  // the whole of the win — these sheets are a few KB, less than the trip
  // costs. `css` is in cascade order and stays that way.
  //
  // The modulepreloads follow rather than lead: they are already fetched by
  // the preload scanner in the same pass, and the JS they name cannot paint
  // anything until the CSS above has been parsed anyway.
  const head =
    css.map(styleBlock).join("") +
    resolvePreloads(metafile, entry, routeEntry)
      .map((name) => `<link rel="modulepreload" href="/${bundleDir}/${name}" />`)
      .join("");

  // The env bootstrap sets `window.__ENV__` and must run before any module
  // script does, so it is emitted ahead of the entry rather than beside it.
  const scripts =
    (envScript ? '<script src="/env.js"></script>' : "") +
    `<script type="module" src="/${bundleDir}/${resolveEntry(metafile, entry)}"></script>`;

  const html = template
    .replaceAll("{{HEAD}}", head)
    .replaceAll("{{SCRIPTS}}", scripts);

  // A leftover placeholder means a tag silently did not ship — a page with
  // no stylesheet, or no bundle at all, and a 200 to say everything is fine.
  const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) {
    throw new Error(
      `html_codegen: template has unsubstituted placeholder(s): ${[...new Set(leftover)].join(", ")}`,
    );
  }
  return html;
}

function parseArgs(argv) {
  const args = {
    template: null,
    out: null,
    metafile: null,
    entry: null,
    bundleDir: null,
    css: [],
    envScript: false,
    routeEntry: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--template") args.template = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--metafile") args.metafile = argv[++i];
    else if (a === "--entry") args.entry = argv[++i];
    else if (a === "--bundle-dir") args.bundleDir = argv[++i];
    else if (a === "--css") args.css.push(argv[++i]);
    else if (a === "--route-entry") args.routeEntry = argv[++i];
    else if (a === "--env-script") args.envScript = true;
    else throw new Error(`html_codegen: unknown arg: ${a}`);
  }
  for (const required of ["template", "out", "metafile", "entry", "bundleDir"]) {
    if (!args[required]) {
      throw new Error(`html_codegen: --${required.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())} is required`);
    }
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const read = (p) => readFileSync(resolve(execroot, p), "utf8");

  const html = generate({
    template: read(args.template),
    metafile: JSON.parse(read(args.metafile)),
    entry: args.entry,
    bundleDir: args.bundleDir,
    // `--css` now names a file to inline rather than a basename to link,
    // so the contents are read here and `generate` stays a pure function
    // of them.
    css: args.css.map(read),
    envScript: args.envScript,
    routeEntry: args.routeEntry,
  });

  writeFileSync(resolve(execroot, args.out), html);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main(process.argv.slice(2));
}
