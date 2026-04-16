# Why StyleX

Panallet uses StyleX for component styling. This document explains the choice
and how it compares to alternatives.

## The requirement

Panallet is a Bazel-native React framework. The styling solution must:

1. **Work at build time** — no runtime CSS generation
2. **Integrate with the build graph** — styles should be collectible per-component and composable transitively via Bazel providers
3. **Co-locate with components** — styles live in the same `.tsx` file, not in separate files
4. **Produce atomic CSS** — each declaration compiles to a single class (e.g. `.x1j61zf2{font-size:16px}`), naturally deduplicated across components

## Why StyleX fits

StyleX compiles `stylex.create()` calls during Babel transpilation. The Babel
plugin produces two outputs per file:

- The transformed JS (class name references replace style objects)
- A `.stylex.json` metadata file (CSS rules with hashes and priorities)

This split is what makes StyleX Bazel-native. The metadata file is a build
artifact that can be:

- Collected transitively via `StylexInfo` providers (Button's styles flow
  through Home → Button deps automatically)
- Merged by `stylex_css` into a single stylesheet using `processStylexRules()`
- Produced in a single Babel pass alongside the JS output (no double compilation)

No other styling tool produces extractable metadata per-file that a build system
can reason about.

## Comparison

### Tailwind CSS

Atomic utility classes in JSX markup: `className="flex gap-4 p-6"`.

- **Pros**: huge ecosystem, fast iteration, no build plugin needed
- **Cons**: styles are opaque strings — the build system can't collect or
  deduplicate them per-component. Tailwind runs as a single CLI pass over all
  source files, not per-component. No integration with Bazel's dependency graph.
- **Verdict**: great DX but doesn't benefit from Bazel. You'd run one global
  Tailwind action instead of composable per-component build actions.

### CSS Modules

Scoped CSS in separate `.module.css` files.

- **Pros**: true CSS, scoped by default, no runtime
- **Cons**: styles live in separate files (not co-located). Requires a bundler
  plugin to resolve `import styles from './Button.module.css'`. No per-component
  metadata — the CSS file is the output, not extractable data.
- **Verdict**: works with Bazel but offers no build-graph integration.

### CSS-in-JS (styled-components, Emotion)

Runtime CSS generation via tagged template literals or object styles.

- **Pros**: fully co-located, dynamic styles, great DX
- **Cons**: injects `<style>` tags at runtime. Adds JS bundle size. Hurts SSR
  performance. The industry is moving away from runtime CSS-in-JS.
- **Verdict**: wrong direction. Runtime work that should happen at build time.

### StyleX

Compile-time atomic CSS via Babel plugin.

- **Pros**: co-located, type-safe, zero runtime, atomic (deduplicated),
  produces extractable `.stylex.json` metadata per file
- **Cons**: requires Babel (no esbuild plugin), smaller ecosystem than Tailwind,
  more verbose API (`stylex.create()` + `stylex.props()`)
- **Verdict**: the only option where the build system can reason about styles
  as data flowing through the dependency graph.

## The tradeoff

StyleX forces us to use Babel for transpilation instead of esbuild (which is
10-100x faster). If StyleX ever ships an esbuild plugin, Babel can be dropped.
Until then, the build-graph integration justifies the slower transpilation — and
Bazel's caching means each file is only compiled once anyway.
