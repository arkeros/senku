import { test } from "node:test";
import assert from "node:assert/strict";

import { extractRefs } from "./i18n_extract_refs.mjs";

const keysOf = (refs) => refs.map((r) => r.key);

test("extracts single <Trans id=...> call", () => {
  const refs = extractRefs({
    source: `<Trans id="layout.nav.home" />`,
    file: "Layout.tsx",
  });
  assert.deepEqual(refs, [{ file: "Layout.tsx", key: "layout.nav.home" }]);
});

test("extracts <Trans> with values prop after id", () => {
  const refs = extractRefs({
    source: `<Trans id="concerts.city.heading" values={{ city }} />`,
    file: "City.tsx",
  });
  assert.deepEqual(keysOf(refs), ["concerts.city.heading"]);
});

test("extracts <Trans> with values prop before id", () => {
  const refs = extractRefs({
    source: `<Trans values={{ city }} id="concerts.city.body" />`,
    file: "City.tsx",
  });
  assert.deepEqual(keysOf(refs), ["concerts.city.body"]);
});

test("extracts format() call", () => {
  const refs = extractRefs({
    source: `const label = format("home.button.primary");`,
    file: "Home.tsx",
  });
  assert.deepEqual(keysOf(refs), ["home.button.primary"]);
});

test("extracts useI18n().format(...) call", () => {
  const refs = extractRefs({
    source: `const t = useI18n().format("layout.logo.alt");`,
    file: "Layout.tsx",
  });
  assert.deepEqual(keysOf(refs), ["layout.logo.alt"]);
});

test("extracts format() with second argument", () => {
  const refs = extractRefs({
    source: `aria={format("concerts.city.heading", { city })}`,
    file: "City.tsx",
  });
  assert.deepEqual(keysOf(refs), ["concerts.city.heading"]);
});

test("extracts multiple refs in one source", () => {
  const refs = extractRefs({
    source: `
      <Trans id="home.heading" />
      <Trans id="home.apiLabel" values={{ url }} />
      <Button label={format("home.button.primary")} />
      <Button label={format("home.button.secondary")} />
    `,
    file: "Home.tsx",
  });
  assert.deepEqual(keysOf(refs).sort(), [
    "home.apiLabel",
    "home.button.primary",
    "home.button.secondary",
    "home.heading",
  ]);
});

test("returns empty for no references", () => {
  const refs = extractRefs({
    source: `export function Foo() { return <div>plain</div>; }`,
    file: "Foo.tsx",
  });
  assert.deepEqual(refs, []);
});

test("dynamic <Trans id={key}> is rejected as a build error", () => {
  // Coverage enforcement depends on the ref set being statically knowable.
  // Silently skipping dynamic ids would let whole codepaths bypass the
  // catalog check, so the extractor refuses them outright.
  assert.throws(
    () =>
      extractRefs({
        source: `const key = "foo"; <Trans id={key} />`,
        file: "Dynamic.tsx",
      }),
    (err) =>
      /must be a string literal/.test(err.message) &&
      err.message.includes("Dynamic.tsx"),
  );
});

test("<Trans> with no id prop is rejected", () => {
  assert.throws(
    () =>
      extractRefs({
        source: `<Trans />`,
        file: "NoId.tsx",
      }),
    (err) =>
      /requires an id/.test(err.message) && err.message.includes("NoId.tsx"),
  );
});

test("literal id wrapped in a JSX expression is accepted", () => {
  const refs = extractRefs({
    source: `<Trans id={"foo.bar"} />`,
    file: "Wrapped.tsx",
  });
  assert.deepEqual(keysOf(refs), ["foo.bar"]);
});

test("dynamic <Trans> error survives past other valid Trans tags in the same file", () => {
  // Regression guard: earlier valid matches must not swallow a later
  // invalid one. The extractor has to visit every <Trans> in the source.
  assert.throws(
    () =>
      extractRefs({
        source: `<Trans id="ok" /><Trans id={bad} />`,
        file: "Mixed.tsx",
      }),
    /must be a string literal/,
  );
});

test("single-quoted id is accepted", () => {
  const refs = extractRefs({
    source: `<Trans id='layout.nav.about' />`,
    file: "Layout.tsx",
  });
  assert.deepEqual(keysOf(refs), ["layout.nav.about"]);
});

test("tags that merely start with 'Trans' are not false-matched", () => {
  const refs = extractRefs({
    source: `<TransformWrapper id="nope" />`,
    file: "X.tsx",
  });
  assert.deepEqual(refs, []);
});

test("attaches the provided file to every ref", () => {
  const refs = extractRefs({
    source: `<Trans id="a" /><Trans id="b" />`,
    file: "examples/stylex/Foo.tsx",
  });
  assert.deepEqual(refs, [
    { file: "examples/stylex/Foo.tsx", key: "a" },
    { file: "examples/stylex/Foo.tsx", key: "b" },
  ]);
});
