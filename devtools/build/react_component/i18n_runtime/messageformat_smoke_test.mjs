// Smoke test pinning messageformat@4's MF2 behavior. This runtime is the
// linchpin of the i18n design — if the library's MF2 parser or plural
// resolution regresses, every panallet string renders wrong in prod. The
// test exists to catch upgrades that change behavior, independent of any
// panallet integration.

import assert from "node:assert";
import { test } from "node:test";
import { MessageFormat } from "messageformat";

// MF2's default output wraps interpolated values in Unicode bidi-isolation
// characters (U+2068 / U+2069) for correct mixed-script rendering. We
// disable them here and in the runtime so catalog strings concatenate
// predictably; bidi correctness is the translator's responsibility.
const OPTS = { bidiIsolation: "none" };

test("static message", () => {
  const mf = new MessageFormat("en", "Home", OPTS);
  assert.strictEqual(mf.format(), "Home");
});

test("variable interpolation", () => {
  const mf = new MessageFormat("en", "Hello, {$name}!", OPTS);
  assert.strictEqual(mf.format({ name: "World" }), "Hello, World!");
});

test("english plural: one vs other", () => {
  const src =
    ".input {$count :number}\n.match $count\n0   {{No items}}\none {{One item}}\n*   {{{$count} items}}";
  const mf = new MessageFormat("en", src, OPTS);
  assert.strictEqual(mf.format({ count: 0 }), "No items");
  assert.strictEqual(mf.format({ count: 1 }), "One item");
  assert.strictEqual(mf.format({ count: 5 }), "5 items");
});

test("russian plural: one / few / many", () => {
  const src =
    ".input {$count :number}\n.match $count\none  {{{$count} яблоко}}\nfew  {{{$count} яблока}}\nmany {{{$count} яблок}}\n*    {{{$count} яблок}}";
  const mf = new MessageFormat("ru", src, OPTS);
  assert.strictEqual(mf.format({ count: 1 }), "1 яблоко");
  assert.strictEqual(mf.format({ count: 3 }), "3 яблока");
  assert.strictEqual(mf.format({ count: 5 }), "5 яблок");
  assert.strictEqual(mf.format({ count: 11 }), "11 яблок");
  assert.strictEqual(mf.format({ count: 21 }), "21 яблоко");
  assert.strictEqual(mf.format({ count: 22 }), "22 яблока");
});

test("french plural: 0 and 1 both in 'one' category", () => {
  const src =
    ".input {$count :number}\n.match $count\none {{{$count} élément}}\n*   {{{$count} éléments}}";
  const mf = new MessageFormat("fr", src, OPTS);
  assert.strictEqual(mf.format({ count: 0 }), "0 élément");
  assert.strictEqual(mf.format({ count: 1 }), "1 élément");
  assert.strictEqual(mf.format({ count: 2 }), "2 éléments");
});

test("spanish plural: one vs other", () => {
  const src =
    ".input {$count :number}\n.match $count\none {{{$count} concierto}}\n*   {{{$count} conciertos}}";
  const mf = new MessageFormat("es", src, OPTS);
  assert.strictEqual(mf.format({ count: 1 }), "1 concierto");
  assert.strictEqual(mf.format({ count: 0 }), "0 conciertos");
  assert.strictEqual(mf.format({ count: 2 }), "2 conciertos");
});
